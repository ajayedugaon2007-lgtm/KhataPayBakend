const express = require('express');
const { authenticate, success, asyncHandler } = require('../config/db');
const { getSummary } = require('../services/report.service');

const router = express.Router();

router.use(authenticate);
router.get('/summary', asyncHandler(async (req, res) =>
	success(res, 'Business report retrieved successfully', await getSummary(req.user.id))));

module.exports = router;
