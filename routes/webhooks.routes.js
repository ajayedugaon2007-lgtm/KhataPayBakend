const express = require('express');
const { asyncHandler } = require('../config/api');
const controller = require('../controllers/payment.controller');

const router = express.Router();
router.post('/payment', asyncHandler(controller.webhook));

module.exports = router;
