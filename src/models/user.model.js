const { createCrudModel } = require('./crud.model');
const pool = require('../config/database');

const model = createCrudModel('users');

model.findForLogin = async (value) => {
  const info = await model.metadata('users');
  const loginColumns = info.columns.filter((column) => /email|username|phone|mobile/i.test(column));
  const passwordColumn = info.columns.find((column) => /password/i.test(column));
  if (!passwordColumn || !loginColumns.length) throw Object.assign(new Error('Users table needs an identifier and password column for login'), { statusCode: 500 });
  const [rows] = await pool.query(`SELECT * FROM \`users\` WHERE ${loginColumns.map((column) => `\`${column.replace(/`/g, '``')}\` = ?`).join(' OR ')} LIMIT 1`, loginColumns.map(() => value));
  return rows[0] ? { id: rows[0][info.primaryKey], passwordValue: rows[0][passwordColumn], record: rows[0] } : null;
};

module.exports = model;