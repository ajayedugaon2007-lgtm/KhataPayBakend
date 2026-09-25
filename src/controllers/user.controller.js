const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { success } = require('../utils/response');
const userModel = require('../models/user.model');
const createCrudController = require('./crud.controller');

function withoutPassword(record) {
  if (!record) return record;
  const result = { ...record };
  for (const key of Object.keys(result)) if (/password/i.test(key)) delete result[key];
  return result;
}

const crud = createCrudController({
  list: async () => (await userModel.list()).map(withoutPassword),
  findById: async (id) => withoutPassword(await userModel.findById(id)),
  create: async (body) => withoutPassword(await userModel.create({ ...body, password: await hashPassword(body.password) })),
  update: async (id, body) => withoutPassword(await userModel.update(id, { ...body, ...(body.password ? { password: await hashPassword(body.password) } : {}) })),
  remove: userModel.remove
}, 'User');

async function hashPassword(password) {
  if (!password || typeof password !== 'string') { const error = new Error('A password is required'); error.statusCode = 400; throw error; }
  return bcrypt.hash(password, 12);
}

async function register(req, res, next) {
  try { return success(res, 'User registered successfully', await crud.create(req, { status: () => {} }, next), 201); } catch (error) { return next(error); }
}

async function registerUser(req, res, next) {
  try {
    const record = await userModel.create({ ...req.body, password: await hashPassword(req.body.password) });
    return success(res, 'User registered successfully', withoutPassword(record), 201);
  } catch (error) { return next(error); }
}

async function login(req, res, next) {
  try {
    const { identifier, email, username, phone, password } = req.body;
    const loginValue = identifier || email || username || phone;
    if (!loginValue || !password) return res.status(400).json({ success: false, message: 'Identifier and password are required' });
    const user = await userModel.findForLogin(loginValue);
    if (!user || !(await bcrypt.compare(password, user.passwordValue))) return res.status(401).json({ success: false, message: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    return success(res, 'Login successful', { token, user: withoutPassword(user.record) });
  } catch (error) { return next(error); }
}

module.exports = { ...crud, register: registerUser, login };