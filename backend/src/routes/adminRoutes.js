const express = require('express');
const authenticateToken = require('../../middleware/authenticateToken');
const requireSuperAdmin = require('../middleware/requireSuperAdmin');
const adminController = require('../controllers/adminController');
const adminService = require('../services/adminService');
const rewardsController = require('../controllers/rewardsController');
const { getUserRoleById } = require('../utils/queries');

const router = express.Router();

// All admin routes require authentication
router.use(authenticateToken);

// Partner-initiated trending request (no super admin)
router.post(
  '/partners/:partnerId/offers/:offerId/feature-request',
  async (req, res) => {
    try {
      const role = await getUserRoleById(req.userId);
      if (role !== 'partner' && role !== 'partner_admin') {
        return res.status(403).json({
          success: false,
          error: 'Only partners can request trending'
        });
      }

      const result = await adminService.updateTrendingStatus(
        req.params.offerId,
        'partner_request',
        req.userId,
        role
      );

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error || 'Unable to submit trending request'
        });
      }

      return res.status(200).json({ success: true, data: result.data });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err.message || 'Failed to submit trending request'
      });
    }
  }
);

// Super admin routes
router.use(requireSuperAdmin);

// Dashboard
router.get('/dashboard', adminController.getDashboard);

// Partners management
router.get('/partners', adminController.listPartners);
router.patch('/partners/:id/status', adminController.updatePartnerStatus);
router.put('/partners/:id/featured-eligibility', adminController.updatePartnerFeaturedEligibility);

// Deals/Offers management
router.get('/deals', adminController.listDeals);
router.patch('/deals/:id/status', adminController.updateDealStatus);
router.put('/offers/:offerId/feature', adminController.updateOfferFeaturedStatus);
router.post('/deals/bulk-approve', adminController.bulkApproveDeals);
router.post('/deals/bulk-reject', adminController.bulkRejectDeals);
router.post('/offers/:offerId/feature-approve', async (req, res) => {
  try {
    const role = await getUserRoleById(req.userId);
    const result = await adminService.updateTrendingStatus(
      req.params.offerId,
      'admin_approve',
      req.userId,
      role
    );
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error || 'Unable to approve trending request'
      });
    }
    return res.status(200).json({ success: true, data: result.data });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to approve trending request'
    });
  }
});

router.post('/offers/:offerId/feature-reject', async (req, res) => {
  try {
    const role = await getUserRoleById(req.userId);
    const result = await adminService.updateTrendingStatus(
      req.params.offerId,
      'admin_reject',
      req.userId,
      role
    );
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error || 'Unable to reject trending request'
      });
    }
    return res.status(200).json({ success: true, data: result.data });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to reject trending request'
    });
  }
});

// Activity/Audit logs
router.get('/activity', adminController.getActivity);

// Users management
router.get('/users', adminController.listUsers);

// Analytics
router.get('/analytics', adminController.getAnalytics);

// Settings
router.get('/settings', adminController.getSettings);
router.put('/settings', adminController.updateSettings);
router.put('/settings/:key', adminController.updateSetting);

// Sessions (may not require super admin, but keeping it here for now)
router.get('/sessions', adminController.getSessions);

// Archives
router.get('/archives', adminController.getArchives);
router.post('/archives/:id/reactivate', adminController.reactivateArchive);

// Rewards management
router.get('/rewards/user/:userId', rewardsController.adminGetUserRewards);
router.post('/rewards/manual-credit', rewardsController.adminManualCredit);
router.get('/rewards/overview', adminController.getRewardsOverview);
router.post('/archive-expired', adminController.archiveExpired);
router.post('/partners/bulk-approve', adminController.bulkApprovePartners);

// Booking management
router.get('/bookings', adminController.listBookings);
router.get('/bookings/stats', adminController.getBookingStats);
router.get('/bookings/:id', adminController.getBookingDetails);
router.put('/bookings/:id/status', adminController.updateBookingStatus);
router.post('/bookings/:id/refund', adminController.processRefund);

module.exports = router;

