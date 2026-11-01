const express = require('express');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');
const {
	pool,
	createModel,
	createBusinessForOwner,
	listForUser,
	signToken,
	success,
	asyncHandler,
	invalid
} = require('../config/api');

const router = express.Router();
const users = createModel('users');

function safeUser(user) {
	const { password, ...result } = user;
	return result;
}

function getPasswordConfirmation(input, body) {
	return input.confirmPassword ?? input.confirm_password ?? input.password_confirmation
		?? body.confirmPassword ?? body.confirm_password ?? body.password_confirmation;
}

function validateCredentials(name, email, phone, password, confirmation, requireConfirmation = true) {
	if (typeof name !== 'string' || !name.trim()
		|| typeof email !== 'string' || !email.trim()
		|| typeof phone !== 'string' || !phone.trim()) {
		throw invalid('Name, email, and phone are required');
	}
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
		throw invalid('A valid email address is required');
	}
	if (typeof password !== 'string' || password.length < 8) {
		throw invalid('Password must be at least 8 characters long');
	}
	if (!requireConfirmation && confirmation === undefined) return;
	if (typeof confirmation !== 'string' || !confirmation) {
		throw invalid('Confirm password is required');
	}
	if (password !== confirmation) {
		throw invalid('Password and confirm password do not match');
	}
}

async function createRegistration(body, forceOwner = false, options = {}) {
	const userInput = body.user || body;
	const role = forceOwner ? 'OWNER' : String(userInput.role || body.role || (options.defaultOwner ? 'OWNER' : 'USER')).trim().toUpperCase();
	if (!['USER', 'OWNER'].includes(role)) {
		throw Object.assign(new Error('Role must be USER or OWNER'), { statusCode: 400 });
	}

	const businessInput = body.business || body.shop || {
		name: body.businessName || body.business_name || body.shop_name || body.Shop_name,
		phone: body.business_phone || body.shop_phone,
		address: body.business_address || body.shop_address || body.address || ''
	};
	validateCredentials(
		userInput.name,
		userInput.email,
		userInput.phone,
		userInput.password,
		getPasswordConfirmation(userInput, body),
		options.requireConfirmation !== false
	);
	const createBusiness = role === 'OWNER' || options.createBusinessForAllRoles;
	const businessName = businessInput.businessName ?? businessInput.shop_name ?? businessInput.Shop_name
		?? businessInput.business_name ?? businessInput.name
		?? (role === 'OWNER' ? `${String(userInput.name).trim()} Shop` : 'Personal Ledger');
	if (createBusiness && (!businessName
		|| (!options.allowOptionalBusinessAddress && role === 'OWNER'
			&& (typeof businessInput.address !== 'string' || !businessInput.address.trim())))) {
		throw invalid('Shop name and address are required for owner registration');
	}

	const passwordHash = await bcrypt.hash(userInput.password, 12);
	let connection;
	let transactionStarted = false;
	try {
		connection = await pool.getConnection();
		await connection.beginTransaction();
		transactionStarted = true;
		const user = await users.create({
			id: randomUUID(),
			name: String(userInput.name).trim(),
			phone: String(userInput.phone).trim(),
			email: userInput.email ? String(userInput.email).trim().toLowerCase() : undefined,
			password: passwordHash,
			role,
			business_name: createBusiness ? String(businessName).trim() : null,
			address: createBusiness ? (businessInput.address || '') : null
		});
		if (!user || !user.id) {
			throw Object.assign(new Error('User could not be confirmed in the database'), { statusCode: 500 });
		}
		const business = createBusiness
			? await createBusinessForOwner(user.id, {
				...businessInput,
				shop_name: businessName,
				address: businessInput.address || ''
			}, connection)
			: undefined;
		if (createBusiness && (!business || !business.id)) {
			throw Object.assign(new Error('Shop could not be confirmed in the database'), { statusCode: 500 });
		}
		await connection.commit();
		transactionStarted = false;
		return { user: safeUser(user), ...(business ? { business } : {}) };
	} catch (error) {
		if (connection && transactionStarted) {
			try {
				await connection.rollback();
			} catch (cleanupError) {
				console.error('Failed to roll back registration transaction:', cleanupError);
			}
		}
		throw error;
	} finally {
		if (connection) connection.release();
	}
}

async function register(req, res, forceOwner = false) {
	const data = await createRegistration(req.body || {}, forceOwner);
	const message = data.business ? 'Owner registration successful' : 'Registration successful';
	return success(res, message, data, 201);
}

router.post('/signup', asyncHandler((req, res) => register(req, res)));
router.post('/signup-owner', asyncHandler((req, res) => register(req, res, true)));
router.post('/register', async (req, res, next) => {
	try {
		const data = await createRegistration(req.body || {}, false, {
			defaultOwner: true,
			requireConfirmation: false,
			allowOptionalBusinessAddress: true,
			createBusinessForAllRoles: true
		});
		const business = data.business;
		const businessName = business && business.name;
		const user = {
			...data.user,
			role: String(data.user.role).toLowerCase(),
			businessName: businessName || '',
			address: business && business.address || ''
		};
		const token = signToken({
			id: user.id,
			userId: user.id,
			email: user.email,
			role: user.role
		}, '30d');
		return res.status(201).json({ message: 'Registration successful', token, user });
	} catch (error) {
		if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'ACCOUNT_EXISTS' });
		return next(error);
	}
});
router.post('/register-owner', asyncHandler((req, res) => register(req, res, true)));
router.post('/login', asyncHandler(async (req, res) => {
	const { identifier, emailOrPhone, phone, email, password } = req.body || {};
	const loginValue = identifier || emailOrPhone || phone || email;
	if (typeof loginValue !== 'string' || !loginValue.trim() || typeof password !== 'string' || !password) {
		throw invalid('Phone/email and password are required');
	}
	const cleanLoginValue = loginValue.trim();
	const [rows] = await pool.query(
		'SELECT * FROM users WHERE phone = ? OR LOWER(email) = ? LIMIT 1',
		[cleanLoginValue, cleanLoginValue.toLowerCase()]
	);
	const user = rows[0];
	if (!user || !(await bcrypt.compare(password, user.password))) {
		throw Object.assign(new Error('Invalid credentials'), { statusCode: 401 });
	}
	const userBusinesses = await listForUser(user.id);
	const business = userBusinesses[0];
	const safe = {
		...safeUser(user),
		role: String(user.role).toLowerCase(),
		businessName: business && business.name || '',
		address: business && business.address || ''
	};
	const token = signToken({
		id: user.id,
		userId: user.id,
		email: user.email,
		role: safe.role
	}, '30d');
	return res.json({ message: 'Login successful', token, user: safe });
}));

module.exports = router;
