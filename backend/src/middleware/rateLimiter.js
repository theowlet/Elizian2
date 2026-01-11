/**
 * Rate Limiting Middleware
 * Prevents abuse of redemption endpoints
 */

const rateLimit = require('express-rate-limit');
const { log } = require('../utils/logger');

// Rate limiter for redemption endpoint
const redemptionRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Limit each IP to 50 requests per windowMs
  message: {
    success: false,
    error: 'Too many redemption attempts. Please try again later.'
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req, res) => {
    log(`⚠️ Rate limit exceeded for IP: ${req.ip}, Path: ${req.path}`);
    res.status(429).json({
      success: false,
      error: 'Too many redemption attempts. Please try again later.',
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
    });
  }
});

// Stricter rate limiter for admin override endpoints
const adminOverrideRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // Limit each IP to 20 admin overrides per hour
  message: {
    success: false,
    error: 'Too many admin override attempts. Please contact system administrator.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = {
  redemptionRateLimiter,
  adminOverrideRateLimiter
};

