const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const { metadata } = require('../models/crud.model');

const identifier = (value) => `\`${String(value).replace(/`/g, '``')}\``;

function requiredObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    const error = new Error(`${name} is required`);
    error.statusCode = 400;
    throw error;
  }
  return value;
}

function getRelationColumn(columns, candidates, label) {
  const column = columns.find((item) => candidates.includes(item.toLowerCase()));
  if (!column) {
    const error = new Error(`business_members table needs a ${label} column`);
    error.statusCode = 500;
    throw error;
  }
  return column;
}

async function insertRecord(connection, table, input) {
  const info = await metadata(table);
  const values = Object.entries(input).filter(([key, value]) => info.columns.includes(key) && value !== undefined);
  if (!values.length) {
    const error = new Error(`At least one valid ${table} field is required`);
    error.statusCode = 400;
    throw error;
  }

  const [result] = await connection.query(
    `INSERT INTO ${identifier(table)} (${values.map(([key]) => identifier(key)).join(', ')}) VALUES (${values.map(() => '?').join(', ')})`,
    values.map(([, value]) => value)
  );
  const [rows] = await connection.query(
    `SELECT * FROM ${identifier(table)} WHERE ${identifier(info.primaryKey)} = ? LIMIT 1`,
    [result.insertId]
  );
  return { record: rows[0], info };
}

async function registerOwner({ user, business, membership = {} }) {
  const userInput = requiredObject(user, 'user');
  const businessInput = requiredObject(business, 'business');
  const membershipInput = requiredObject(membership, 'membership');
  if (!userInput.password || typeof userInput.password !== 'string') {
    const error = new Error('user.password is required');
    error.statusCode = 400;
    throw error;
  }

  const connection = await pool.pool.getConnection();
  try {
    await connection.beginTransaction();

    const userResult = await insertRecord(connection, 'users', {
      ...userInput,
      password: await bcrypt.hash(userInput.password, 12)
    });
    const businessResult = await insertRecord(connection, 'businesses', businessInput);
    const memberInfo = await metadata('business_members');
    const userColumn = getRelationColumn(memberInfo.columns, ['user_id', 'userid', 'user'], 'user relation');
    const businessColumn = getRelationColumn(memberInfo.columns, ['business_id', 'businessid', 'business'], 'business relation');
    const roleColumn = memberInfo.columns.find((column) => ['role', 'member_role', 'member_type'].includes(column.toLowerCase()));
    const userId = userResult.record[userResult.info.primaryKey];
    const businessId = businessResult.record[businessResult.info.primaryKey];
    const memberInput = { ...membershipInput, [userColumn]: userId, [businessColumn]: businessId };
    if (roleColumn && memberInput[roleColumn] === undefined) memberInput[roleColumn] = 'owner';
    const memberResult = await insertRecord(connection, 'business_members', memberInput);

    await connection.commit();
    const safeUser = { ...userResult.record };
    for (const key of Object.keys(safeUser)) if (/password/i.test(key)) delete safeUser[key];
    return { user: safeUser, business: businessResult.record, membership: memberResult.record };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { registerOwner };