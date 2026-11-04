const { pool } = require('../config/db');
const {
	fail,
	createPayment,
	getPaymentForUser,
	verifyPaymentForUser,
	scanMerchantQr,
	parseMerchantQr,
	getQrForUser,
	receiveWebhook
} = require('../services/payment.service');

function idempotencyKey(req) {
	return req.get('Idempotency-Key') || (req.body && req.body.idempotency_key);
}

async function create(req, res) {
	const body = req.body || {};
	const result = await createPayment({
		payerUserId: req.user.id,
		merchantUserId: body.merchant_user_id,
		amount: body.amount,
		idempotencyKey: idempotencyKey(req),
		note: body.note === undefined ? null : body.note
	});
	return res.status(result.reused ? 200 : 202).json({
		success: true,
		message: result.checkout
			? 'Razorpay UPI order created; complete payment in the client checkout'
			: 'Payment request created; sandbox payments remain pending until verified by an approved provider',
		data: {
			...result.payment,
			...(result.checkout ? { checkout: result.checkout } : {}),
			reused: result.reused
		}
	});
}

async function verify(req, res) {
	const body = req.body || {};
	const paymentId = body.payment_id;
	if (typeof paymentId !== 'string' || !paymentId) fail('payment_id is required');
	const result = await verifyPaymentForUser(paymentId, req.user.id, body);
	return res.status(result.providerVerified ? 200 : 202).json({
		success: true,
		message: result.payment.status === 'SUCCEEDED'
			? 'Payment captured successfully'
			: result.providerVerified ? 'Payment checked with provider; it remains pending' : 'Payment is not verified; it remains pending',
		data: { payment: result.payment, provider_verified: result.providerVerified }
	});
}

async function history(req, res) {
	const limit = req.query.limit === undefined ? 50 : Number(req.query.limit);
	const offset = req.query.offset === undefined ? 0 : Number(req.query.offset);
	if (!Number.isInteger(limit) || limit < 1 || limit > 100
		|| !Number.isInteger(offset) || offset < 0 || offset > 100000) {
		fail('limit must be 1-100 and offset must be a non-negative integer');
	}
	const [rows] = await pool.query(
		`SELECT * FROM khatapay_payment_records
		 WHERE user_id = ? OR merchant_user_id = ?
		 ORDER BY created_at DESC LIMIT ? OFFSET ?`,
		[req.user.id, req.user.id, limit, offset]
	);
	return res.json({ success: true, message: 'Payment history retrieved successfully', data: rows });
}

async function get(req, res) {
	const modernPayment = await getPaymentForUser(req.params.id, req.user.id);
	if (modernPayment) {
		return res.json({ success: true, message: 'Payment retrieved successfully', data: modernPayment });
	}
	// Preserve the pre-existing /api/payments/:id resource endpoint.
	const [legacyRows] = await pool.query(
		'SELECT * FROM payments WHERE id = ? AND user_id = ? LIMIT 1',
		[req.params.id, req.user.id]
	);
	if (!legacyRows[0]) fail('Payment not found', 404);
	return res.json({ success: true, message: 'Payment retrieved successfully', data: legacyRows[0] });
}

async function scan(req, res) {
	const result = await scanMerchantQr(req.body && req.body.qr_payload);
	return res.json({ success: true, message: 'Merchant QR scanned successfully', data: result });
}

async function payQr(req, res) {
	const body = req.body || {};
	const merchantUserId = parseMerchantQr(body.qr_payload);
	const merchantQr = await getQrForUser(merchantUserId);
	if (!merchantQr || merchantQr.status !== 'ACTIVE' || merchantQr.qr_payload !== body.qr_payload) {
		fail('Merchant QR is not active', 404);
	}
	const result = await createPayment({
		payerUserId: req.user.id,
		merchantUserId,
		amount: body.amount,
		idempotencyKey: idempotencyKey(req),
		qrId: merchantQr.id,
		note: body.note === undefined ? null : body.note
	});
	return res.status(result.reused ? 200 : 202).json({
		success: true,
		message: result.checkout
			? 'Razorpay UPI order created; complete payment in the client checkout'
			: 'QR payment request created; sandbox payments remain pending and do not transfer funds',
		data: {
			...result.payment,
			...(result.checkout ? { checkout: result.checkout } : {}),
			reused: result.reused
		}
	});
}

async function myQr(req, res) {
	const qr = await getQrForUser(req.user.id);
	if (!qr) fail('Merchant QR not found; generate one first', 404);
	return res.json({ success: true, message: 'Merchant QR retrieved successfully', data: qr });
}

async function webhook(req, res) {
	if (!Buffer.isBuffer(req.rawBody)) fail('Raw webhook body is unavailable; configure JSON raw-body capture', 400);
	const result = await receiveWebhook(
		req.rawBody,
		req.get('x-razorpay-signature') || req.get('x-provider-signature'),
		req.body,
		req.get('x-razorpay-event-id')
	);
	return res.status(result.duplicate ? 200 : 202).json({
		success: true,
		message: result.duplicate ? 'Duplicate webhook ignored' : 'Payment webhook accepted',
		data: result
	});
}

module.exports = { create, verify, history, get, scan, payQr, myQr, webhook };
