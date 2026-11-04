const crypto = require('crypto');
const { pool } = require('../config/db');
const { getProvider } = require('../services/payment-provider.service');
const { fail } = require('../services/payment.service');

const publicAccountColumns = `id, user_id, provider, account_holder_name, bank_name,
	account_last4, ifsc_code, verification_status, status, created_at, updated_at`;

function requireText(value, label, maxLength) {
	if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
		fail(`${label} is required and must be at most ${maxLength} characters`);
	}
	return value.trim();
}

async function link(req, res) {
	const body = req.body || {};
	if (['account_number', 'accountNumber', 'account_no', 'accountNo', 'password', 'pin', 'otp'].some((key) => key in body)) {
		fail('Do not send bank account numbers, passwords, PINs, or OTPs; use the provider-issued account reference');
	}
	const provider = getProvider();
	const providerAccountRef = requireText(body.provider_account_ref, 'provider_account_ref', 255);
	const holder = requireText(body.account_holder_name, 'account_holder_name', 150);
	const bankName = requireText(body.bank_name, 'bank_name', 150);
	const last4 = requireText(body.account_last4, 'account_last4', 4);
	if (!/^\d{4}$/.test(last4)) fail('account_last4 must contain exactly four digits');
	const ifsc = body.ifsc_code === undefined ? null : requireText(body.ifsc_code, 'ifsc_code', 11).toUpperCase();
	if (ifsc !== null && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) fail('ifsc_code is invalid');
	const id = crypto.randomUUID();
	await pool.query(
		`INSERT INTO bank_accounts
		 (id, user_id, provider, provider_account_ref, account_holder_name, bank_name, account_last4, ifsc_code)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		[id, req.user.id, provider.name, providerAccountRef, holder, bankName, last4, ifsc]
	);
	const [rows] = await pool.query(`SELECT ${publicAccountColumns} FROM bank_accounts WHERE id = ?`, [id]);
	return res.status(201).json({
		success: true,
		message: 'Bank account linked; verification is still pending',
		data: rows[0]
	});
}

async function list(req, res) {
	const [rows] = await pool.query(
		`SELECT ${publicAccountColumns} FROM bank_accounts WHERE user_id = ? ORDER BY created_at DESC`,
		[req.user.id]
	);
	return res.json({ success: true, message: 'Bank accounts retrieved successfully', data: rows });
}

async function get(req, res) {
	const [rows] = await pool.query(
		`SELECT ${publicAccountColumns} FROM bank_accounts WHERE user_id = ? AND id = ? LIMIT 1`,
		[req.user.id, req.params.id]
	);
	if (!rows[0]) fail('Bank account not found', 404);
	return res.json({ success: true, message: 'Bank account retrieved successfully', data: rows[0] });
}

async function remove(req, res) {
	const [result] = await pool.query(
		'DELETE FROM bank_accounts WHERE user_id = ? AND id = ?',
		[req.user.id, req.params.id]
	);
	if (!result.affectedRows) fail('Bank account not found', 404);
	return res.json({ success: true, message: 'Bank account unlinked', data: { id: req.params.id } });
}

async function initiate(req, res) {
	const provider = getProvider();
	const accountId = req.body && req.body.bank_account_id;
	if (typeof accountId !== 'string' || !accountId) fail('bank_account_id is required');
	const [accounts] = await pool.query(
		'SELECT id, provider_account_ref FROM bank_accounts WHERE user_id = ? AND id = ? AND status = ? LIMIT 1',
		[req.user.id, accountId, 'ACTIVE']
	);
	if (!accounts[0]) fail('Bank account not found', 404);
	const result = await provider.initiateBankVerification(accounts[0]);
	const id = crypto.randomUUID();
	await pool.query(
		`INSERT INTO bank_verifications (id, user_id, bank_account_id, provider, provider_reference, status)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		[id, req.user.id, accountId, provider.name, result.providerReference, result.status]
	);
	return res.status(202).json({
		success: true,
		message: 'Bank verification is pending; sandbox mode does not contact a bank or issue an OTP',
		data: { id, bank_account_id: accountId, status: result.status }
	});
}

async function confirm(req, res) {
	const { verification_id: verificationId, otp } = req.body || {};
	if (typeof verificationId !== 'string' || !verificationId) fail('verification_id is required');
	if (otp !== undefined && (typeof otp !== 'string' || otp.length > 32)) fail('otp must be a string of at most 32 characters');
	const [rows] = await pool.query(
		`SELECT v.id, v.status, v.provider_reference, a.provider_account_ref
		 FROM bank_verifications v
		 JOIN bank_accounts a ON a.id = v.bank_account_id AND a.user_id = v.user_id
		 WHERE v.user_id = ? AND v.id = ? LIMIT 1`,
		[req.user.id, verificationId]
	);
	const verification = rows[0];
	if (!verification) fail('Bank verification not found', 404);
	if (verification.status === 'VERIFIED') {
		return res.json({ success: true, message: 'Bank account already verified', data: { id: verificationId, status: 'VERIFIED' } });
	}
	const result = await getProvider().confirmBankVerification(verification, otp);
	if (!result.providerVerified) {
		return res.status(202).json({
			success: true,
			message: 'Verification remains pending; sandbox cannot verify a bank account',
			data: { id: verificationId, status: 'PENDING' }
		});
	}
	await pool.query(
		'UPDATE bank_verifications SET status = ? WHERE id = ? AND user_id = ?',
		[result.status, verificationId, req.user.id]
	);
	await pool.query(
		'UPDATE bank_accounts SET verification_status = ? WHERE id = (SELECT bank_account_id FROM bank_verifications WHERE id = ?)',
		[result.status, verificationId]
	);
	return res.json({ success: true, message: 'Bank verification status updated', data: { id: verificationId, status: result.status } });
}

async function status(req, res) {
	const [rows] = await pool.query(
		`SELECT v.id, v.bank_account_id, v.status, v.created_at, v.updated_at
		 FROM bank_verifications v WHERE v.user_id = ? ORDER BY v.created_at DESC LIMIT 1`,
		[req.user.id]
	);
	return res.json({
		success: true,
		message: 'Bank verification status retrieved',
		data: rows[0] || { status: 'NOT_STARTED' }
	});
}

module.exports = { link, list, get, remove, initiate, confirm, status };
