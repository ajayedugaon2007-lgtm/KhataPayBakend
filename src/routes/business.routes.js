const express = require('express');
const authenticate = require('../middlewares/auth.middleware');
const controller = require('../controllers/business.controller');

const router = express.Router();
router.use(authenticate);
router.get('/', controller.list);
router.post('/', controller.create);
router.get('/:id', controller.get);
router.put('/:id', controller.update);
router.delete('/:id', controller.remove);

module.exports = router;