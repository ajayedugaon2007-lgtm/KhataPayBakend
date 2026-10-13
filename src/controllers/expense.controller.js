const { createResourceController } = require('./base.controller');
module.exports = createResourceController(require('../models/Expense'), 'Expense');