const express = require('express');
const authenticateToken = require('../../middleware/authenticateToken');
const { redemptionRateLimiter } = require('../middleware/rateLimiter');
const redemptionController = require('../controllers/redemptionController');

const router = express.Router();

/**
 * Redemption Routes
 * 
 * POST /api/v1/redemptions/redeem - Redeem a voucher (requires partner auth, rate limited)
 * GET /api/v1/redemptions/voucher/:voucher_code - Get redemption by voucher code
 * GET /api/v1/redemptions/booking/:bookingId - Get redemption audit trail for booking
 */

// Redeem voucher (partner only, rate limited)
router.post('/redeem', redemptionRateLimiter, authenticateToken, redemptionController.redeemVoucher);

// Get redemption by voucher code (authenticated users)
router.get('/voucher/:voucher_code', authenticateToken, redemptionController.getRedemptionByVoucherCode);

// Get redemption audit trail (authenticated users)
router.get('/booking/:bookingId', authenticateToken, redemptionController.getRedemptionAuditTrail);

// Note: Admin routes are mounted in adminRoutes.js to maintain separation of concerns

module.exports = router;

