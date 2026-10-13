const { createModel } = require('./base.model');
const { pool } = require('../config/db');
const model = createModel('users');

model.findByLogin = async (identifier) => {
	const [rows] = await pool.query(
		' SELECT * FROM users WHERE phone = ? OR email = ? LIMIT 1',
		[String(identifier), String(identifier).toLowerCase()]
	);
	return rows[0] || null;
};

module.exports = model;