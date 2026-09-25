const createCrudController = require('./crud.controller');
module.exports = createCrudController(require('../models/expenseCategory.model'), 'Expense category');
