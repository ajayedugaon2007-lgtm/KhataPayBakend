const express = require('express');
const { authenticate, asyncHandler } = require('../config/api');
const controller = require('../controllers/payment.controller');

const router = express.Router();
router.use(authenticate);
router.post('/scan', asyncHandler(controller.scan));
router.post('/pay', asyncHandler(controller.payQr));
router.get('/my-qr', asyncHandler(controller.myQr));

module.exports = router;
