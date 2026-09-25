const createCrudController = require('./crud.controller');
module.exports = createCrudController(require('../models/category.model'), 'Category');