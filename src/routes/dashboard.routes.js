const express = require('express');
const authenticate = require('../middleware/auth.middleware');
const controller = require('../controllers/dashboard.controller');

const router = express.Router();

router.use(authenticate);
router.get('/', controller.summary);

module.exports = router;