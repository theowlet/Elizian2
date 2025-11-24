const jwt = require('jsonwebtoken');
const config = require('../config/env');

const JWT_SECRET = config.security.jwtSecret;

function createToken(payload, options = { expiresIn: '7d' }) {
  return jwt.sign(payload, JWT_SECRET, options);
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

module.exports = {
  createToken,
  verifyToken,
  JWT_SECRET
};

