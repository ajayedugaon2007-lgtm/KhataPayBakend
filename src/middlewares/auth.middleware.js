const { verifyToken } = require('../config/jwt');

function authenticate(req, res, next) {
	const authorization = req.headers.authorization || '';
	if (!authorization.startsWith('Bearer ')) {
		return res.status(401).json({ success: false, message: 'Bearer token is required' });
	}

	try {
		req.user = verifyToken(authorization.slice(7));
		return next();
	} catch {
		return res.status(401).json({ success: false, message: 'Invalid or expired token' });
	}
}

module.exports = authenticate;