const adminRepository = require('../repositories/adminRepository');
const { getPool } = require('../config/db');
const { writeAudit } = require('../utils/audit');
const { AppError } = require('../../utils/response');
const { logError, log } = require('../../utils/logger');

const pool = getPool();

function ensureIdsArray(ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new AppError(400, 'Request body must include a non-empty ids array');
  }
  return Array.from(new Set(ids.filter(Boolean)));
}

function summarizeEligibilityReasons(eligibility) {
  return eligibility?.reasons?.length ? eligibility.reasons.join('; ') : 'Deal not eligible for this action';
}

function validateStatusTransition(currentStatus = 'draft', action, deal = {}, partner = {}) {
  const status = currentStatus || 'draft';
  const normalizedAction = (action || '').toLowerCase();

  if (!['approve', 'reject', 'suspend', 'toggle'].includes(normalizedAction)) {
    return { allowed: false, reason: `Unsupported action: ${action}` };
  }

  switch (normalizedAction) {
    case 'approve':
      // Cannot approve already active deals
      if (status === 'active') {
        return { allowed: false, reason: 'Deal is already active. No action needed.' };
      }
      
      // Cannot reactivate expired deals
      if (status === 'expired') {
        return { allowed: false, reason: 'Expired deals cannot be reactivated. Please create a new deal with updated dates.' };
      }
      
      // Draft deals can be approved (will be activated)
      // All other statuses can transition to active (pending_approval, paused, rejected, null)
      return { allowed: true };

    case 'reject':
      // Active deals cannot be rejected - they can only be paused
      if (status === 'active') {
        return { allowed: false, reason: 'Active deals cannot be rejected directly. Please pause the deal first, then reject it if needed.' };
      }
      // All other statuses can be rejected
      return { allowed: true };

    case 'suspend':
      if (status !== 'active') {
        return { allowed: false, reason: `Only active deals can be paused. Current status: ${status}. To reject this deal, use the reject action instead.` };
      }
      return { allowed: true };

    case 'toggle':
      if (status === 'active' || status === 'paused') {
        return { allowed: true };
      }
      return { allowed: false, reason: `Cannot toggle deal in ${status} state` };

    default:
      return { allowed: false, reason: `Unsupported action: ${action}` };
  }
}

// Get admin dashboard
async function getDashboard(range = '30') {
  const rangeDays = Math.min(Math.max(parseInt(range, 10) || 30, 1), 180);
  return await adminRepository.getDashboardStats(rangeDays);
}

// List admin partners
async function listPartners(filters = {}) {
  return await adminRepository.listAdminPartners(filters);
}

// Update partner status
async function updatePartnerStatus(partnerId, action, actorUserId, actorRole) {
  if (!['approve', 'reject', 'suspend', 'toggle'].includes(action)) {
    throw new AppError(400, "Invalid action provided");
  }

  const partnerResult = await adminRepository.updatePartnerStatus(partnerId, action, actorUserId, actorRole);
  if (!partnerResult.success) {
    throw new AppError(400, partnerResult.error || "Failed to update partner status");
  }

  return partnerResult.data;
}

// Update partner featured eligibility
async function updatePartnerFeaturedEligibility(partnerId, approved_for_featured, reason, actorUserId, actorRole) {
  const result = await adminRepository.updatePartnerFeaturedEligibility(partnerId, approved_for_featured);
  if (!result) {
    throw new AppError(404, "Partner not found");
  }

  await writeAudit(actorUserId, actorRole, 'partner_feature_eligibility', 'partner', partnerId, {
    ...result,
    reason: reason || null
  });

  return { success: true };
}

// List admin deals
async function listDeals(filters = {}) {
  return await adminRepository.listAdminDeals(filters);
}

// Update deal status
async function updateDealStatus(dealId, action, actorUserId, actorRole) {
  if (!['approve', 'reject', 'suspend', 'toggle'].includes(action)) {
    throw new AppError(400, "Invalid action provided");
  }

  // For regular approve/reject/suspend, don't check featured eligibility
  const eligibility = await adminRepository.checkDealEligibility(dealId, pool, {
    checkFeaturedEligibility: false,
    requireValidDates: false
  });
  if (!eligibility) {
    throw new AppError(404, "Deal not found");
  }

  if (!eligibility.eligible) {
    throw new AppError(400, `Deal not eligible: ${summarizeEligibilityReasons(eligibility)}`);
  }

  const { allowed, reason } = validateStatusTransition(
    eligibility.deal.status,
    action,
    eligibility.deal,
    eligibility.partner
  );

  if (!allowed) {
    throw new AppError(400, reason);
  }

  const dealResult = await adminRepository.updateDealStatus(dealId, action, actorUserId, actorRole);
  if (!dealResult.success) {
    throw new AppError(400, dealResult.error || `Unable to ${action} deal`);
  }

  return dealResult.data;
}

// Update offer featured status
async function updateOfferFeaturedStatus(offerId, is_promoted, reason, actorUserId, actorRole, force = false) {
  // For featured/trending operations, check featured eligibility
  const eligibility = await adminRepository.checkDealEligibility(offerId, pool, {
    checkFeaturedEligibility: true,
    requireValidDates: false
  });
  if (!eligibility) {
    throw new AppError(404, "Deal not found");
  }

  if (!eligibility.eligible) {
    throw new AppError(400, `Deal not eligible: ${summarizeEligibilityReasons(eligibility)}`);
  }

  const result = await adminRepository.updateOfferFeaturedStatus(
    offerId,
    is_promoted,
    force,
    actorUserId,
    actorRole
  );
  if (!result.success) {
    throw new AppError(400, result.error || "Unable to update promotion");
  }

  if (is_promoted && !result.partner_eligible && !force) {
    throw new AppError(400, "Partner is not eligible for promotion. Use force=true to override.");
  }

  if (is_promoted && !result.partner_eligible && force) {
    log(`⚠️ Admin forced promotion for ineligible partner (offer ID: ${offerId})`);
  }

  return { success: true, data: result.data };
}

async function updateTrendingStatus(dealId, action, actorUserId, actorRole) {
  try {
    if (action !== 'partner_request') {
      // For trending operations, check featured eligibility
      const eligibility = await adminRepository.checkDealEligibility(dealId, pool, {
        checkFeaturedEligibility: true,
        requireValidDates: false
      });
      if (!eligibility) {
        return { success: false, error: 'Deal not found' };
      }
      if (!eligibility.eligible) {
        return { success: false, error: `Deal not eligible: ${summarizeEligibilityReasons(eligibility)}` };
      }
    }

    const result = await adminRepository.updateTrendingStatus(dealId, action, actorUserId, actorRole);
    if (!result) {
      return { success: false, error: 'Deal not found' };
    }
    return result;
  } catch (error) {
    logError('updateTrendingStatus service error:', error);
    return { success: false, error: error.message || 'Failed to update trending status' };
  }
}

async function bulkApproveDeals(ids = [], actorUserId, actorRole) {
  const uniqueIds = ensureIdsArray(ids);
  const failed = [];

  for (const id of uniqueIds) {
    // For bulk approval, require valid dates (same as single approval)
    const eligibility = await adminRepository.checkDealEligibility(id, pool, {
      checkFeaturedEligibility: false,
      requireValidDates: true  // ✅ Require valid dates for activation
    });
    if (!eligibility) {
      failed.push({ id, reason: 'Deal not found' });
      continue;
    }
    if (!eligibility.eligible) {
      failed.push({ id, reason: `Deal not eligible: ${summarizeEligibilityReasons(eligibility)}` });
      continue;
    }
    const { allowed, reason } = validateStatusTransition(
      eligibility.deal.status,
      'approve',
      eligibility.deal,
      eligibility.partner
    );
    if (!allowed) {
      failed.push({ id, reason });
      continue;
    }
  }

  if (failed.length === uniqueIds.length) {
    // All failed, don't proceed
    return { succeeded: [], failed };
  }

  // Only process deals that passed validation
  const validIds = uniqueIds.filter(id => 
    !failed.some(f => f.id === id)
  );

  if (validIds.length === 0) {
    return { succeeded: [], failed };
  }

  return await adminRepository.bulkApproveDeals(validIds, actorUserId, actorRole);
}

async function bulkRejectDeals(ids = [], actorUserId, actorRole) {
  const uniqueIds = ensureIdsArray(ids);
  const failed = [];

  for (const id of uniqueIds) {
    // For rejection, only verify the deal exists and check status transition
    // Rejection is an administrative override, doesn't need full eligibility checks
    const dealResult = await pool.query(
      'SELECT id, status FROM partner_offers WHERE id = $1',
      [id]
    );
    
    if (dealResult.rowCount === 0) {
      failed.push({ id, reason: 'Deal not found' });
      continue;
    }
    
    const deal = dealResult.rows[0];
    
    // Cannot reject active deals - they must be paused first
    if (deal.status === 'active') {
      failed.push({ id, reason: 'Active deals cannot be rejected. Use pause instead.' });
      continue;
    }
    
    // Check status transition
    const { allowed, reason } = validateStatusTransition(deal.status, 'reject');
    if (!allowed) {
      failed.push({ id, reason });
      continue;
    }
  }

  if (failed.length === uniqueIds.length) {
    return { succeeded: [], failed };
  }

  const validIds = uniqueIds.filter(id => 
    !failed.some(f => f.id === id)
  );

  if (validIds.length === 0) {
    return { succeeded: [], failed };
  }

  return await adminRepository.bulkRejectDeals(validIds, actorUserId, actorRole);
}

async function bulkApprovePartners(ids = [], actorUserId, actorRole) {
  const uniqueIds = ensureIdsArray(ids);
  const failed = [];

  for (const id of uniqueIds) {
    const partner = await adminRepository.getPartnerMeta(id);
    if (!partner) {
      failed.push({ id, reason: 'Partner not found' });
      continue;
    }
    if (partner.deleted_at) {
      failed.push({ id, reason: 'Partner has been deleted' });
      continue;
    }
    if (partner.is_active) {
      failed.push({ id, reason: 'Partner is already active' });
    }
  }

  if (failed.length) {
    return { succeeded: [], failed };
  }

  return await adminRepository.bulkApprovePartners(uniqueIds, actorUserId, actorRole);
}

// Get admin activity
async function getActivity(filters = {}) {
  return await adminRepository.getAdminActivity(filters);
}

// List admin users
async function listUsers() {
  return await adminRepository.listAdminUsers();
}

// Get admin analytics
async function getAnalytics(period = 'month') {
  return await adminRepository.getAdminAnalytics(period);
}

// Get system settings
async function getSettings() {
  const settingsMap = await adminRepository.getSystemSettings();

  const parseNumber = (value, fallback = 0) => {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const parseBoolean = (value, fallback = false) => {
    if (value === undefined || value === null) return fallback;
    if (typeof value === 'boolean') return value;
    return ['true', '1', 'yes', 'on'].includes(String(value).toLowerCase());
  };

  return {
    platform_name: settingsMap.platform_name || 'Elizian',
    default_commission: parseNumber(settingsMap.default_commission, 10),
    max_promoted: parseNumber(settingsMap.max_promoted_deals, 12),
    deal_approval_required: parseBoolean(settingsMap.deal_approval_required, true),
    partner_auto_approval: parseBoolean(settingsMap.partner_auto_approval, false),
    loyalty_points: parseNumber(settingsMap.loyalty_points_per_txn, 1),
    loyalty_rupees: parseNumber(settingsMap.loyalty_rupees_per_point, 100)
  };
}

// Update system settings
async function updateSettings(settings, userId) {
  const {
    platform_name,
    default_commission,
    max_promoted,
    deal_approval_required,
    partner_auto_approval,
    loyalty_points,
    loyalty_rupees
  } = settings;

  const updates = [
    { key: 'platform_name', value: platform_name },
    { key: 'default_commission', value: default_commission },
    { key: 'max_promoted_deals', value: max_promoted },
    { key: 'deal_approval_required', value: deal_approval_required },
    { key: 'partner_auto_approval', value: partner_auto_approval },
    { key: 'loyalty_points_per_txn', value: loyalty_points },
    { key: 'loyalty_rupees_per_point', value: loyalty_rupees }
  ].filter((entry) => entry.value !== undefined && entry.value !== null);

  await adminRepository.updateSystemSettings(
    updates.reduce((acc, { key, value }) => {
      acc[key] = value;
      return acc;
    }, {}),
    userId
  );

  return { success: true };
}

// Update single system setting
async function updateSetting(key, value, userId) {
  await adminRepository.updateSystemSetting(key, value, userId);
  return { success: true };
}

// Get admin sessions
async function getSessions() {
  return await adminRepository.getAdminSessions();
}

// Get admin archives
async function getArchives() {
  return await adminRepository.getAdminArchives();
}

// Reactivate archived item
async function reactivateArchive(archiveId, actorUserId, actorRole) {
  const result = await adminRepository.reactivateArchive(archiveId);
  if (!result) {
    throw new AppError(404, "Archive not found");
  }

  await writeAudit(actorUserId, actorRole, 'archive_reactivate', result.entity_type, result.entity_id, {
    archive_id: archiveId
  });

  return result;
}

// Archive expired items (manual trigger)
async function archiveExpiredItems() {
  return await adminRepository.archiveExpiredItems();
}

module.exports = {
  getDashboard,
  listPartners,
  updatePartnerStatus,
  updatePartnerFeaturedEligibility,
  listDeals,
  updateDealStatus,
  updateOfferFeaturedStatus,
  updateTrendingStatus,
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
  archiveExpiredItems,
  validateStatusTransition
};


