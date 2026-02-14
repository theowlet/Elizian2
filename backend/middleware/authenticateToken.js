const { verifyToken } = require('../utils/jwt');

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, error: 'No token provided' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(403).json({ success: false, error: 'Invalid token' });
  }

  req.userId = decoded.userId;
  req.user = { id: decoded.userId };
  req.userRole = decoded.role;
  if (decoded.partnerId) req.partnerId = decoded.partnerId;
  if (decoded.type) req.authType = decoded.type;
  next();
}

module.exports = authenticateToken;

