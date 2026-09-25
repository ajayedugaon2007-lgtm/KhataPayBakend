const createCrudController = require('./crud.controller');
const model = require('../models/session.model');
module.exports = createCrudController(model, 'Session');