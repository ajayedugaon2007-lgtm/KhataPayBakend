const express = require('express');
const authenticate = require('../middleware/auth.middleware');
const controller = require('../controllers/user.controller');
const router = express.Router();

router.post('/register', controller.register);
router.post('/register-owner', controller.registerOwner);
router.post('/login', controller.login);
router.post('/', controller.register);
router.use(authenticate);
router.get('/', controller.list);
router.get('/:id', controller.get);
router.put('/:id', controller.update);
router.delete('/:id', controller.remove);
module.exports = router;