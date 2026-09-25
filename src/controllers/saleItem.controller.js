const createCrudController = require('./crud.controller');
module.exports = createCrudController(require('../models/saleItem.model'), 'Sale item');