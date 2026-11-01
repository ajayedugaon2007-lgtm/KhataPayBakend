const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');

const pool = mysql.createPool({
	host: process.env.DB_HOST || 'localhost',
	port: Number(process.env.DB_PORT || 3306),
	user: process.env.DB_USER || 'root',
	password: process.env.DB_PASSWORD || '',
	database: process.env.DB_NAME || 'khatapay_db',
	waitForConnections: true,
	connectionLimit: 10,
	queueLimit: 0
});

const metadataCache = new Map();
const quote = (identifier) => `\`${String(identifier).replace(/`/g, '``')}\``;

async function connectDatabase() {
	const connection = await pool.getConnection();
	try {
		await connection.ping();
	} finally {
		connection.release();
	}
}

async function getMetadata(table) {
	if (!metadataCache.has(table)) {
		const [rows] = await pool.query(
			'SELECT COLUMN_NAME, COLUMN_KEY, EXTRA FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION',
			[table]
		);
		if (rows.length === 0) {
			throw Object.assign(new Error(`Database table '${table}' is not available`), { statusCode: 500 });
		}
		metadataCache.set(table, {
			columns: rows.map((row) => row.COLUMN_NAME),
			primaryKey: (rows.find((row) => row.COLUMN_KEY === 'PRI') || rows[0]).COLUMN_NAME,
			autoIncrement: rows.some((row) => row.COLUMN_KEY === 'PRI' && row.EXTRA.split(' ').includes('auto_increment'))
		});
	}
	return metadataCache.get(table);
}

function filteredValues(input, columns) {
	return Object.entries(input || {}).filter(([key, value]) => columns.includes(key) && value !== undefined);
}

function createModel(table) {
	return {
		table,
		async metadata() {
			return getMetadata(table);
		},
		async list(userId) {
			const info = await getMetadata(table);
			const scoped = userId !== undefined && info.columns.includes('user_id');
			const [rows] = await pool.query(
				`SELECT * FROM ${quote(table)}${scoped ? ` WHERE ${quote('user_id')} = ?` : ''} ORDER BY ${quote(info.primaryKey)} DESC`,
				scoped ? [userId] : []
			);
			return rows;
		},
		async findById(id, userId, executor = pool) {
			const info = await getMetadata(table);
			const scoped = userId !== undefined && info.columns.includes('user_id');
			const [rows] = await executor.query(
				`SELECT * FROM ${quote(table)} WHERE ${quote(info.primaryKey)} = ?${scoped ? ` AND ${quote('user_id')} = ?` : ''} LIMIT 1`,
				scoped ? [id, userId] : [id]
			);
			return rows[0] || null;
		},
		async create(input, executor = pool) {
			const info = await getMetadata(table);
			const values = filteredValues(input, info.columns)
				.filter(([key]) => !(info.autoIncrement && key === info.primaryKey));
			if (values.length === 0) throw Object.assign(new Error('No valid fields were provided'), { statusCode: 400 });
			const [result] = await executor.query(
				`INSERT INTO ${quote(table)} (${values.map(([key]) => quote(key)).join(', ')}) VALUES (${values.map(() => '?').join(', ')})`,
				values.map(([, value]) => value)
			);
			const id = input[info.primaryKey] ?? result.insertId;
			return this.findById(id, input.user_id, executor);
		},
		async update(id, input, userId) {
			const info = await getMetadata(table);
			const values = filteredValues(input, info.columns).filter(([key]) => key !== info.primaryKey && key !== 'user_id');
			if (values.length === 0) throw Object.assign(new Error('No valid fields to update were provided'), { statusCode: 400 });
			const scoped = userId !== undefined && info.columns.includes('user_id');
			await pool.query(
				`UPDATE ${quote(table)} SET ${values.map(([key]) => `${quote(key)} = ?`).join(', ')} WHERE ${quote(info.primaryKey)} = ?${scoped ? ` AND ${quote('user_id')} = ?` : ''}`,
				[...values.map(([, value]) => value), id, ...(scoped ? [userId] : [])]
			);
			const record = await this.findById(id, userId);
			if (!record) throw Object.assign(new Error('Record not found'), { statusCode: 404 });
			return record;
		},
		async remove(id, userId) {
			const info = await getMetadata(table);
			const scoped = userId !== undefined && info.columns.includes('user_id');
			const [result] = await pool.query(
				`DELETE FROM ${quote(table)} WHERE ${quote(info.primaryKey)} = ?${scoped ? ` AND ${quote('user_id')} = ?` : ''}`,
				scoped ? [id, userId] : [id]
			);
			if (!result.affectedRows) throw Object.assign(new Error('Record not found'), { statusCode: 404 });
			return { id };
		}
	};
}

const businesses = createModel('businesses');

async function listForUser(userId) {
	return businesses.list(userId);
}

async function findForUser(id, userId) {
	return businesses.findById(id, userId);
}

async function assertBusinessAccess(id, userId) {
	const business = await findForUser(id, userId);
	if (!business) throw Object.assign(new Error('Business not found'), { statusCode: 404 });
	return business;
}

async function createBusinessForOwner(userId, input, executor = pool) {
	const businessName = input.name ?? input.shop_name ?? input.Shop_name
		?? input.business_name ?? input.businessName;
	if (typeof businessName !== 'string' || !businessName.trim()) {
		throw Object.assign(new Error('Business name is required'), { statusCode: 400 });
	}
	return businesses.create({
		user_id: userId,
		name: businessName.trim(),
		type: input.type || 'General Retail',
		gst: input.gst || 'Not Provided',
		address: input.address || '',
		is_active: input.is_active ?? 1
	}, executor);
}

function signToken(payload, expiresIn = process.env.JWT_EXPIRES_IN || '7d') {
	if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not configured');
	return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
}

function verifyToken(token) {
	if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not configured');
	return jwt.verify(token, process.env.JWT_SECRET);
}

function authenticate(req, res, next) {
	const authorization = req.headers.authorization || '';
	if (!authorization.startsWith('Bearer ')) {
		return res.status(401).json({ success: false, message: 'Authorization header is required' });
	}
	try {
		req.user = verifyToken(authorization.slice(7));
		return next();
	} catch {
		return res.status(401).json({ success: false, message: 'Invalid or expired token' });
	}
}

function success(res, message, data, statusCode = 200) {
	return res.status(statusCode).json({ success: true, message, data });
}

function invalid(message) {
	return Object.assign(new Error(message), { statusCode: 400 });
}

function asyncHandler(handler) {
	return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function createCrudRouter(table, resourceName) {
	const express = require('express');
	const model = createModel(table);
	const router = express.Router();
	router.use(authenticate);
	router.get('/', asyncHandler(async (req, res) => {
		return success(res, `${resourceName} retrieved successfully`, await model.list(req.user.id));
	}));
	router.get('/:id', asyncHandler(async (req, res) => {
		const record = await model.findById(req.params.id, req.user.id);
		if (!record) throw Object.assign(new Error(`${resourceName} not found`), { statusCode: 404 });
		return success(res, `${resourceName} retrieved successfully`, record);
	}));
	router.post('/', asyncHandler(async (req, res) => {
		if (!req.body || Array.isArray(req.body) || typeof req.body !== 'object') throw invalid('A JSON object is required');
		const record = await model.create({ ...req.body, user_id: req.user.id });
		return success(res, `${resourceName} created successfully`, record, 201);
	}));
	router.put('/:id', asyncHandler(async (req, res) => {
		if (!req.body || Array.isArray(req.body) || typeof req.body !== 'object') throw invalid('A JSON object is required');
		return success(res, `${resourceName} updated successfully`, await model.update(req.params.id, req.body, req.user.id));
	}));
	router.delete('/:id', asyncHandler(async (req, res) => {
		return success(res, `${resourceName} deleted successfully`, await model.remove(req.params.id, req.user.id));
	}));
	return router;
}

module.exports = {
	pool,
	connectDatabase,
	getMetadata,
	createModel,
	businesses,
	listForUser,
	findForUser,
	assertBusinessAccess,
	createBusinessForOwner,
	signToken,
	authenticate,
	success,
	invalid,
	asyncHandler,
	createCrudRouter
};
