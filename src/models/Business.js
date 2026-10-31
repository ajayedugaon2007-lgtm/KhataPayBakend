const { createModel } = require('./base.model');
const { pool } = require('../config/db');
const { getMetadata } = require('./base.model');
const model = createModel('businesses');
const quote = (identifier) => `\`${String(identifier).replace(/`/g, '``')}\``;

async function hasUserMembership(connection = pool) {
    const [rows] = await connection.query(
        "SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'business_members' AND COLUMN_NAME = 'user_id' LIMIT 1"
    );
    return rows.length > 0;
}

model.listForUser = async (userId) => {
    const hasMembership = await hasUserMembership();
    const [rows] = await pool.query(
        `SELECT DISTINCT b.* FROM businesses b${hasMembership ? ' LEFT JOIN business_members bm ON bm.business_id = b.id' : ''} WHERE b.owner_id = ?${hasMembership ? ' OR bm.user_id = ?' : ''} ORDER BY b.id DESC`,
        hasMembership ? [userId, userId] : [userId]
    );
    return rows;
};

model.findForUser = async (id, userId) => {
    const hasMembership = await hasUserMembership();
    const [rows] = await pool.query(
        `SELECT DISTINCT b.* FROM businesses b${hasMembership ? ' LEFT JOIN business_members bm ON bm.business_id = b.id' : ''} WHERE b.id = ? AND (b.owner_id = ?${hasMembership ? ' OR bm.user_id = ?' : ''}) LIMIT 1`,
        hasMembership ? [id, userId, userId] : [id, userId]
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
        const nameColumn = ['shop_name', 'business_name', 'name']
            .map((candidate) => info.columns.find((column) => column.toLowerCase() === candidate))
            .find(Boolean);
        if (!nameColumn) {
            throw Object.assign(new Error('Businesses table must include a shop name column'), { statusCode: 500 });
        }
        const businessName = input.shop_name ?? input.Shop_name ?? input.business_name ?? input.name;
        if (!businessName) {
            throw Object.assign(new Error('Business name is required'), { statusCode: 400 });
        }
        const businessInput = { ...input, [nameColumn]: businessName, owner_id: userId };
        for (const key of Object.keys(businessInput)) {
            if (['name', 'business_name', 'shop_name'].includes(key.toLowerCase()) && key !== nameColumn) {
                delete businessInput[key];
            }
        }
        const values = Object.entries(businessInput).filter(([key, value]) => info.columns.includes(key) && key !== info.primaryKey && value !== undefined);
        const [result] = await connection.query(
            `INSERT INTO businesses (${values.map(([key]) => quote(key)).join(', ')}) VALUES (${values.map(() => '?').join(', ')})`,
            values.map(([, value]) => value)
        );
        if (await hasUserMembership(connection)) {
            await connection.query('INSERT INTO business_members (business_id, user_id, role) VALUES (?, ?, ?)', [result.insertId, userId, 'owner']);
        }
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