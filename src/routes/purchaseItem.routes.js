const createCrudRouter = require('./crud.routes');
module.exports = createCrudRouter(require('../controllers/purchaseItem.controller'));