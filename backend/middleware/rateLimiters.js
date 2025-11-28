const rateLimit = require('express-rate-limit');

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  message: { success: false, error: 'Too many requests from this IP, please try again later' }
});

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

