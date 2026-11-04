const { pool } = require('../config/db');
const { fail, generateMerchantQr, getQrForUser } = require('../services/payment.service');

function validateVpa(value) {
	if (typeof value !== 'string' || value.length > 100 || !/^[A-Za-z0-9][A-Za-z0-9._-]{1,99}@[A-Za-z][A-Za-z0-9.-]{1,49}$/.test(value.trim())) {
		fail('vpa must be a valid UPI ID');
	}
	return value.trim().toLowerCase();
}

async function create(req, res) {
	const body = req.body || {};
	const vpa = validateVpa(body.vpa);
	if (typeof body.display_name !== 'string' || !body.display_name.trim() || body.display_name.trim().length > 150) {
		fail('display_name is required and must be at most 150 characters');
	}
	await pool.query(
		`INSERT INTO upi_profiles (user_id, vpa, display_name, verification_status)
		 VALUES (?, ?, ?, 'UNVERIFIED')
		 ON DUPLICATE KEY UPDATE
		 vpa = IF(user_id = VALUES(user_id), VALUES(vpa), vpa),
		 display_name = IF(user_id = VALUES(user_id), VALUES(display_name), display_name),
		 verification_status = IF(user_id = VALUES(user_id), 'UNVERIFIED', verification_status),
		 updated_at = IF(user_id = VALUES(user_id), CURRENT_TIMESTAMP, updated_at)`,
		[req.user.id, vpa, body.display_name.trim()]
	);
	const [rows] = await pool.query(
		'SELECT user_id, vpa, display_name, verification_status, created_at, updated_at FROM upi_profiles WHERE user_id = ?',
		[req.user.id]
	);
	if (!rows[0]) fail('This UPI ID is already linked to another account', 409);
	return res.status(201).json({
		success: true,
		message: 'UPI profile saved; ownership has not been verified',
		data: rows[0]
	});
}

async function profile(req, res) {
	const [rows] = await pool.query(
		'SELECT user_id, vpa, display_name, verification_status, created_at, updated_at FROM upi_profiles WHERE user_id = ?',
		[req.user.id]
	);
	if (!rows[0]) fail('UPI profile not found', 404);
	return res.json({ success: true, message: 'UPI profile retrieved successfully', data: rows[0] });
}

async function generateQr(req, res) {
	const qr = await generateMerchantQr(req.user.id);
	return res.status(201).json({
		success: true,
		message: 'Merchant QR generated; sandbox QR does not initiate a bank transfer',
		data: qr
	});
}

async function getQr(req, res) {
	const qr = await getQrForUser(req.user.id);
	if (!qr) fail('Merchant QR not found; generate one first', 404);
	return res.json({ success: true, message: 'Merchant QR retrieved successfully', data: qr });
}

module.exports = { create, profile, generateQr, getQr };
