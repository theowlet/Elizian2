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
    port: parseInt(process.env.PORT || '4000', 10),
    requestIdHeader: process.env.REQUEST_ID_HEADER || 'x-request-id'
  },
  cors: {
    allowedOrigins: process.env.CORS_ALLOWED_ORIGINS
      ? process.env.CORS_ALLOWED_ORIGINS.split(',')
      : [
          'http://localhost:8080',
          'http://localhost:8081',
          'http://localhost:3000',
          'http://localhost:5173',
          'http://127.0.0.1:8080',
          'http://127.0.0.1:8081'
        ]
  },
  database: {
    url: process.env.DATABASE_URL || null,
    ssl: process.env.DATABASE_URL
      ? { rejectUnauthorized: false }
      : false,
    maxConnections: parseInt(process.env.PG_POOL_MAX || '20', 10),
    idleTimeoutMillis: parseInt(process.env.PG_IDLE_TIMEOUT || '30000', 10),
    connectionTimeoutMillis: parseInt(process.env.PG_CONN_TIMEOUT || '2000', 10)
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

module.exports = config;

