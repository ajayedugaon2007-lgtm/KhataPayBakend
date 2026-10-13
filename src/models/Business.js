const { createModel } = require('./base.model');
const { pool } = require('../config/db');
const { getMetadata } = require('./base.model');
const model = createModel('businesses');
const quote = (identifier) => `\`${String(identifier).replace(/`/g, '``')}\``;

model.listForUser = async (userId) => {
    const [rows] = await pool.query(
        ' SELECT DISTINCT b.* FROM businesses b LEFT JOIN business_members bm ON bm.business_id = b.id WHERE b.owner_id = ? OR bm.user_id = ? ORDER BY b.id DESC',
        [userId, userId]
    );
    return rows;
};

model.findForUser = async (id, userId) => {
    const [rows] = await pool.query(
        ' SELECT DISTINCT b.* FROM businesses b LEFT JOIN business_members bm ON bm.business_id = b.id WHERE b.id = ? AND (b.owner_id = ? OR bm.user_id = ?) LIMIT 1',
        [id, userId, userId]
    );
    return rows[0] || null;
};

model.assertAccess = async (id, userId) => {
    const business = await model.findForUser(id, userId);
    if (!business) throw Object.assign(new Error('Business not found'), { statusCode: 404 });
    return business;
};

model.createForOwner = async (userId, input) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const info = await getMetadata('businesses');
        const values = Object.entries({ ...input, owner_id: userId }).filter(([key, value]) => info.columns.includes(key) && key !== info.primaryKey && value !== undefined);
        if (!values.some(([key]) => key.toLowerCase() === 'name')) {
            throw Object.assign(new Error('Business name is required'), { statusCode: 400 });
        }
        const [result] = await connection.query(
            `INSERT INTO businesses (${values.map(([key]) => quote(key)).join(', ')}) VALUES (${values.map(() => '?').join(', ')})`,
            values.map(([, value]) => value)
        );
        await connection.query('INSERT INTO business_members (business_id, user_id, role) VALUES (?, ?, ?)', [result.insertId, userId, 'owner']);
        await connection.commit();
        return model.findForUser(result.insertId, userId);
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

module.exports = model;