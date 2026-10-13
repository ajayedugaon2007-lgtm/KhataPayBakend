const dashboardController = require('./dashboard.controller');
const { resolveBusinessId, success } = require('./base.controller');

async function summary(req, res, next) {
    try {
        const businessId = await resolveBusinessId(req);
        const report = await dashboardController.getSummary(businessId);
        return success(res, 'Business report retrieved successfully', report);
    } catch (error) { return next(error); }
}

module.exports = { summary };
