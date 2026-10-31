const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Business = require('../models/Business');
const { signToken } = require('../config/jwt');
const { success } = require('./base.controller');

function safeUser(user) {
    const { password, ...result } = user;
    return result;
}

function invalid(message) {
    return Object.assign(new Error(message), { statusCode: 400 });
}

function getPasswordConfirmation(input, body) {
    return input.confirmPassword ?? input.confirm_password ?? input.password_confirmation
        ?? body.confirmPassword ?? body.confirm_password ?? body.password_confirmation;
}

function validateCredentials(name, email, phone, password, confirmation) {
    if (typeof name !== 'string' || !name.trim()
        || typeof email !== 'string' || !email.trim()
        || typeof phone !== 'string' || !phone.trim()) {
        throw invalid('Name, email, and phone are required');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        throw invalid('A valid email address is required');
    }
    if (typeof password !== 'string' || password.length < 8) {
        throw invalid('Password must be at least 8 characters long');
    }
    if (typeof confirmation !== 'string' || !confirmation) {
        throw invalid('Confirm password is required');
    }
    if (password !== confirmation) {
        throw invalid('Password and confirm password do not match');
    }
}

async function createRegistration(body, forceOwner = false) {
    const userInput = body.user || body;
    const role = forceOwner ? 'OWNER' : String(userInput.role || body.role || 'USER').trim().toUpperCase();
    if (!['USER', 'OWNER'].includes(role)) {
        throw Object.assign(new Error('Role must be USER or OWNER'), { statusCode: 400 });
    }

    const businessInput = body.business || body.shop || {
        name: body.business_name || body.shop_name || body.Shop_name,
        phone: body.business_phone || body.shop_phone,
        address: body.business_address || body.shop_address || body.address
    };
    validateCredentials(
        userInput.name,
        userInput.email,
        userInput.phone,
        userInput.password,
        getPasswordConfirmation(userInput, body)
    );
    if (role === 'OWNER' && (!businessInput.name && !businessInput.shop_name && !businessInput.Shop_name
        || typeof businessInput.address !== 'string' || !businessInput.address.trim())) {
        throw invalid('Shop name and address are required for owner registration');
    }

    let user;
    try {
        user = await User.create({
            name: String(userInput.name).trim(),
            phone: String(userInput.phone).trim(),
            email: userInput.email ? String(userInput.email).trim().toLowerCase() : undefined,
            password: await bcrypt.hash(userInput.password, 12),
            role
        });
        const business = role === 'OWNER' ? await Business.createForOwner(user.id, businessInput) : undefined;
        return { user: safeUser(user), ...(business ? { business } : {}) };
    } catch (error) {
        if (user?.id) {
            try {
                await User.remove(user.id);
            } catch (cleanupError) {
                console.error('Failed to remove user after registration failed:', cleanupError);
            }
        }
        throw error;
    }
}

async function register(req, res, next) {
    try {
        const data = await createRegistration(req.body || {});
        const message = data.business ? 'Owner registration successful' : 'Registration successful';
        return success(res, message, data, 201);
    } catch (error) { return next(error); }
}

async function registerOwner(req, res, next) {
    try {
        const data = await createRegistration(req.body || {}, true);
        return success(res, 'Owner registration successful', data, 201);
    } catch (error) { return next(error); }
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
