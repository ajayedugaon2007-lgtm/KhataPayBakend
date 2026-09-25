const createCrudRouter = require('./crud.routes');
module.exports = createCrudRouter(require('../controllers/expenseCategory.controller'));
