const createCrudController = require('./crud.controller');
module.exports = createCrudController(require('../models/invoice.model'), 'Invoice');
