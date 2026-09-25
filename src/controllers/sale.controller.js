const createCrudController = require('./crud.controller');
module.exports = createCrudController(require('../models/sale.model'), 'Sale');