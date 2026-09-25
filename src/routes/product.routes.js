const createCrudRouter = require('./crud.routes');
module.exports = createCrudRouter(require('../controllers/product.controller'));