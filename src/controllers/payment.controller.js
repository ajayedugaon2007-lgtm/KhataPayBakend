const createCrudController = require('./crud.controller');
module.exports = createCrudController(require('../models/payment.model'), 'Payment');