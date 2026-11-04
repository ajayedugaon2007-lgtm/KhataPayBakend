const express = require('express');
const { authenticate, asyncHandler } = require('../config/api');
const controller = require('../controllers/upi.controller');

const router = express.Router();
router.use(authenticate);
router.post('/create', asyncHandler(controller.create));
router.get('/profile', asyncHandler(controller.profile));
router.post('/qr/generate', asyncHandler(controller.generateQr));
router.get('/qr', asyncHandler(controller.getQr));

module.exports = router;
