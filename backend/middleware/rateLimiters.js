const rateLimit = require('express-rate-limit');

const apiLimitMax = parseInt(process.env.RATE_LIMIT_MAX || '', 10);
const isDev = process.env.NODE_ENV !== 'production';
const rateLimitDisabled = process.env.RATE_LIMIT_DISABLED === '1' || process.env.RATE_LIMIT_DISABLED === 'true';

function isLocalhost(req) {
  const ip = (req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || '').toString().trim();
  const forwarded = (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim();
  const check = (addr) => !addr ? false : addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1' || addr === 'localhost';
  return check(ip) || check(forwarded);
}

// When RATE_LIMIT_DISABLED=1, do not apply any limit (avoids 429 in local dev / Partner Console burst)
const noopLimiter = (req, res, next) => next();

const apiLimiterConfig = {
  windowMs: 15 * 60 * 1000,
  max: isDev ? (Number.isNaN(apiLimitMax) ? 2000 : Math.max(apiLimitMax, 2000)) : (Number.isNaN(apiLimitMax) ? 100 : apiLimitMax),
  message: { success: false, error: 'Too many requests from this IP, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => isDev || rateLimitDisabled || isLocalhost(req),
};

const apiLimiter = rateLimitDisabled ? noopLimiter : rateLimit(apiLimiterConfig);

const otpLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: process.env.NODE_ENV === 'development' ? 10 : 3,
  message: 'Too many OTP requests, please try again later (wait 5 minutes)',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: 'Too many OTP requests, please try again later (wait 5 minutes)',
      retryAfter: '5 minutes'
    });
  }
});

module.exports = {
  apiLimiter,
  otpLimiter
};

