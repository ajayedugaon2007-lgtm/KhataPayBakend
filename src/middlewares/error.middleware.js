function errorHandler(error, req, res, next) {
    if (res.headersSent) return next(error);
    const status = error.statusCode || error.status || (error.code === 'ER_DUP_ENTRY' ? 409 : 500);
    if (status >= 500) console.error(error);
    return res.status(status).json({
        success: false,
        message: status >= 500 ? 'Internal server error' : error.message
    });
}

module.exports = errorHandler;