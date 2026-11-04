const express = require('express');
const { authenticate, asyncHandler, createCrudRouter } = require('../config/api');
const controller = require('../controllers/payment.controller');

const router = express.Router();
router.use(authenticate);
router.post('/create', asyncHandler(controller.create));
router.post('/verify', asyncHandler(controller.verify));
router.get('/history', asyncHandler(controller.history));
router.get('/:id', asyncHandler(controller.get));

// Keep the existing collection CRUD endpoints intact.
router.use('/', createCrudRouter('payments', 'Payment'));

module.exports = router;
