const createCrudController = require('./crud.controller');
module.exports = createCrudController(require('../models/transaction.model'), 'Transaction');