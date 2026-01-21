const express = require('express');
const authenticateToken = require('../../middleware/authenticateToken');
const voucherController = require('../controllers/voucherController');

const router = express.Router();

// Get voucher by code (requires auth - only owner or partner can view)
router.get('/:code', authenticateToken, voucherController.getVoucher);

// Redeem voucher (requires partner auth)
router.post('/:code/redeem', authenticateToken, voucherController.redeemVoucher);

module.exports = router;

// Separate router for booking vouchers (mounted at /api/v1/bookings)
const bookingVoucherRouter = express.Router();
bookingVoucherRouter.post(
  '/:bookingId/vouchers', 
  authenticateToken, 
  voucherController.createVoucher
);
module.exports.bookingVoucherRouter = bookingVoucherRouter;

// Separate router for partner vouchers (mounted at /api/v1/partners)
const partnerVoucherRouter = express.Router();
partnerVoucherRouter.get(
  '/:id/vouchers', 
  authenticateToken, 
  voucherController.listPartnerVouchers
);
module.exports.partnerVoucherRouter = partnerVoucherRouter;

