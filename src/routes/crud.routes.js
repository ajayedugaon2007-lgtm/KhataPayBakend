const express = require('express');
const authenticate = require('../middlewares/auth.middleware');

function createCrudRouter(controller) {
	const router = express.Router();
	router.use(authenticate);
	router.get('/', controller.list);
	router.post('/', controller.create);
	router.get('/:id', controller.get);
	router.put('/:id', controller.update);
	router.delete('/:id', controller.remove);
	return router;
}

module.exports = createCrudRouter;