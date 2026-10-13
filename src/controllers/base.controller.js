const Business = require('../models/Business');

function success(res, message, data, statusCode = 200) {
    return res.status(statusCode).json({ success: true, message, data });
}

function invalid(message) {
    return Object.assign(new Error(message), { statusCode: 400 });
}

async function resolveBusinessId(req) {
    const requested = req.params.businessId || req.query.business_id || req.body?.business_id;
    if (requested !== undefined && requested !== '') {
        await Business.assertAccess(requested, req.user.id);
        return requested;
    }
    const businesses = await Business.listForUser(req.user.id);
    if (businesses.length === 0) throw Object.assign(new Error('Create or join a business before using this screen'), { statusCode: 404 });
    if (businesses.length > 1) throw invalid('business_id is required when the user has multiple businesses');
    return businesses[0].id;
}

function createResourceController(model, resourceName) {
    return {
        list: async (req, res, next) => {
            try {
                const businessId = await resolveBusinessId(req);
                return success(res, `${resourceName} retrieved successfully`, await model.list(businessId));
            } catch (error) { return next(error); }
        },
        get: async (req, res, next) => {
            try {
                const businessId = await resolveBusinessId(req);
                const record = await model.findById(req.params.id, businessId);
                if (!record) throw Object.assign(new Error(`${resourceName} not found`), { statusCode: 404 });
                return success(res, `${resourceName} retrieved successfully`, record);
            } catch (error) { return next(error); }
        },
        create: async (req, res, next) => {
            try {
                if (!req.body || Array.isArray(req.body) || typeof req.body !== 'object') throw invalid('A JSON object is required');
                const businessId = await resolveBusinessId(req);
                const record = await model.create({ ...req.body, business_id: businessId });
                return success(res, `${resourceName} created successfully`, record, 201);
            } catch (error) { return next(error); }
        },
        update: async (req, res, next) => {
            try {
                if (!req.body || Array.isArray(req.body) || typeof req.body !== 'object') throw invalid('A JSON object is required');
                const businessId = await resolveBusinessId(req);
                return success(res, `${resourceName} updated successfully`, await model.update(req.params.id, req.body, businessId));
            } catch (error) { return next(error); }
        },
        remove: async (req, res, next) => {
            try {
                const businessId = await resolveBusinessId(req);
                return success(res, `${resourceName} deleted successfully`, await model.remove(req.params.id, businessId));
            } catch (error) { return next(error); }
        }
    };
}

module.exports = { createResourceController, resolveBusinessId, success };