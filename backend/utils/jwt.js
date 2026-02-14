const jwt = require('jsonwebtoken');
const config = require('../src/config/env');

const JWT_SECRET = config.security.jwtSecret;

function createToken(payload, options = { expiresIn: '30d' }) {
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

