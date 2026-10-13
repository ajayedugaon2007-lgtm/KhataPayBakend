const { pool } = require('../config/db');

const metadataCache = new Map();
const quote = (identifier) => `\`${String(identifier).replace(/`/g, '``')}\``;

async function getMetadata(table) {
    if (!metadataCache.has(table)) {
        const [rows] = await pool.query(
            'SELECT COLUMN_NAME, COLUMN_KEY FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION',
            [table]
        );
        if (rows.length === 0) {
            throw Object.assign(new Error(`Database table '${table}' is not available`), { statusCode: 500 });
        }
        metadataCache.set(table, {
            columns: rows.map((row) => row.COLUMN_NAME),
            primaryKey: (rows.find((row) => row.COLUMN_KEY === 'PRI') || rows[0]).COLUMN_NAME
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
        async list(businessId) {
            const info = await getMetadata(table);
            const scoped = businessId !== undefined && info.columns.includes('business_id');
            const [rows] = await pool.query(
                `SELECT * FROM ${quote(table)}${scoped ? ` WHERE ${quote('business_id')} = ?` : ''} ORDER BY ${quote(info.primaryKey)} DESC`,
                scoped ? [businessId] : []
            );
            return rows;
        },
        async findById(id, businessId) {
            const info = await getMetadata(table);
            const scoped = businessId !== undefined && info.columns.includes('business_id');
            const [rows] = await pool.query(
                `SELECT * FROM ${quote(table)} WHERE ${quote(info.primaryKey)} = ?${scoped ? ` AND ${quote('business_id')} = ?` : ''} LIMIT 1`,
                scoped ? [id, businessId] : [id]
            );
            return rows[0] || null;
        },
        async create(input) {
            const info = await getMetadata(table);
            const values = filteredValues(input, info.columns).filter(([key]) => key !== info.primaryKey);
            if (values.length === 0) throw Object.assign(new Error('No valid fields were provided'), { statusCode: 400 });
            const [result] = await pool.query(
                `INSERT INTO ${quote(table)} (${values.map(([key]) => quote(key)).join(', ')}) VALUES (${values.map(() => '?').join(', ')})`,
                values.map(([, value]) => value)
            );
            return this.findById(result.insertId);
        },
        async update(id, input, businessId) {
            const info = await getMetadata(table);
            const values = filteredValues(input, info.columns).filter(([key]) => key !== info.primaryKey && key !== 'business_id');
            if (values.length === 0) throw Object.assign(new Error('No valid fields to update were provided'), { statusCode: 400 });
            const scoped = businessId !== undefined && info.columns.includes('business_id');
            const [result] = await pool.query(
                `UPDATE ${quote(table)} SET ${values.map(([key]) => `${quote(key)} = ?`).join(', ')} WHERE ${quote(info.primaryKey)} = ?${scoped ? ` AND ${quote('business_id')} = ?` : ''}`,
                [...values.map(([, value]) => value), id, ...(scoped ? [businessId] : [])]
            );
            if (!result.affectedRows) throw Object.assign(new Error('Record not found'), { statusCode: 404 });
            return this.findById(id, businessId);
        },
        async remove(id, businessId) {
            const info = await getMetadata(table);
            const scoped = businessId !== undefined && info.columns.includes('business_id');
            const [result] = await pool.query(
                `DELETE FROM ${quote(table)} WHERE ${quote(info.primaryKey)} = ?${scoped ? ` AND ${quote('business_id')} = ?` : ''}`,
                scoped ? [id, businessId] : [id]
            );
            if (!result.affectedRows) throw Object.assign(new Error('Record not found'), { statusCode: 404 });
            return { id };
        }
    };
}

module.exports = { createModel, getMetadata };