const createCrudController = require('./crud.controller');
module.exports = createCrudController(require('../models/customer.model'), 'Customer');