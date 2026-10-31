const express = require('express');
const controller = require('../controllers/auth.controller');

const router = express.Router();
router.post('/signup', controller.register);
router.post('/signup-owner', controller.registerOwner);
router.post('/register', controller.register);
router.post('/register-owner', controller.registerOwner);
router.post('/login', controller.login);

module.exports = router;
