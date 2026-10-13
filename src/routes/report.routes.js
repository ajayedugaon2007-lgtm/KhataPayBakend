const express = require('express');
const authenticate = require('../middleware/auth.middleware');
const controller = require('../controllers/report.controller');

const router = express.Router();

router.use(authenticate);
router.get('/summary', controller.summary);

module.exports = router;
