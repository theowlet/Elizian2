const adminService = require('../services/adminService');
const { successResponse, errorResponse } = require('../../utils/response');
const { logError } = require('../../utils/logger');
const { getUserRoleById } = require('../utils/queries');

// Get admin dashboard
async function getDashboard(req, res) {
  try {
    const { range = '30' } = req.query;
    const dashboard = await adminService.getDashboard(range);
    successResponse(res, 200, "Dashboard stats retrieved successfully", dashboard);
  } catch (err) {
    logError("❌ Admin dashboard error:", err);
    errorResponse(res, err.statusCode || 500, err.message || "Failed to retrieve dashboard");
  }
}

// List admin partners
async function listPartners(req, res) {
  try {
    const { status = 'all' } = req.query;
    const partners = await adminService.listPartners({ status });
    successResponse(res, 200, "Partners retrieved successfully", partners);
  } catch (err) {
    logError("❌ Admin partners fetch error:", err);
    errorResponse(res, err.statusCode || 500, err.message || "Failed to retrieve partners");
  }
}

// Update partner status
async function updatePartnerStatus(req, res) {
  try {
    const { id } = req.params;
    const { action } = req.body || {};
    const actorRole = await getUserRoleById(req.userId);
    const partner = await adminService.updatePartnerStatus(id, action, req.userId, actorRole);
    successResponse(res, 200, "Partner status updated successfully", partner);
  } catch (err) {
    logError("❌ Partner status update error:", err);
    errorResponse(res, err.statusCode || 500, err.message || "Failed to update partner status");
  }
}

// Update partner featured eligibility
async function updatePartnerFeaturedEligibility(req, res) {
  try {
    const { id } = req.params;
    const { approved_for_featured, reason } = req.body || {};
    const actorRole = await getUserRoleById(req.userId);
    const result = await adminService.updatePartnerFeaturedEligibility(id, approved_for_featured, reason, req.userId, actorRole);
    res.json({ success: true });
  } catch (err) {
    logError('admin featured-eligibility error', err);
    res.status(err.statusCode || 500).json({ success: false, error: err.message || 'Failed to update eligibility' });
  }
}

// List admin deals
async function listDeals(req, res) {
  try {
    const { search = '', status = 'all', promo = 'all' } = req.query;
    const deals = await adminService.listDeals({ search, status, promo });
    successResponse(res, 200, "Deals retrieved successfully", deals);
  } catch (err) {
    logError("❌ Admin deals fetch error:", err);
    errorResponse(res, err.statusCode || 500, err.message || "Failed to retrieve deals");
  }
}

// Update deal status
async function updateDealStatus(req, res) {
  try {
    const { id } = req.params;
    const { action } = req.body || {};
    const actorRole = await getUserRoleById(req.userId);
    const deal = await adminService.updateDealStatus(id, action, req.userId, actorRole);
    successResponse(res, 200, "Deal status updated successfully", deal);
  } catch (err) {
    logError("❌ Deal status update error:", err);
    errorResponse(res, err.statusCode || 500, err.message || "Failed to update deal status");
  }
}

// Update offer featured status
async function updateOfferFeaturedStatus(req, res) {
  try {
    const { offerId } = req.params;
    const { is_promoted, reason, force = false } = req.body || {};
    const actorRole = await getUserRoleById(req.userId);
    await adminService.updateOfferFeaturedStatus(offerId, is_promoted, reason, req.userId, actorRole, force);
    res.json({ success: true });
  } catch (err) {
    logError('admin feature moderation error', err);
    res.status(err.statusCode || 500).json({ success: false, error: err.message || 'Failed to moderate offer' });
  }
}

// Get admin activity
async function getActivity(req, res) {
  try {
    const { type = 'all' } = req.query;
    const activity = await adminService.getActivity({ type });
    successResponse(res, 200, "Activity retrieved successfully", activity);
  } catch (err) {
    logError("❌ Admin activity fetch error:", err);
    errorResponse(res, err.statusCode || 500, err.message || "Failed to retrieve activity");
  }
}

// List admin users
async function listUsers(req, res) {
  try {
    const users = await adminService.listUsers();
    successResponse(res, 200, "Users retrieved successfully", users);
  } catch (err) {
    logError("❌ Admin users fetch error:", err);
    errorResponse(res, err.statusCode || 500, err.message || "Failed to retrieve users");
  }
}

// Get admin analytics
async function getAnalytics(req, res) {
  try {
    const { period = 'month' } = req.query;
    const analytics = await adminService.getAnalytics(period);
    successResponse(res, 200, "Analytics retrieved successfully", analytics);
  } catch (err) {
    logError("❌ Admin analytics error:", err);
    errorResponse(res, err.statusCode || 500, err.message || "Failed to retrieve analytics");
  }
}

// Get system settings
async function getSettings(req, res) {
  try {
    const settings = await adminService.getSettings();
    successResponse(res, 200, "Settings retrieved successfully", settings);
  } catch (err) {
    logError("❌ Settings fetch error:", err);
    errorResponse(res, err.statusCode || 500, err.message || "Failed to fetch settings");
  }
}

// Update system settings
async function updateSettings(req, res) {
  try {
    await adminService.updateSettings(req.body || {}, req.userId);
    successResponse(res, 200, "Settings updated successfully");
  } catch (err) {
    logError("❌ Settings update error:", err);
    errorResponse(res, err.statusCode || 500, err.message || "Failed to update settings");
  }
}

// Update single system setting
async function updateSetting(req, res) {
  try {
    const { key } = req.params;
    const { value } = req.body;
    await adminService.updateSetting(key, value, req.userId);
    successResponse(res, 200, "Setting updated successfully");
  } catch (err) {
    logError("❌ Settings update error:", err);
    errorResponse(res, err.statusCode || 500, err.message || "Failed to update setting");
  }
}

// Get admin sessions
async function getSessions(req, res) {
  try {
    const sessions = await adminService.getSessions();
    successResponse(res, 200, "Sessions retrieved successfully", sessions);
  } catch (err) {
    logError("❌ Sessions fetch error:", err);
    errorResponse(res, err.statusCode || 500, err.message || "Failed to retrieve sessions");
  }
}

// Get admin archives
async function getArchives(req, res) {
  try {
    const archives = await adminService.getArchives();
    successResponse(res, 200, "Archives retrieved successfully", archives);
  } catch (err) {
    logError("❌ Archives fetch error:", err);
    errorResponse(res, err.statusCode || 500, err.message || "Failed to retrieve archives");
  }
}

// Reactivate archived item
async function reactivateArchive(req, res) {
  try {
    const { id } = req.params;
    const actorRole = await getUserRoleById(req.userId);
    const result = await adminService.reactivateArchive(id, req.userId, actorRole);
    successResponse(res, 200, "Item reactivated successfully", result);
  } catch (err) {
    logError("❌ Archive reactivation error:", err);
    errorResponse(res, err.statusCode || 500, err.message || "Failed to reactivate archive");
  }
}

// Archive expired items (manual trigger)
async function archiveExpired(req, res) {
  try {
    const result = await adminService.archiveExpiredItems();
    successResponse(res, 200, "Expired items archived successfully", result);
  } catch (err) {
    logError("❌ Archive expired items error:", err);
    errorResponse(res, err.statusCode || 500, err.message || "Failed to archive expired items");
  }
}

async function bulkApproveDeals(req, res) {
  try {
    const { ids = [] } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ succeeded: [], failed: [{ reason: 'ids array is required' }] });
    }
    const actorRole = await getUserRoleById(req.userId);
    const result = await adminService.bulkApproveDeals(ids, req.userId, actorRole);
    return res.status(200).json(result);
  } catch (err) {
    logError('bulkApproveDeals error', err);
    return res.status(err.statusCode || 500).json({
      succeeded: [],
      failed: [{ reason: err.message || 'Bulk approval failed' }]
    });
  }
}

async function bulkRejectDeals(req, res) {
  try {
    const { ids = [] } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ succeeded: [], failed: [{ reason: 'ids array is required' }] });
    }
    const actorRole = await getUserRoleById(req.userId);
    const result = await adminService.bulkRejectDeals(ids, req.userId, actorRole);
    return res.status(200).json(result);
  } catch (err) {
    logError('bulkRejectDeals error', err);
    return res.status(err.statusCode || 500).json({
      succeeded: [],
      failed: [{ reason: err.message || 'Bulk rejection failed' }]
    });
  }
}

async function bulkApprovePartners(req, res) {
  try {
    const { ids = [] } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ succeeded: [], failed: [{ reason: 'ids array is required' }] });
    }
    const actorRole = await getUserRoleById(req.userId);
    const result = await adminService.bulkApprovePartners(ids, req.userId, actorRole);
    return res.status(200).json(result);
  } catch (err) {
    logError('bulkApprovePartners error', err);
    return res.status(err.statusCode || 500).json({
      succeeded: [],
      failed: [{ reason: err.message || 'Bulk partner approval failed' }]
    });
  }
}

module.exports = {
  getDashboard,
  listPartners,
  updatePartnerStatus,
  updatePartnerFeaturedEligibility,
  listDeals,
  updateDealStatus,
  updateOfferFeaturedStatus,
  bulkApproveDeals,
  bulkRejectDeals,
  bulkApprovePartners,
  getActivity,
  listUsers,
  getAnalytics,
  getSettings,
  updateSettings,
  updateSetting,
  getSessions,
  getArchives,
  reactivateArchive,
  archiveExpired
};

