const createCrudController = require('./crud.controller');
module.exports = createCrudController(require('../models/purchaseItem.model'), 'Purchase item');