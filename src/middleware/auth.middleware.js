const jwt = require('jsonwebtoken');

function authenticate(req, res, next) {
	const header = req.headers.authorization || '';
	const token = header.startsWith('Bearer ') ? header.slice(7) : null;
	if (!token) return res.status(401).json({ success: false, message: 'Authentication token is required' });

	try {
		req.user = jwt.verify(token, process.env.JWT_SECRET);
		return next();
	} catch (error) {
		return res.status(401).json({ success: false, message: 'Invalid or expired authentication token' });
	}
}

module.exports = authenticate;
