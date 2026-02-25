const express = require('express');
const authenticateToken = require('../../middleware/authenticateToken');
const requireSuperAdmin = require('../middleware/requireSuperAdmin');
const adminController = require('../controllers/adminController');
const adminService = require('../services/adminService');
const rewardsController = require('../controllers/rewardsController');
const adminRedemptionController = require('../controllers/adminRedemptionController');
const adminCampaignController = require('../controllers/adminCampaignController');
const locationsController = require('../controllers/locationsController');
const { adminOverrideRateLimiter } = require('../middleware/rateLimiter');
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

// Enterprise Campaign Orchestrator (admin only)
router.get('/campaigns', adminCampaignController.listCampaigns);
router.get('/campaigns/schema', adminCampaignController.getCampaignSchema);
router.get('/campaigns/:id', adminCampaignController.getCampaign);
router.get('/campaigns/:id/analytics', adminCampaignController.getCampaignAnalytics);
router.post('/campaigns', adminCampaignController.createCampaign);
router.put('/campaigns/:id', adminCampaignController.updateCampaign);
router.delete('/campaigns/:id', adminCampaignController.deleteCampaign);
router.post('/campaigns/:id/clone', adminCampaignController.cloneCampaign);
router.put('/campaigns/:id/pause', adminCampaignController.pauseCampaign);

// Partners management
router.get('/partners', adminController.listPartners);
router.patch('/partners/:id/status', adminController.updatePartnerStatus);
router.put('/partners/:id/featured-eligibility', adminController.updatePartnerFeaturedEligibility);
router.put('/partners/:id/partner-tier', adminController.updatePartnerTier);

// Partner tier management (CRUD for partner_tiers; dynamic tiers)
router.get('/partner-tiers', adminController.listPartnerTiers);
router.get('/partner-tiers/:id', adminController.getPartnerTier);
router.post('/partner-tiers', adminController.createPartnerTier);
router.put('/partner-tiers/:id', adminController.updatePartnerTierById);
router.patch('/partner-tiers/:id/active', adminController.setPartnerTierActive);
router.delete('/partner-tiers/:id', adminController.deletePartnerTier);
// Platform revenue dashboard (from platform_earnings_ledger)
router.get('/platform-earnings', adminController.getPlatformEarnings);
router.get('/platform-earnings/report', adminController.getPlatformEarningsReport);
router.get('/platform-earnings/export', adminController.getPlatformEarningsExport);

// Locations (Country, State, City) for filters
router.get('/locations/countries', locationsController.getCountries);
router.get('/locations/states', locationsController.getStates);
router.get('/locations/cities', locationsController.getCities);

// Deals/Offers management
router.get('/deals', adminController.listDeals);
router.patch('/deals/:id/status', adminController.updateDealStatus);
router.put('/offers/:offerId/feature', adminController.updateOfferFeaturedStatus);
router.post('/deals/bulk-approve', adminController.bulkApproveDeals);
router.post('/deals/bulk-reject', adminController.bulkRejectDeals);
router.post('/offers/:offerId/feature-approve', async (req, res) => {
  try {
    const role = await getUserRoleById(req.userId);
    const reason = req.body?.reason || req.body?.trending_approval_reason || null;
    const result = await adminService.updateTrendingStatus(
      req.params.offerId,
      'admin_approve',
      req.userId,
      role,
      reason
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

// Analytics (legacy)
router.get('/analytics', adminController.getAnalytics);

// Enterprise Analytics Dashboard (filter-driven, saved views, export)
const adminAnalyticsController = require('../controllers/adminAnalyticsController');
router.get('/analytics/dashboard', adminAnalyticsController.getDashboard);
router.get('/analytics/drill-down', adminAnalyticsController.getDrillDown);
router.get('/analytics/export/csv', adminAnalyticsController.exportCsv);
router.get('/analytics/views', adminAnalyticsController.listViews);
router.post('/analytics/views', adminAnalyticsController.saveView);
router.get('/analytics/views/:viewId', adminAnalyticsController.getView);
router.put('/analytics/views/:viewId/default', adminAnalyticsController.setDefaultView);
router.delete('/analytics/views/:viewId', adminAnalyticsController.deleteView);

// Enterprise Reporting (macro-level, admin; all via reportingEngineService)
const reportController = require('../controllers/reportController');
router.get('/reports', reportController.adminReport);
router.get('/reports/drill-down', reportController.adminDrillDown);
router.get('/reports/export/csv', reportController.exportReportCsv);
router.get('/reports/reconciliation', reportController.reconciliationCheck);

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

// Redemption & Settlement Management (Enterprise Features)
router.put('/redemptions/:redemptionId/settlement', adminOverrideRateLimiter, adminRedemptionController.updateSettlementStatus);
router.post('/redemptions/:redemptionId/freeze', adminOverrideRateLimiter, adminRedemptionController.freezeSettlement);
router.post('/redemptions/:redemptionId/dispute', adminOverrideRateLimiter, adminRedemptionController.raiseDispute);
router.get('/redemptions', adminRedemptionController.listRedemptions);
router.get('/vouchers/:voucherCode/audit', adminRedemptionController.getVoucherAuditTrail);
router.get('/bookings/:bookingId/audit', adminRedemptionController.getBookingAuditTrail);
router.get('/bookings/:bookingId/state-history', adminRedemptionController.getStateHistory);
router.get('/redemptions/:redemptionId/overrides', adminRedemptionController.getAdminOverrides);

// Reputation: review governance (soft-delete, restore, audit)
const reputationReviewService = require('../services/reputationReviewService');
const { successResponse, errorResponse } = require('../../utils/response');
router.delete('/reviews/:reviewId', async (req, res) => {
  try {
    const updated = await reputationReviewService.softDeleteReview(req.params.reviewId, req.userId, 'admin');
    if (!updated) return errorResponse(res, 404, 'Review not found or already deleted');
    successResponse(res, 200, 'Review soft-deleted', updated);
  } catch (err) {
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to delete review');
  }
});
router.post('/reviews/:reviewId/restore', async (req, res) => {
  try {
    const updated = await reputationReviewService.restoreReview(req.params.reviewId, req.userId, 'admin');
    if (!updated) return errorResponse(res, 404, 'Review not found');
    successResponse(res, 200, 'Review restored', updated);
  } catch (err) {
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to restore review');
  }
});
router.get('/reviews/:reviewId/audit', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const logs = await reputationReviewService.getReviewAuditLog(req.params.reviewId, limit);
    successResponse(res, 200, 'Audit log', logs);
  } catch (err) {
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to get audit log');
  }
});
router.post('/reviews/:reviewId/mark-malicious', async (req, res) => {
  try {
    const updated = await reputationReviewService.markMaliciousReview(req.params.reviewId, req.userId, 'admin');
    if (!updated) return errorResponse(res, 404, 'Review not found or already deleted');
    successResponse(res, 200, 'Review marked as malicious', updated);
  } catch (err) {
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to mark review as malicious');
  }
});
router.post('/reviews/block-user', async (req, res) => {
  try {
    const { user_id: userId, reason } = req.body || {};
    if (!userId) return errorResponse(res, 400, 'user_id is required');
    await reputationReviewService.blockUserForReviews(userId, req.userId, reason);
    successResponse(res, 200, 'User blocked from submitting reviews', { user_id: userId });
  } catch (err) {
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to block user');
  }
});
router.post('/reviews/unblock-user', async (req, res) => {
  try {
    const { user_id: userId } = req.body || {};
    if (!userId) return errorResponse(res, 400, 'user_id is required');
    const ok = await reputationReviewService.unblockUserForReviews(userId);
    if (!ok) return errorResponse(res, 404, 'User was not blocked');
    successResponse(res, 200, 'User unblocked', { user_id: userId });
  } catch (err) {
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to unblock user');
  }
});

module.exports = router;

