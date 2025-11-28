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
  req.userRole = decoded.role;
  next();
}

module.exports = authenticateToken;

