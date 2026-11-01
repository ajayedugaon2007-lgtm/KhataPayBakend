const express = require('express');
const {
	businesses,
	authenticate,
	createBusinessForOwner,
	listForUser,
	assertBusinessAccess,
	success,
	asyncHandler
} = require('../config/db');

const router = express.Router();
router.use(authenticate);

router.get('/', asyncHandler(async (req, res) =>
	success(res, 'Businesses retrieved successfully', await listForUser(req.user.id))));

router.post('/', asyncHandler(async (req, res) =>
	success(res, 'Business created successfully', await createBusinessForOwner(req.user.id, req.body || {}), 201)));

router.get('/:id', asyncHandler(async (req, res) =>
	success(res, 'Business retrieved successfully', await assertBusinessAccess(req.params.id, req.user.id))));

router.put('/:id', asyncHandler(async (req, res) => {
	const allowed = ['name', 'type', 'gst', 'address', 'is_active'];
	const changes = Object.fromEntries(Object.entries(req.body || {}).filter(([key]) => allowed.includes(key)));
	return success(res, 'Business updated successfully', await businesses.update(req.params.id, changes, req.user.id));
}));

router.delete('/:id', asyncHandler(async (req, res) => {
	return success(res, 'Business deleted successfully', await businesses.remove(req.params.id, req.user.id));
}));

module.exports = router;
