const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Business = require('../models/Business');
const { signToken } = require('../config/jwt');
const { success } = require('./base.controller');

function safeUser(user) {
    const { password, ...result } = user;
    return result;
}

function validateCredentials(name, phone, password) {
    if (!name || !phone || typeof password !== 'string' || password.length < 8) {
        throw Object.assign(new Error('Name, phone, and a password of at least 8 characters are required'), { statusCode: 400 });
    }
}

async function register(req, res, next) {
    try {
        const { name, phone, email, password } = req.body || {};
        validateCredentials(name, phone, password);
        const user = await User.create({
            name: String(name).trim(),
            phone: String(phone).trim(),
            email: email ? String(email).trim().toLowerCase() : undefined,
            password: await bcrypt.hash(password, 12),
            role: 'USER'
        });
        return success(res, 'Registration successful', { user: safeUser(user) }, 201);
    } catch (error) { return next(error); }
}

async function registerOwner(req, res, next) {
    let user;
    try {
        const body = req.body || {};
        const userInput = body.user || body;
        const businessInput = body.business || {
            name: body.business_name,
            phone: body.business_phone,
            address: body.business_address
        };
        validateCredentials(userInput.name, userInput.phone, userInput.password);
        if (!businessInput.name) throw Object.assign(new Error('Business name is required'), { statusCode: 400 });
        user = await User.create({
            name: String(userInput.name).trim(),
            phone: String(userInput.phone).trim(),
            email: userInput.email ? String(userInput.email).trim().toLowerCase() : undefined,
            password: await bcrypt.hash(userInput.password, 12),
            role: 'OWNER'
        });
        const business = await Business.createForOwner(user.id, businessInput);
        return success(res, 'Owner registration successful', { user: safeUser(user), business }, 201);
    } catch (error) {
        if (user?.id) await User.remove(user.id).catch(() => { });
        return next(error);
    }
}

async function login(req, res, next) {
    try {
        const { identifier, phone, email, password } = req.body || {};
        const loginValue = identifier || phone || email;
        if (!loginValue || !password) throw Object.assign(new Error('Phone/email and password are required'), { statusCode: 400 });
        const user = await User.findByLogin(loginValue);
        if (!user || !(await bcrypt.compare(password, user.password))) {
            throw Object.assign(new Error('Invalid credentials'), { statusCode: 401 });
        }
        return success(res, 'Login successful', { token: signToken({ id: user.id }), user: safeUser(user) });
    } catch (error) { return next(error); }
}

module.exports = { register, registerOwner, login };
