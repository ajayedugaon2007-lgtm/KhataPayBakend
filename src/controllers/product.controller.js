const createCrudController = require('./crud.controller');
module.exports = createCrudController(require('../models/product.model'), 'Product');