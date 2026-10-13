const { createResourceController } = require('./base.controller');
module.exports = createResourceController(require('../models/Transaction'), 'Transaction');