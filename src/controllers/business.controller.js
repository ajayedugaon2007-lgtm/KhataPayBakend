const createCrudController = require('./crud.controller');
module.exports = createCrudController(require('../models/business.model'), 'Business');