const createCrudController = require('./crud.controller');
module.exports = createCrudController(require('../models/expense.model'), 'Expense');
