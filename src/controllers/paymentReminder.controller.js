const createCrudController = require('./crud.controller');
module.exports = createCrudController(require('../models/paymentReminder.model'), 'Payment reminder');