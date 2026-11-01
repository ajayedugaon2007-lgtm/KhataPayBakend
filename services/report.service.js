const { pool } = require('../config/db');

async function getSummary(userId) {
	const [[customers], [products], [invoices], [expenses], [payments], [transactions]] = await Promise.all([
		pool.query('SELECT COUNT(*) AS total FROM customers WHERE user_id = ?', [userId]),
		pool.query('SELECT COUNT(*) AS total, COALESCE(SUM(stock), 0) AS stock_units FROM products WHERE user_id = ?', [userId]),
		pool.query('SELECT COUNT(*) AS total, COALESCE(SUM(amount), 0) AS amount FROM invoices WHERE user_id = ?', [userId]),
		pool.query('SELECT COUNT(*) AS total, COALESCE(SUM(amount), 0) AS amount FROM expenses WHERE user_id = ?', [userId]),
		pool.query('SELECT COUNT(*) AS total, COALESCE(SUM(amount), 0) AS amount FROM payments WHERE user_id = ?', [userId]),
		pool.query('SELECT COALESCE(SUM(CASE WHEN is_gave = 0 THEN amount ELSE 0 END), 0) AS received, COALESCE(SUM(CASE WHEN is_gave = 1 THEN amount ELSE 0 END), 0) AS given FROM transactions WHERE user_id = ?', [userId])
	]);

	return {
		user_id: userId,
		customers: customers.total,
		products: products.total,
		stock_units: products.stock_units,
		invoices: invoices.total,
		invoices_amount: invoices.amount,
		expenses: expenses.total,
		expenses_amount: expenses.amount,
		payments: payments.total,
		payments_amount: payments.amount,
		khata_received: transactions.received,
		khata_given: transactions.given
	};
}

module.exports = { getSummary };
