#!/usr/bin/env node

/**
 * JWT Secret Generator for Elizian Backend
 * Generates a cryptographically secure JWT secret
 */

const crypto = require('crypto');

function generateJWTSecret() {
  // Generate a 64-byte (512-bit) random string and encode as base64
  const secret = crypto.randomBytes(64).toString('base64');
  return secret;
}

function generateJWTSecretHex() {
  // Generate a 64-byte (512-bit) random string and encode as hex
  const secret = crypto.randomBytes(64).toString('hex');
  return secret;
}

console.log('🔐 JWT Secret Generator for Elizian Backend\n');

console.log('Base64 encoded secret (recommended):');
console.log(generateJWTSecret());
console.log('');

console.log('Hex encoded secret (alternative):');
console.log(generateJWTSecretHex());
console.log('');

console.log('📝 Instructions:');
console.log('1. Copy one of the secrets above');
console.log('2. Add it to your .env file as JWT_SECRET=<secret>');
console.log('3. Keep this secret secure and never commit it to version control');
console.log('4. Use different secrets for development and production');
