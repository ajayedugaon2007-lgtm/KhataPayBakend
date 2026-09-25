const createCrudController = require('./crud.controller');
module.exports = createCrudController(require('../models/purchase.model'), 'Purchase');