const { pool } = require('../config/database');
const { metadata } = require('../models/crud.model');
const { success } = require('../utils/response');

const identifier = (value) => `\`${String(value).replace(/`/g, '``')}\``;
const tableMetrics = {
	customers: { table: 'customers' },
	transactions: { table: 'transactions' },
	products: { table: 'products' },
	invoices: { table: 'invoices' },
	sales: { table: 'sales', amountColumns: ['total_amount', 'grand_total', 'amount', 'total'] },
	expenses: { table: 'expenses', amountColumns: ['amount', 'total_amount', 'total'] },
	payments: { table: 'payments', amountColumns: ['amount', 'total_amount', 'total'] }
};

function findColumn(columns, candidates) {
	return columns.find((column) => candidates.includes(column.toLowerCase()));
}

async function getBusinessId(userId, requestedBusinessId) {
	const membership = await metadata('business_members');
	const userColumn = findColumn(membership.columns, ['user_id', 'userid', 'user']);
	const businessColumn = findColumn(membership.columns, ['business_id', 'businessid', 'business']);
	if (!userColumn || !businessColumn) {
		throw Object.assign(new Error('Business membership schema is incomplete'), { statusCode: 500 });
	}

	const values = [userId];
	let where = `${identifier(userColumn)} = ?`;
	if (requestedBusinessId !== undefined) {
		values.push(requestedBusinessId);
		where += ` AND ${identifier(businessColumn)} = ?`;
	}
	const [rows] = await pool.query(
		`SELECT ${identifier(businessColumn)} AS business_id FROM ${identifier('business_members')} WHERE ${where} LIMIT 1`,
		values
	);
	if (!rows.length) throw Object.assign(new Error('Business not found for this user'), { statusCode: 404 });
	return rows[0].business_id;
}

async function getMetric({ table, amountColumns }, businessId) {
	let info;
	try {
		info = await metadata(table);
	} catch (error) {
		if (error.message.startsWith('Table ') && error.message.endsWith(' was not found')) return null;
		throw error;
	}

	const businessColumn = findColumn(info.columns, ['business_id', 'businessid', 'business']);
	if (!businessColumn) return null;

	const amountColumn = amountColumns && findColumn(info.columns, amountColumns);
	const aggregate = amountColumn
		? `COUNT(*) AS count, COALESCE(SUM(${identifier(amountColumn)}), 0) AS total`
		: 'COUNT(*) AS count';
	const [rows] = await pool.query(
		`SELECT ${aggregate} FROM ${identifier(table)} WHERE ${identifier(businessColumn)} = ?`,
		[businessId]
	);
	return rows[0];
}

async function summary(req, res, next) {
	try {
		const businessId = await getBusinessId(req.user.id, req.query.business_id);
		const entries = await Promise.all(
			Object.entries(tableMetrics).map(async ([key, metric]) => [key, await getMetric(metric, businessId)])
		);
		return success(res, 'Dashboard summary retrieved successfully', {
			business_id: businessId,
			...Object.fromEntries(entries)
		});
	} catch (error) {
		return next(error);
	}
}

module.exports = { summary };