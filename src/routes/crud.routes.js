const express = require('express');
const authenticate = require('../middleware/auth.middleware');

function createCrudRouter(controller, options = {}) {
  const router = express.Router();
  if (options.protected !== false) router.use(authenticate);
  router.post('/', controller.create);
  router.get('/', controller.list);
  router.get('/:id', controller.get);
  router.put('/:id', controller.update);
  router.delete('/:id', controller.remove);
  return router;
}

module.exports = createCrudRouter;