const crypto = require('crypto');
const { pool } = require('../config/db');
const { getProvider } = require('./payment-provider.service');

function fail(message, statusCode = 400) {
	throw Object.assign(new Error(message), { statusCode });
}

function validateAmount(input) {
	const value = typeof input === 'number' ? String(input) : input;
	if (typeof value !== 'string' || !/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(value)) {
		fail('Amount must be a positive number with up to two decimal places');
	}
	const paise = Math.round(Number(value) * 100);
	if (!Number.isSafeInteger(paise) || paise < 1 || paise > 100000000) {
		fail('Amount must be between 0.01 and 1,000,000.00');
	}
	return (paise / 100).toFixed(2);
}

function validateIdempotencyKey(value) {
	if (typeof value !== 'string' || value.length < 8 || value.length > 128
		|| !/^[A-Za-z0-9._:-]+$/.test(value)) {
		fail('Provide an Idempotency-Key header (8-128 letters, digits, or ._:- characters)');
	}
	return value;
}

function assertSamePayment(record, merchantUserId, amount, qrId, note) {
	if (record.merchant_user_id !== merchantUserId || Number(record.amount).toFixed(2) !== amount
		|| record.qr_id !== qrId || record.note !== note) {
		fail('Idempotency-Key was already used with different payment details', 409);
	}
}

function checkoutFor(provider, payment) {
	return provider.name === 'razorpay' ? provider.checkoutForPayment(payment) : null;
}

function qrSecret() {
	const secret = process.env.QR_SIGNING_SECRET || process.env.JWT_SECRET;
	if (!secret) fail('QR_SIGNING_SECRET or JWT_SECRET must be configured', 500);
	return secret;
}

function signMerchantId(userId) {
	return crypto.createHmac('sha256', qrSecret()).update(String(userId)).digest('hex');
}

function merchantQrPayload(userId) {
	return `khatapay://merchant?merchant_id=${encodeURIComponent(userId)}&signature=${signMerchantId(userId)}`;
}

function safeEqualHex(left, right) {
	if (typeof left !== 'string' || typeof right !== 'string' || !/^[a-f0-9]{64}$/i.test(left)
		|| !/^[a-f0-9]{64}$/i.test(right)) return false;
	return crypto.timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

function parseMerchantQr(payload) {
	if (typeof payload !== 'string' || payload.length > 2048) fail('A valid KhataPay merchant QR payload is required');
	let url;
	try {
		url = new URL(payload);
	} catch {
		fail('Invalid merchant QR payload');
	}
	const merchantId = url.searchParams.get('merchant_id');
	const signature = url.searchParams.get('signature');
	if (url.protocol !== 'khatapay:' || url.hostname !== 'merchant' || !merchantId
		|| !safeEqualHex(signature, signMerchantId(merchantId))) {
		fail('Invalid or tampered merchant QR payload', 400);
	}
	return merchantId;
}

async function findMerchant(userId, { requireLocalBankLink = true } = {}) {
	const [rows] = await pool.query(
		`SELECT u.id, u.name, u.business_name, b.name AS shop_name, p.vpa, p.verification_status AS upi_status
		 FROM users u
		 LEFT JOIN businesses b ON b.user_id = u.id AND b.is_active = 1
		 LEFT JOIN upi_profiles p ON p.user_id = u.id
		 WHERE u.id = ? LIMIT 1`,
		[userId]
	);
	if (!rows[0]) fail('Merchant not found', 404);
	if (requireLocalBankLink) {
		if (!rows[0].vpa) fail('Merchant UPI profile is not set up', 409);
		const [accounts] = await pool.query(
			'SELECT id FROM bank_accounts WHERE user_id = ? AND status = ? LIMIT 1',
			[userId, 'ACTIVE']
		);
		if (!accounts[0]) fail('Merchant must link a bank account before accepting payment requests', 409);
	}
	return rows[0];
}

async function getQrForUser(userId) {
	const [rows] = await pool.query('SELECT * FROM merchant_qrs WHERE user_id = ? LIMIT 1', [userId]);
	return rows[0] || null;
}

async function generateMerchantQr(userId) {
	await findMerchant(userId);
	const id = crypto.randomUUID();
	const payload = merchantQrPayload(userId);
	await pool.query(
		`INSERT INTO merchant_qrs (id, user_id, qr_payload, status)
		 VALUES (?, ?, ?, 'ACTIVE')
		 ON DUPLICATE KEY UPDATE qr_payload = VALUES(qr_payload), status = 'ACTIVE', updated_at = CURRENT_TIMESTAMP`,
		[id, userId, payload]
	);
	return getQrForUser(userId);
}

async function scanMerchantQr(payload) {
	const merchantId = parseMerchantQr(payload);
	const qr = await getQrForUser(merchantId);
	if (!qr || qr.status !== 'ACTIVE' || qr.qr_payload !== payload) fail('Merchant QR is not active', 404);
	const merchant = await findMerchant(merchantId);
	return {
		merchant: {
			id: merchant.id,
			name: merchant.shop_name || merchant.business_name || merchant.name,
			vpa: merchant.vpa,
			upiVerificationStatus: merchant.upi_status
		},
		qrId: qr.id,
		paymentStatus: 'PENDING_ONLY_SANDBOX'
	};
}

async function createPayment({ payerUserId, merchantUserId, amount, idempotencyKey, qrId = null, note = null }) {
	const normalizedAmount = validateAmount(amount);
	if (typeof merchantUserId !== 'string' || !merchantUserId.trim()) fail('merchant_user_id is required');
	const normalizedMerchantId = merchantUserId.trim();
	const key = validateIdempotencyKey(idempotencyKey);
	if (note !== null && (typeof note !== 'string' || note.length > 200)) fail('note must be 200 characters or fewer');

	const [existing] = await pool.query(
		'SELECT * FROM khatapay_payment_records WHERE user_id = ? AND idempotency_key = ? LIMIT 1',
		[payerUserId, key]
	);
	if (existing[0]) {
		assertSamePayment(existing[0], normalizedMerchantId, normalizedAmount, qrId, note);
		const provider = getProvider();
		return { payment: existing[0], reused: true, checkout: checkoutFor(provider, existing[0]) };
	}

	const provider = getProvider();
	if (typeof provider.assertConfigured === 'function') provider.assertConfigured();
	const merchant = await findMerchant(normalizedMerchantId, {
		requireLocalBankLink: provider.name !== 'razorpay'
	});
	const id = crypto.randomUUID();
	try {
		await pool.query(
			`INSERT INTO khatapay_payment_records
			 (id, user_id, merchant_user_id, qr_id, idempotency_key, amount, currency, status, provider, note)
			 VALUES (?, ?, ?, ?, ?, ?, 'INR', 'PENDING', ?, ?)`,
			[id, payerUserId, normalizedMerchantId, qrId, key, normalizedAmount, provider.name, note]
		);
	} catch (error) {
		if (error.code !== 'ER_DUP_ENTRY') throw error;
		const [duplicates] = await pool.query(
			'SELECT * FROM khatapay_payment_records WHERE user_id = ? AND idempotency_key = ? LIMIT 1',
			[payerUserId, key]
		);
		if (!duplicates[0]) throw error;
		assertSamePayment(duplicates[0], normalizedMerchantId, normalizedAmount, qrId, note);
		return { payment: duplicates[0], reused: true, checkout: checkoutFor(provider, duplicates[0]) };
	}

	let created;
	try {
		created = await provider.createPayment({ id, amount: normalizedAmount, merchant, note });
		await pool.query(
			'UPDATE khatapay_payment_records SET provider_order_id = ?, provider_payment_id = ? WHERE id = ?',
			[created.providerOrderId || null, created.providerPaymentId || null, id]
		);
	} catch (error) {
		try {
			await pool.query(
				`DELETE FROM khatapay_payment_records
				 WHERE id = ? AND provider_order_id IS NULL AND provider_payment_id IS NULL`,
				[id]
			);
		} catch (cleanupError) {
			console.error('Failed to remove payment order reservation after provider error:', cleanupError);
		}
		throw error;
	}
	const [rows] = await pool.query('SELECT * FROM khatapay_payment_records WHERE id = ? LIMIT 1', [id]);
	return { payment: rows[0], reused: false, checkout: created.checkout || null };
}

async function getPaymentForUser(id, userId) {
	const [rows] = await pool.query(
		`SELECT * FROM khatapay_payment_records
		 WHERE id = ? AND (user_id = ? OR merchant_user_id = ?) LIMIT 1`,
		[id, userId, userId]
	);
	return rows[0] || null;
}

async function verifyPaymentForUser(id, userId, checkoutDetails) {
	const payment = await getPaymentForUser(id, userId);
	if (!payment) fail('Payment not found', 404);
	if (payment.status !== 'PENDING') return { payment, providerVerified: true };
	const result = await getProvider().verifyPayment(payment, checkoutDetails);
	if (!result.providerVerified) return { payment, providerVerified: false };
	if (result.amount !== undefined && Number(result.amount).toFixed(2) !== Number(payment.amount).toFixed(2)) {
		fail('Provider payment amount does not match the stored order', 502);
	}
	if (result.currency && result.currency !== payment.currency) fail('Provider payment currency does not match the stored order', 502);
	if (result.providerOrderId && result.providerOrderId !== payment.provider_order_id) {
		fail('Provider order reference does not match the stored payment', 502);
	}
	const allowed = ['PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED'];
	if (!allowed.includes(result.status)) fail('Provider returned an unknown payment status', 502);
	await pool.query(
		`UPDATE khatapay_payment_records
		 SET status = ?, provider_payment_id = COALESCE(?, provider_payment_id), updated_at = CURRENT_TIMESTAMP
		 WHERE id = ? AND status = ?`,
		[result.status, result.providerPaymentId || null, id, 'PENDING']
	);
	return { payment: await getPaymentForUser(id, userId), providerVerified: true };
}

async function receiveWebhook(rawBody, signature, body, webhookEventId) {
	const provider = getProvider();
	const valid = await provider.verifyWebhookSignature(rawBody, signature);
	if (!valid) fail('Invalid payment webhook signature', 401);

	if (provider.name === 'razorpay') {
		const event = await provider.parseWebhookEvent(webhookEventId, body);
		if (event.ignored) return { duplicate: false, outcome: 'IGNORED_EVENT' };
		const [payments] = await pool.query(
			'SELECT * FROM khatapay_payment_records WHERE provider = ? AND provider_order_id = ? LIMIT 1',
			[provider.name, event.providerOrderId]
		);
		const payment = payments[0];
		if (!payment) fail('Payment not found for this Razorpay order', 404);
		if (Number(payment.amount).toFixed(2) !== Number(event.amount).toFixed(2)
			|| payment.currency !== event.currency) {
			fail('Razorpay webhook amount or currency does not match the stored order', 502);
		}
		const connection = await pool.getConnection();
		let transactionStarted = false;
		try {
			await connection.beginTransaction();
			transactionStarted = true;
			await connection.query(
				'INSERT INTO payment_webhook_events (event_id, provider, payment_id, outcome) VALUES (?, ?, ?, ?)',
				[event.eventId, provider.name, payment.id, 'PROCESSING']
			);
			await connection.query(
				`UPDATE khatapay_payment_records
				 SET status = ?, provider_payment_id = ?, updated_at = CURRENT_TIMESTAMP
				 WHERE id = ? AND status = 'PENDING'`,
				[event.status, event.providerPaymentId, payment.id]
			);
			await connection.query(
				'UPDATE payment_webhook_events SET outcome = ? WHERE event_id = ?',
				['PROVIDER_VERIFIED', event.eventId]
			);
			await connection.commit();
			transactionStarted = false;
			return { duplicate: false, outcome: 'PROVIDER_VERIFIED' };
		} catch (error) {
			if (transactionStarted) {
				try {
					await connection.rollback();
				} catch (cleanupError) {
					console.error('Failed to roll back payment webhook transaction:', cleanupError);
				}
			}
			if (error.code === 'ER_DUP_ENTRY') return { duplicate: true, outcome: 'DUPLICATE' };
			throw error;
		} finally {
			connection.release();
		}
	}

	if (!body || typeof body !== 'object' || Array.isArray(body)
		|| typeof body.event_id !== 'string' || !body.event_id.trim()
		|| typeof body.provider_payment_id !== 'string' || !body.provider_payment_id.trim()) {
		fail('Webhook requires event_id and provider_payment_id');
	}
	const [payments] = await pool.query(
		'SELECT * FROM khatapay_payment_records WHERE provider_payment_id = ? LIMIT 1',
		[body.provider_payment_id]
	);
	if (!payments[0]) fail('Payment not found for this provider reference', 404);
	const connection = await pool.getConnection();
	let transactionStarted = false;
	try {
		await connection.beginTransaction();
		transactionStarted = true;
		await connection.query(
			'INSERT INTO payment_webhook_events (event_id, provider, payment_id, outcome) VALUES (?, ?, ?, ?)',
			[body.event_id, provider.name, payments[0].id, 'PROCESSING']
		);
		const verified = await provider.verifyPayment(payments[0]);
		let outcome = 'IGNORED_UNVERIFIED';
		if (verified.providerVerified) {
			if (verified.amount !== undefined && Number(verified.amount).toFixed(2) !== Number(payments[0].amount).toFixed(2)) {
				fail('Provider payment amount does not match the stored order', 502);
			}
			if (verified.currency && verified.currency !== payments[0].currency) fail('Provider payment currency does not match the stored order', 502);
			if (!['PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED'].includes(verified.status)) {
				fail('Provider returned an unknown payment status', 502);
			}
			await connection.query(
				'UPDATE khatapay_payment_records SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = ?',
				[verified.status, payments[0].id, 'PENDING']
			);
			outcome = 'PROVIDER_VERIFIED';
		}
		await connection.query(
			'UPDATE payment_webhook_events SET outcome = ? WHERE event_id = ?',
			[outcome, body.event_id]
		);
		await connection.commit();
		transactionStarted = false;
		return { duplicate: false, outcome };
	} catch (error) {
		if (transactionStarted) {
			try {
				await connection.rollback();
			} catch (cleanupError) {
				console.error('Failed to roll back payment webhook transaction:', cleanupError);
			}
			transactionStarted = false;
		}
		if (error.code === 'ER_DUP_ENTRY') return { duplicate: true, outcome: 'DUPLICATE' };
		throw error;
	} finally {
		connection.release();
	}
}

module.exports = {
	fail,
	validateAmount,
	validateIdempotencyKey,
	merchantQrPayload,
	parseMerchantQr,
	findMerchant,
	getQrForUser,
	generateMerchantQr,
	scanMerchantQr,
	createPayment,
	getPaymentForUser,
	verifyPaymentForUser,
	receiveWebhook
};
