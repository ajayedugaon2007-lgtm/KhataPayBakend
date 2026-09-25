const createCrudController = require('./crud.controller');
module.exports = createCrudController(require('../models/invoiceItem.model'), 'Invoice item');
