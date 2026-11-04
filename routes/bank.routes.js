const express = require('express');
const { authenticate, asyncHandler } = require('../config/api');
const controller = require('../controllers/bank.controller');

const router = express.Router();
router.use(authenticate);
router.post('/link', asyncHandler(controller.link));
router.get('/accounts', asyncHandler(controller.list));
router.get('/accounts/:id', asyncHandler(controller.get));
router.delete('/accounts/:id', asyncHandler(controller.remove));
router.post('/verification/initiate', asyncHandler(controller.initiate));
router.post('/verification/confirm', asyncHandler(controller.confirm));
router.get('/verification/status', asyncHandler(controller.status));

module.exports = router;
