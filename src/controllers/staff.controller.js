const createCrudController = require('./crud.controller');
module.exports = createCrudController(require('../models/staff.model'), 'Staff member');