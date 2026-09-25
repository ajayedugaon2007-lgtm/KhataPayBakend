const createCrudController = require('./crud.controller');
module.exports = createCrudController(require('../models/inventory.model'), 'Inventory transaction');