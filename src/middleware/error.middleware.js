const { failure } = require('../utils/response');

function errorHandler(error, req, res, next) {
	if (res.headersSent) return next(error);

	const statusCode = error.statusCode || (error.code === 'ER_DUP_ENTRY' ? 409 : 500);
	const message = statusCode === 500 ? 'Internal server error' : error.message;
	if (statusCode === 500) console.error(error);
	return failure(res, message, statusCode);
}

module.exports = errorHandler;
