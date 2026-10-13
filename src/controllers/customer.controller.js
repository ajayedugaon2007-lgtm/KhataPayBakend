const { createResourceController } = require('./base.controller');
module.exports = createResourceController(require('../models/Customer'), 'Customer');