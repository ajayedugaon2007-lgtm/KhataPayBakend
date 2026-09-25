function success(res, message, data, statusCode = 200) {
	return res.status(statusCode).json({ success: true, message, data });
}

function failure(res, message, statusCode = 500) {
	return res.status(statusCode).json({ success: false, message });
}

module.exports = { success, failure };
