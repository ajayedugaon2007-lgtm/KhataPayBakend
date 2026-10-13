const { createResourceController } = require('./base.controller');
module.exports = createResourceController(require('../models/Payment'), 'Payment');