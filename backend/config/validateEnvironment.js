const { log, logError } = require('../utils/logger');

function validateEnvironment() {
  const errors = [];
  const warnings = [];

  if (!process.env.DATABASE_URL) {
    const dbVars = ['DB_USER', 'DB_HOST', 'DB_NAME', 'DB_PASSWORD', 'DB_PORT'];
    dbVars.forEach((varName) => {
      if (!process.env[varName]) {
        errors.push(`Missing critical environment variable: ${varName} (or use DATABASE_URL instead)`);
      }
    });
  }

  if (!process.env.JWT_SECRET) {
    errors.push('Missing critical environment variable: JWT_SECRET');
  } else {
    if (process.env.JWT_SECRET.length < 32) {
      errors.push('JWT_SECRET must be at least 32 characters long for security');
    }
    if (process.env.JWT_SECRET === 'your-secret-key-change-in-production') {
      warnings.push('JWT_SECRET is using default value - change this in production');
    }
  }

  if (!process.env.DATABASE_URL && process.env.DB_PORT) {
    const port = parseInt(process.env.DB_PORT, 10);
    if (Number.isNaN(port) || port < 1 || port > 65535) {
      errors.push('DB_PORT must be a valid port number (1-65535)');
    }
  }

  if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = 'development';
    warnings.push('NODE_ENV not set, defaulting to development');
  } else if (!['development', 'production', 'test'].includes(process.env.NODE_ENV)) {
    warnings.push(`NODE_ENV is set to '${process.env.NODE_ENV}' which is not a standard value`);
  }

  if (process.env.NODE_ENV === 'production') {
    if (!process.env.FRONTEND_URL) {
      warnings.push('FRONTEND_URL not set - CORS will be restrictive in production');
    }
    if (process.env.JWT_SECRET === 'your-secret-key-change-in-production') {
      errors.push('JWT_SECRET must be changed from default value in production');
    }
    if (!process.env.DATABASE_URL && process.env.DB_PASSWORD && process.env.DB_PASSWORD.length < 8) {
      warnings.push('DB_PASSWORD should be at least 8 characters long in production');
    }
  }

  if (process.env.PORT) {
    const port = parseInt(process.env.PORT, 10);
    if (Number.isNaN(port) || port < 1 || port > 65535) {
      errors.push('PORT must be a valid port number (1-65535)');
    }
  }

  ['FRONTEND_URL', 'ADMIN_URL'].forEach((key) => {
    if (process.env[key]) {
      try {
        new URL(process.env[key]);
      } catch {
        warnings.push(`${key} appears to be an invalid URL format`);
      }
    }
  });

  if (warnings.length > 0) {
    log('\n⚠️  Environment Warnings:');
    warnings.forEach((warning) => log(`   - ${warning}`));
  }

  if (errors.length > 0) {
    logError('\n❌ Environment Validation Failed:');
    errors.forEach((error) => logError(`   - ${error}`));
    logError('\nPlease fix these issues before starting the server.');
    process.exit(1);
  }

  log('✅ Environment validation passed');
  log('\n📋 Environment Configuration:');
  log(`   - NODE_ENV: ${process.env.NODE_ENV}`);
  if (process.env.DATABASE_URL) {
    try {
      const u = new URL(process.env.DATABASE_URL);
      const host = (u.hostname || '').toLowerCase();
      const label = host === 'localhost' || host === '127.0.0.1' ? 'local' : 'remote';
      log(`   - DATABASE_URL: ***SET (${label})***`);
    } catch {
      log('   - DATABASE_URL: ***SET***');
    }
  } else {
    log(`   - DB_HOST: ${process.env.DB_HOST}`);
    log(`   - DB_NAME: ${process.env.DB_NAME}`);
    log(`   - DB_PORT: ${process.env.DB_PORT}`);
    log(`   - DB_USER: ${process.env.DB_USER}`);
  }
  log(`   - JWT_SECRET: ${process.env.JWT_SECRET ? '***SET***' : 'NOT SET'}`);
  log(`   - FRONTEND_URL: ${process.env.FRONTEND_URL || 'NOT SET'}`);
  log(`   - ADMIN_URL: ${process.env.ADMIN_URL || 'NOT SET'}`);
  log('');
}

module.exports = validateEnvironment;

