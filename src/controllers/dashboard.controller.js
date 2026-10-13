const { pool } = require('../config/db');
const { resolveBusinessId } = require('./base.controller');
const { success } = require('./base.controller');

async function getSummary(businessId) {
	const [[customers], [products], [sales], [expenses], [payments], [transactions]] = await Promise.all([
		pool.query('SELECT COUNT(*) AS total FROM customers WHERE business_id = ?', [businessId]),
		pool.query('SELECT COUNT(*) AS total, COALESCE(SUM(stock), 0) AS stock_units FROM products WHERE business_id = ?', [businessId]),
		pool.query('SELECT COUNT(*) AS total, COALESCE(SUM(total), 0) AS amount FROM sales WHERE business_id = ?', [businessId]),
		pool.query('SELECT COUNT(*) AS total, COALESCE(SUM(amount), 0) AS amount FROM expenses WHERE business_id = ?', [businessId]),
		pool.query('SELECT COUNT(*) AS total, COALESCE(SUM(amount), 0) AS amount FROM payments WHERE business_id = ?', [businessId]),
		pool.query("SELECT COALESCE(SUM(CASE WHEN type = 'RECEIVED' THEN amount ELSE 0 END), 0) AS received, COALESCE(SUM(CASE WHEN type = 'GIVEN' THEN amount ELSE 0 END), 0) AS given FROM transactions WHERE business_id = ?", [businessId])
	]);
	return {
		business_id: businessId,
		customers: customers.total,
		products: products.total,
		stock_units: products.stock_units,
		sales: sales.total,
		sales_amount: sales.amount,
		expenses: expenses.total,
		expenses_amount: expenses.amount,
		payments: payments.total,
		payments_amount: payments.amount,
		khata_received: transactions.received,
		khata_given: transactions.given
	};
}

async function summary(req, res, next) {
	try {
		const businessId = await resolveBusinessId(req);
		return success(res, 'Dashboard summary retrieved successfully', await getSummary(businessId));
	} catch (error) { return next(error); }
}

module.exports = { summary, getSummary };