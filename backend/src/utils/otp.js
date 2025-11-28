const crypto = require('crypto');

function generateOTP() {
  return (Math.floor(100000 + Math.random() * 900000)).toString();
}

function generateToken(size = 32) {
  return crypto.randomBytes(size).toString('hex');
}

module.exports = {
  generateOTP,
  generateToken
};

