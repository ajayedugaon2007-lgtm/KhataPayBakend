const crypto = require('crypto');

function providerError(message, statusCode = 503) {
	return Object.assign(new Error(message), { statusCode });
}

function requiredEnv(name) {
	const value = process.env[name];
	if (typeof value !== 'string' || !value.trim()) throw providerError(`${name} is not configured`);
	return value.trim();
}

function safeEqualHex(left, right) {
	if (typeof left !== 'string' || typeof right !== 'string'
		|| !/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) return false;
	return crypto.timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

function verifyCheckoutSignature(orderId, paymentId, signature, secret) {
	if (typeof orderId !== 'string' || typeof paymentId !== 'string') return false;
	const expected = crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
	return safeEqualHex(signature, expected);
}

function verifyWebhookSignature(rawBody, signature, secret) {
	if (!Buffer.isBuffer(rawBody)) return false;
	const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
	return safeEqualHex(signature, expected);
}

async function razorpayRequest(path, { method = 'GET', body } = {}) {
	const keyId = requiredEnv('RAZORPAY_KEY_ID');
	const keySecret = requiredEnv('RAZORPAY_KEY_SECRET');
	const authorization = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
	let response;
	try {
		response = await fetch(`https://api.razorpay.com/v1${path}`, {
			method,
			headers: {
				Authorization: `Basic ${authorization}`,
				...(body ? { 'Content-Type': 'application/json' } : {})
			},
			...(body ? { body: JSON.stringify(body) } : {}),
			signal: AbortSignal.timeout(15000)
		});
	} catch (error) {
		throw Object.assign(new Error('Could not reach Razorpay; check the network and retry safely'), {
			statusCode: 502,
			cause: error
		});
	}

	let result;
	try {
		result = await response.json();
	} catch (error) {
		throw Object.assign(new Error('Razorpay returned an invalid response'), { statusCode: 502, cause: error });
	}
	if (!response.ok) {
		throw Object.assign(
			new Error(result.error && result.error.description
				? `Razorpay request failed: ${result.error.description}`
				: `Razorpay request failed with HTTP ${response.status}`),
			{ statusCode: 502 }
		);
	}
	return result;
}

function amountInPaise(amount) {
	return Math.round(Number(amount) * 100);
}

function createRazorpayProvider() {
	return {
		name: 'razorpay',
		assertConfigured() {
			requiredEnv('RAZORPAY_KEY_ID');
			requiredEnv('RAZORPAY_KEY_SECRET');
		},
		async createPayment(payment) {
			const keyId = requiredEnv('RAZORPAY_KEY_ID');
			requiredEnv('RAZORPAY_KEY_SECRET');
			const merchantName = payment.merchant.shop_name
				|| payment.merchant.business_name
				|| payment.merchant.name;
			const order = await razorpayRequest('/orders', {
				method: 'POST',
				body: {
					amount: amountInPaise(payment.amount),
					currency: 'INR',
					receipt: payment.id,
					notes: { khatapay_payment_id: payment.id }
				}
			});
			if (typeof order.id !== 'string' || !order.id || order.amount !== amountInPaise(payment.amount)
				|| order.currency !== 'INR') {
				throw providerError('Razorpay returned an order that does not match the payment request', 502);
			}
			return {
				providerOrderId: order.id,
				checkout: {
					key: keyId,
					order_id: order.id,
					amount: order.amount,
					currency: order.currency,
					name: merchantName,
					description: payment.note || `Payment to ${merchantName}`,
					method: { upi: true }
				}
			};
		},
		checkoutForPayment(payment) {
			if (!payment.provider_order_id) return null;
			const merchantName = payment.merchant_name || 'KhataPay';
			return {
				key: requiredEnv('RAZORPAY_KEY_ID'),
				order_id: payment.provider_order_id,
				amount: amountInPaise(payment.amount),
				currency: payment.currency,
				name: merchantName,
				description: payment.note || `Payment to ${merchantName}`,
				method: { upi: true }
			};
		},
		async verifyPayment(payment, checkoutDetails) {
			const orderId = checkoutDetails && checkoutDetails.razorpay_order_id;
			const paymentId = checkoutDetails && checkoutDetails.razorpay_payment_id;
			const signature = checkoutDetails && checkoutDetails.razorpay_signature;
			if (orderId !== payment.provider_order_id
				|| !verifyCheckoutSignature(orderId, paymentId, signature, requiredEnv('RAZORPAY_KEY_SECRET'))) {
				throw providerError('Razorpay checkout signature is invalid', 401);
			}
			const providerPayment = await razorpayRequest(`/payments/${encodeURIComponent(paymentId)}`);
			if (providerPayment.id !== paymentId || providerPayment.order_id !== payment.provider_order_id) {
				throw providerError('Razorpay payment does not match the stored order', 502);
			}
			if (providerPayment.amount !== amountInPaise(payment.amount) || providerPayment.currency !== payment.currency) {
				throw providerError('Razorpay payment amount or currency does not match the order', 502);
			}
			const statuses = {
				captured: 'SUCCEEDED',
				failed: 'PENDING',
				authorized: 'PENDING',
				created: 'PENDING'
			};
			if (!statuses[providerPayment.status]) {
				throw providerError('Razorpay returned an unknown payment status', 502);
			}
			return {
				status: statuses[providerPayment.status],
				providerVerified: true,
				providerPaymentId: providerPayment.id,
				providerOrderId: providerPayment.order_id,
				amount: providerPayment.amount / 100,
				currency: providerPayment.currency
			};
		},
		async parseWebhookEvent(eventId, body) {
			if (typeof eventId !== 'string' || !eventId.trim() || eventId.length > 191) {
				throw providerError('Razorpay webhook event ID is required', 400);
			}
			const eventType = body && body.event;
			const entity = body && body.payload && body.payload.payment
				&& body.payload.payment.entity;
			const eventStatuses = {
				'payment.captured': 'SUCCEEDED',
				'order.paid': 'SUCCEEDED',
				'payment.failed': 'PENDING',
				'payment.authorized': 'PENDING'
			};
			if (!eventStatuses[eventType]) return { eventId, ignored: true };
			if (!entity || typeof entity.order_id !== 'string' || !entity.order_id
				|| typeof entity.id !== 'string' || !entity.id
				|| !Number.isSafeInteger(entity.amount) || typeof entity.currency !== 'string') {
				throw providerError('Razorpay webhook payment details are incomplete', 400);
			}
			return {
				eventId,
				ignored: false,
				providerOrderId: entity.order_id,
				providerPaymentId: entity.id,
				status: eventStatuses[eventType] === 'SUCCEEDED' && entity.status !== 'captured'
					? 'PENDING'
					: eventStatuses[eventType],
				amount: entity.amount / 100,
				currency: entity.currency
			};
		},
		async verifyWebhookSignature(rawBody, signature) {
			return verifyWebhookSignature(rawBody, signature, requiredEnv('RAZORPAY_WEBHOOK_SECRET'));
		},
		async initiateBankVerification() {
			return { status: 'PENDING', providerReference: null };
		},
		async confirmBankVerification() {
			return { status: 'PENDING', providerVerified: false };
		}
	};
}

const sandboxProvider = {
	name: 'sandbox',
	async createPayment(payment) {
		return {
			providerPaymentId: `sandbox_${payment.id}`,
			status: 'PENDING',
			providerVerified: false,
			checkoutUrl: null
		};
	},
	async verifyPayment() {
		return { status: 'PENDING', providerVerified: false };
	},
	async initiateBankVerification() {
		return { status: 'PENDING', providerReference: null };
	},
	async confirmBankVerification() {
		return { status: 'PENDING', providerVerified: false };
	},
	async verifyWebhookSignature(rawBody, signature) {
		return verifyWebhookSignature(rawBody, signature, requiredEnv('PAYMENT_WEBHOOK_SECRET'));
	}
};

function getProvider() {
	const name = String(process.env.PAYMENT_PROVIDER || 'sandbox').trim().toLowerCase();
	if (name === 'sandbox') return sandboxProvider;
	if (name === 'razorpay') return createRazorpayProvider();
	throw providerError(`Unsupported PAYMENT_PROVIDER '${name}'`);
}

module.exports = {
	getProvider,
	verifyCheckoutSignature,
	verifyWebhookSignature
};
