const path = require('path');

const isVercel = Boolean(process.env.VERCEL);
// Load environment variables once. On Vercel, dotenv is optional.
if (!isVercel) {
  require('dotenv').config({
    path: process.env.DOTENV_PATH || path.resolve(process.cwd(), '.env')
  });
} else {
  try {
    require('dotenv').config();
  } catch {
    // dotenv is optional in serverless environments
  }
}


const env = process.env.NODE_ENV || 'development';

const config = {
  env,
  isVercel,
  isProduction: env === 'production',
  isTest: env === 'test',
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    requestIdHeader: process.env.REQUEST_ID_HEADER || 'x-request-id'
  },
  cors: {
    allowedOrigins: process.env.CORS_ALLOWED_ORIGINS
      ? process.env.CORS_ALLOWED_ORIGINS.split(',').map((o) => o.trim())
      : [
          'http://localhost:8080',
          'http://localhost:8081',
          'http://localhost:3000',
          'http://localhost:4000',
          'http://localhost:5001',
          'http://localhost:5173',
          'http://127.0.0.1:8080',
          'http://127.0.0.1:8081',
          'http://127.0.0.1:5173'
        ]
  },
  database: {
    url: process.env.DATABASE_URL || null,
    // Use SSL only for remote DBs (Railway, Neon, etc.). Local Postgres typically does not support SSL.
    ssl: (() => {
      const url = process.env.DATABASE_URL || '';
      if (!url) return false;
      try {
        const u = new URL(url);
        const host = (u.hostname || '').toLowerCase();
        if (host === 'localhost' || host === '127.0.0.1') return false;
        return { rejectUnauthorized: false };
      } catch {
        return false;
      }
    })(),
    maxConnections: parseInt(process.env.PG_POOL_MAX || '20', 10),
    idleTimeoutMillis: parseInt(process.env.PG_IDLE_TIMEOUT || '30000', 10),
    connectionTimeoutMillis: parseInt(process.env.PG_CONN_TIMEOUT || '10000', 10) // Increased from 2000ms to 10000ms (10 seconds)
  },
  redis: {
    url: process.env.REDIS_URL || null,
    prefix: process.env.REDIS_PREFIX || 'elizian'
  },
  security: {
    jwtSecret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
    otpExpiryMinutes: parseInt(process.env.OTP_EXPIRY_MINUTES || '5', 10),
    otpMaxAttempts: parseInt(process.env.OTP_MAX_ATTEMPTS || '5', 10)
  }
};

// STABILIZATION FIX: Fail fast if JWT secret is not set in production
// The default 'your-secret-key-change-in-production' is intentionally weak
// and must be replaced before deploying to production.
if (config.isProduction && config.security.jwtSecret.includes('change-in-production')) {
  console.error('FATAL: JWT_SECRET must be set to a strong secret in production. Refusing to start.');
  process.exit(1);
}

module.exports = config;

