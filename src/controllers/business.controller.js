const Business = require('../models/Business');
const { success } = require('./base.controller');

async function requireOwner(business, userId) {
    if (Number(business.owner_id) !== Number(userId)) {
        throw Object.assign(new Error('Only the business owner can change business settings'), { statusCode: 403 });
    }
}

async function list(req, res, next) {
    try { return success(res, 'Businesses retrieved successfully', await Business.listForUser(req.user.id)); }
    catch (error) { return next(error); }
}

async function get(req, res, next) {
    try { return success(res, 'Business retrieved successfully', await Business.assertAccess(req.params.id, req.user.id)); }
    catch (error) { return next(error); }
}

async function create(req, res, next) {
    try {
        const business = await Business.createForOwner(req.user.id, req.body || {});
        return success(res, 'Business created successfully', business, 201);
    } catch (error) { return next(error); }
}

async function update(req, res, next) {
    try {
        const business = await Business.assertAccess(req.params.id, req.user.id);
        await requireOwner(business, req.user.id);
        const allowed = ['name', 'Business_name', 'email', 'phone', 'address'];
        const changes = Object.fromEntries(Object.entries(req.body || {}).filter(([key]) => allowed.includes(key)));
        const updated = await Business.update(req.params.id, changes);
        return success(res, 'Business updated successfully', updated);
    } catch (error) { return next(error); }
}

async function remove(req, res, next) {
    try {
        const business = await Business.assertAccess(req.params.id, req.user.id);
        await requireOwner(business, req.user.id);
        return success(res, 'Business deleted successfully', await Business.remove(req.params.id));
    } catch (error) { return next(error); }
}

module.exports = { list, get, create, update, remove };