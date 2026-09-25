const pool = require('../config/database');

const metadataCache = new Map();
const identifier = (value) => `\`${String(value).replace(/`/g, '``')}\``;

async function metadata(table) {
  if (!metadataCache.has(table)) {
    const [columns] = await pool.query(
      'SELECT COLUMN_NAME, COLUMN_KEY FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION',
      [table]
    );
    if (!columns.length) {
      const error = new Error(`Table '${table}' was not found`);
      error.statusCode = 500;
      throw error;
    }
    metadataCache.set(table, {
      columns: columns.map((column) => column.COLUMN_NAME),
      primaryKey: (columns.find((column) => column.COLUMN_KEY === 'PRI') || columns[0]).COLUMN_NAME
    });
  }
  return metadataCache.get(table);
}

function filteredValues(input, columns) {
  return Object.entries(input || {}).filter(([key, value]) => columns.includes(key) && value !== undefined);
}

function notFound(table, id) {
  const error = new Error(`${table} record '${id}' was not found`);
  error.statusCode = 404;
  return error;
}

function createCrudModel(table) {
  return {
    async list() {
      const info = await metadata(table);
      const [rows] = await pool.query(`SELECT * FROM ${identifier(table)}`);
      return rows;
    },
    async findById(id) {
      const info = await metadata(table);
      const [rows] = await pool.query(`SELECT * FROM ${identifier(table)} WHERE ${identifier(info.primaryKey)} = ? LIMIT 1`, [id]);
      return rows[0] || null;
    },
    async create(input) {
      const info = await metadata(table);
      const values = filteredValues(input, info.columns);
      if (!values.length) throw Object.assign(new Error('At least one valid table field is required'), { statusCode: 400 });
      const [result] = await pool.query(`INSERT INTO ${identifier(table)} (${values.map(([key]) => identifier(key)).join(', ')}) VALUES (${values.map(() => '?').join(', ')})`, values.map(([, value]) => value));
      return this.findById(result.insertId);
    },
    async update(id, input) {
      const info = await metadata(table);
      const values = filteredValues(input, info.columns).filter(([key]) => key !== info.primaryKey);
      if (!values.length) throw Object.assign(new Error('At least one valid field to update is required'), { statusCode: 400 });
      const [result] = await pool.query(`UPDATE ${identifier(table)} SET ${values.map(([key]) => `${identifier(key)} = ?`).join(', ')} WHERE ${identifier(info.primaryKey)} = ?`, [...values.map(([, value]) => value), id]);
      if (!result.affectedRows) throw notFound(table, id);
      return this.findById(id);
    },
    async remove(id) {
      const info = await metadata(table);
      const [result] = await pool.query(`DELETE FROM ${identifier(table)} WHERE ${identifier(info.primaryKey)} = ?`, [id]);
      if (!result.affectedRows) throw notFound(table, id);
      return { id };
    },
    metadata
  };
}

module.exports = { createCrudModel, metadata };