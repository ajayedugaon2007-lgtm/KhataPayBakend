const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { after, before, test } = require('node:test');
const { getProvider } = require('../services/payment-provider.service');

const originalEnv = {
	PAYMENT_PROVIDER: process.env.PAYMENT_PROVIDER,
	RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
	RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET,
	RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET
};
const originalFetch = global.fetch;

before(() => {
	process.env.PAYMENT_PROVIDER = 'razorpay';
	process.env.RAZORPAY_KEY_ID = 'rzp_live_public';
	process.env.RAZORPAY_KEY_SECRET = 'test-secret';
	process.env.RAZORPAY_WEBHOOK_SECRET = 'webhook-secret';
});

after(() => {
	for (const [key, value] of Object.entries(originalEnv)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	global.fetch = originalFetch;
});

test('creates an INR order and returns only public checkout configuration', async () => {
	let request;
	global.fetch = async (url, options) => {
		request = { url, options };
		return {
			ok: true,
			status: 200,
			json: async () => ({ id: 'order_123', amount: 12500, currency: 'INR' })
		};
	};

	const result = await getProvider().createPayment({
		id: 'internal-payment-id',
		amount: '125.00',
		note: 'Invoice 1',
		merchant: { name: 'Shop Owner', business_name: 'Shop' }
	});

	assert.equal(request.url, 'https://api.razorpay.com/v1/orders');
	assert.equal(request.options.method, 'POST');
	assert.deepEqual(JSON.parse(request.options.body), {
		amount: 12500,
		currency: 'INR',
		receipt: 'internal-payment-id',
		notes: { khatapay_payment_id: 'internal-payment-id' }
	});
	assert.equal(result.providerOrderId, 'order_123');
	assert.equal(result.checkout.key, 'rzp_live_public');
	assert.equal(result.checkout.order_id, 'order_123');
	assert.deepEqual(result.checkout.method, { upi: true });
	assert.equal(JSON.stringify(result).includes('test-secret'), false);
});

test('requires a valid checkout signature and verifies captured payment with Razorpay', async () => {
	const orderId = 'order_123';
	const paymentId = 'pay_456';
	const signature = crypto.createHmac('sha256', 'test-secret')
		.update(`${orderId}|${paymentId}`).digest('hex');
	let requestCount = 0;
	global.fetch = async (url) => {
		requestCount += 1;
		assert.equal(url, `https://api.razorpay.com/v1/payments/${paymentId}`);
		return {
			ok: true,
			status: 200,
			json: async () => ({
				id: paymentId,
				order_id: orderId,
				amount: 12500,
				currency: 'INR',
				status: 'captured'
			})
		};
	};
	const provider = getProvider();
	const payment = { provider_order_id: orderId, amount: '125.00', currency: 'INR' };

	await assert.rejects(
		() => provider.verifyPayment(payment, {
			razorpay_order_id: orderId,
			razorpay_payment_id: paymentId,
			razorpay_signature: '0'.repeat(64)
		}),
		{ statusCode: 401 }
	);
	assert.equal(requestCount, 0);

	const result = await provider.verifyPayment(payment, {
		razorpay_order_id: orderId,
		razorpay_payment_id: paymentId,
		razorpay_signature: signature
	});
	assert.equal(result.status, 'SUCCEEDED');
	assert.equal(result.providerPaymentId, paymentId);
	assert.equal(requestCount, 1);
});

test('validates signed webhook events and leaves failed attempts retryable', async () => {
	const rawBody = Buffer.from('{"event":"payment.failed"}');
	const signature = crypto.createHmac('sha256', 'webhook-secret').update(rawBody).digest('hex');
	const provider = getProvider();

	assert.equal(await provider.verifyWebhookSignature(rawBody, signature), true);
	assert.equal(await provider.verifyWebhookSignature(rawBody, '0'.repeat(64)), false);
	assert.deepEqual(await provider.parseWebhookEvent('evt_1', {
		event: 'payment.failed',
		payload: {
			payment: {
				entity: {
					id: 'pay_456',
					order_id: 'order_123',
					amount: 12500,
					currency: 'INR'
				}
			}
		}
	}), {
		eventId: 'evt_1',
		ignored: false,
		providerOrderId: 'order_123',
		providerPaymentId: 'pay_456',
		status: 'PENDING',
		amount: 125,
		currency: 'INR'
	});
});
