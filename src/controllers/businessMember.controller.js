const createCrudController = require('./crud.controller');
module.exports = createCrudController(require('../models/businessMember.model'), 'Business member');