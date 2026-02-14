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

// Calculate redemption preview (partner only) - must be before /voucher/:code
router.get('/calculate', authenticateToken, redemptionController.calculateRedemptionPreview);

// Pending confirmations for consumer - must be before /:redemptionId
router.get('/pending', authenticateToken, redemptionController.getPendingConfirmations);

// Get redemption by voucher code (authenticated users)
router.get('/voucher/:voucher_code', authenticateToken, redemptionController.getRedemptionByVoucherCode);

// Get redemption audit trail (authenticated users)
router.get('/booking/:bookingId', authenticateToken, redemptionController.getRedemptionAuditTrail);

// Confirm / dispute pending redemption (consumer only)
router.post('/:redemptionId/confirm', authenticateToken, redemptionController.confirmRedemption);
router.post('/:redemptionId/dispute', authenticateToken, redemptionController.disputeRedemption);

// Note: Admin routes are mounted in adminRoutes.js to maintain separation of concerns

module.exports = router;

