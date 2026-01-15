const adminRepository = require('../repositories/adminRepository');
const { getPool } = require('../config/db');
const { writeAudit } = require('../utils/audit');
const { AppError } = require('../../utils/response');
const { logError, log } = require('../../utils/logger');
const { emitRealtimeEvent, emitToRoom, REALTIME_EVENTS } = require('../utils/realtimeEmitter');

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
async function updateOfferFeaturedStatus(offerId, is_trending, reason, actorUserId, actorRole, force = false) {
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
    is_trending,
    force,
    actorUserId,
    actorRole
  );
  if (!result.success) {
    throw new AppError(400, result.error || "Unable to update trending status");
  }

  if (is_trending && !result.partner_eligible && !force) {
    throw new AppError(400, "Partner is not eligible for trending. Use force=true to override.");
  }

  if (is_trending && !result.partner_eligible && force) {
    log(`⚠️ Admin forced trending for ineligible partner (offer ID: ${offerId})`);
  }

  const trendingData = result.data || {};
  const nextState = trendingData.next || {};
  const previousState = trendingData.previous || {};

  emitRealtimeEvent(REALTIME_EVENTS.DEAL_TRENDING_CHANGED, {
    offerId,
    isTrending: Boolean(nextState.is_trending),
    previousTrending: Boolean(previousState.is_trending),
    featuredRequestPending: Boolean(nextState.featured_request_pending),
    forcedByAdmin: Boolean(nextState.forced_by_admin),
    partnerId: eligibility.partner?.id || null,
    partnerName: eligibility.partner?.name || null,
    offerTitle: eligibility.deal?.title || null,
    source: 'admin_console_toggle',
    actorRole: actorRole || null,
    timestamp: new Date().toISOString()
  });

  return { success: true, data: result.data };
}

async function updateTrendingStatus(dealId, action, actorUserId, actorRole) {
  try {
    let eligibilityContext = null;
    if (action !== 'partner_request') {
      // For trending operations, check featured eligibility
      eligibilityContext = await adminRepository.checkDealEligibility(dealId, pool, {
        checkFeaturedEligibility: true,
        requireValidDates: false
      });
      if (!eligibilityContext) {
        return { success: false, error: 'Deal not found' };
      }
      if (!eligibilityContext.eligible) {
        return { success: false, error: `Deal not eligible: ${summarizeEligibilityReasons(eligibilityContext)}` };
      }
    }

    const result = await adminRepository.updateTrendingStatus(dealId, action, actorUserId, actorRole);
    if (!result) {
      return { success: false, error: 'Deal not found' };
    }
    if (result.success && action !== 'partner_request') {
      emitRealtimeEvent(REALTIME_EVENTS.DEAL_TRENDING_CHANGED, {
        offerId: dealId,
        isTrending: Boolean(result.data?.is_trending),
        previousTrending: Boolean(eligibilityContext?.deal?.is_trending),
        featuredRequestPending: Boolean(result.data?.featured_request_pending),
        partnerId: eligibilityContext?.partner?.id || null,
        partnerName: eligibilityContext?.partner?.name || null,
        offerTitle: eligibilityContext?.deal?.title || null,
        source: `admin_${action}`,
        actorRole: actorRole || null,
        timestamp: new Date().toISOString()
      });
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
async function listUsers(filters = {}) {
  return await adminRepository.listAdminUsers(filters);
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

// ============================================
// BOOKING MANAGEMENT SERVICES
// ============================================

// List all bookings with advanced filters
async function listBookings({ status, search, startDate, endDate, page, limit }) {
  try {
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT 
        b.id,
        b.booking_reference,
        b.booking_date,
        b.booking_time,
        b.num_tickets,
        b.status,
        b.total_price,
        b.fiat_amount,
        b.ezt_redeemed,
        b.booking_type,
        b.created_at,
        CONCAT(u.first_name, ' ', u.last_name) as user_name,
        u.email as user_email,
        u.phone_number as user_phone,
        p.name as partner_name,
        po.title as deal_title,
        po.service_type as deal_type
      FROM bookings b
      LEFT JOIN users u ON b.user_id = u.id
      LEFT JOIN partners p ON b.partner_id = p.id
      LEFT JOIN partner_offers po ON b.deal_id = po.id
      WHERE 1=1
    `;
    
    const params = [];
    let paramCounter = 1;
    
    // Filter by status
    if (status && status !== 'all') {
      query += ` AND b.status = $${paramCounter}`;
      params.push(status);
      paramCounter++;
    }
    
    // Search by user name, email, partner name, or booking reference
    if (search) {
      query += ` AND (
        CONCAT(u.first_name, ' ', u.last_name) ILIKE $${paramCounter} OR
        u.email ILIKE $${paramCounter} OR
        p.name ILIKE $${paramCounter} OR
        b.booking_reference ILIKE $${paramCounter} OR
        po.title ILIKE $${paramCounter}
      )`;
      params.push(`%${search}%`);
      paramCounter++;
    }
    
    // Filter by date range
    if (startDate) {
      query += ` AND b.booking_date >= $${paramCounter}`;
      params.push(startDate);
      paramCounter++;
    }
    
    if (endDate) {
      query += ` AND b.booking_date <= $${paramCounter}`;
      params.push(endDate);
      paramCounter++;
    }
    
    // Get total count
    const countQuery = `SELECT COUNT(*) FROM (${query}) as filtered_bookings`;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);
    
    // Add ordering and pagination
    query += ` ORDER BY b.created_at DESC LIMIT $${paramCounter} OFFSET $${paramCounter + 1}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    return {
      bookings: result.rows,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  } catch (err) {
    logError('Error listing bookings:', err);
    throw new AppError(500, 'Failed to retrieve bookings');
  }
}

// Get detailed booking information
async function getBookingDetails(bookingId) {
  try {
    const query = `
      SELECT 
        b.*,
        CONCAT(u.first_name, ' ', u.last_name) as user_name,
        u.email as user_email,
        u.phone_number as user_phone,
        u.current_tier_id as user_tier,
        p.name as partner_name,
        p.email as partner_email,
        p.phone_number as partner_phone,
        p.address as partner_address,
        po.title as deal_title,
        po.description as deal_description,
        po.service_type as deal_type,
        po.price as deal_price,
        po.discount_percentage as deal_discount,
        tl.transaction_type as payment_method,
        tl.amount as payment_amount,
        tl.created_at as payment_date
      FROM bookings b
      LEFT JOIN users u ON b.user_id = u.id
      LEFT JOIN partners p ON b.partner_id = p.id
      LEFT JOIN partner_offers po ON b.deal_id = po.id
      LEFT JOIN token_ledger tl ON b.id = tl.booking_id AND tl.transaction_type = 'redeemed'
      WHERE b.id = $1
    `;
    
    const result = await pool.query(query, [bookingId]);
    
    if (result.rows.length === 0) {
      throw new AppError(404, 'Booking not found');
    }
    
    const booking = result.rows[0];
    
    // Get tier information if it exists
    // Use user_tier_at_booking (actual column name) instead of tier_achieved_at_booking
    const tierName = booking.user_tier_at_booking || booking.current_tier_name;
    if (tierName) {
      const tierQuery = `
        SELECT * FROM loyalty_tiers 
        WHERE tier_name = $1
      `;
      const tierResult = await pool.query(tierQuery, [tierName]);
      booking.tier_info = tierResult.rows[0] || null;
    }
    
    // Get transaction history for this booking
    const transactionQuery = `
      SELECT * FROM transactions
      WHERE booking_id = $1
      ORDER BY created_at DESC
    `;
    const transactionResult = await pool.query(transactionQuery, [bookingId]);
    booking.transactions = transactionResult.rows;
    
    return booking;
  } catch (err) {
    if (err instanceof AppError) throw err;
    logError('Error getting booking details:', err);
    throw new AppError(500, 'Failed to retrieve booking details');
  }
}

// Update booking status
async function updateBookingStatus(bookingId, status, reason, actorId, actorRole) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Get current booking (including voucher_state and voucher_code)
    const bookingResult = await client.query(
      'SELECT *, voucher_state, voucher_code FROM bookings WHERE id = $1 FOR UPDATE',
      [bookingId]
    );
    
    if (bookingResult.rows.length === 0) {
      throw new AppError(404, 'Booking not found');
    }
    
    const currentBooking = bookingResult.rows[0];
    const previousStatus = currentBooking.status;
    
    // Validate status transition
    const validStatuses = ['pending', 'confirmed', 'cancelled', 'completed', 'no_show'];
    if (!validStatuses.includes(status)) {
      throw new AppError(400, `Invalid status: ${status}`);
    }
    
    // Update booking status
    const updateResult = await client.query(
      `UPDATE bookings 
       SET status = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 
       RETURNING *`,
      [status, bookingId]
    );
    
    // Sync voucher_state with booking status (if voucher_code exists)
    if (currentBooking.voucher_code) {
      try {
        const voucherStateMachine = require('./voucherStateMachine');
        const currentVoucherState = currentBooking.voucher_state || 'created';
        
        // Map booking status to voucher_state transitions
        let newVoucherState = null;
        if (status === 'confirmed' && currentVoucherState === 'booked') {
          newVoucherState = 'active';
        } else if (status === 'cancelled' && ['booked', 'active', 'created'].includes(currentVoucherState)) {
          newVoucherState = 'cancelled';
        } else if (status === 'pending' && currentVoucherState === 'created') {
          newVoucherState = 'booked';
        }
        
        // Transition voucher state if needed
        if (newVoucherState && voucherStateMachine.isValidTransition(currentVoucherState, newVoucherState)) {
          await voucherStateMachine.transitionState({
            bookingId: bookingId,
            voucherCode: currentBooking.voucher_code,
            fromState: currentVoucherState,
            toState: newVoucherState,
            actorId: actorId,
            actorRole: actorRole,
            reasonCode: 'booking_status_update',
            reasonText: `Booking status changed from '${previousStatus}' to '${status}'`,
            executor: client
          });
          log(`✅ Voucher state synced: ${currentVoucherState} → ${newVoucherState} (Booking: ${bookingId})`);
        }
      } catch (stateError) {
        // Log but don't fail booking status update
        logError('⚠️ Voucher state sync error (non-blocking):', stateError);
      }
    }
    
    // Log audit
    await writeAudit(client, {
      actor_user_id: actorId,
      actor_role: actorRole,
      action: 'booking_status_update',
      entity_type: 'booking',
      entity_id: bookingId,
      meta: {
        previous_status: previousStatus,
        new_status: status,
        reason: reason || null,
        booking_reference: currentBooking.booking_reference
      }
    });
    
    // If status is cancelled, process refund logic here if needed
    if (status === 'cancelled' && currentBooking.status !== 'cancelled') {
      // TODO: Trigger refund process if applicable
      log(`Booking ${bookingId} cancelled - refund process may be required`);
    }
    
    await client.query('COMMIT');
    
    const updatedBooking = updateResult.rows[0];
    const bookingEvent = {
      action: 'status_changed',
      bookingId: bookingId,
      status,
      previousStatus,
      reason: reason || null,
      bookingReference: currentBooking.booking_reference,
      partnerId: currentBooking.partner_id,
      userId: currentBooking.user_id,
      timestamp: new Date().toISOString()
    };

    emitRealtimeEvent(REALTIME_EVENTS.BOOKING_STATUS_CHANGED, bookingEvent);
    emitRealtimeEvent(REALTIME_EVENTS.PARTNER_BOOKING_UPDATE, bookingEvent);
    emitToRoom(`partners:${currentBooking.partner_id}`, REALTIME_EVENTS.PARTNER_BOOKING_UPDATE, bookingEvent);
    emitToRoom(`users:${currentBooking.user_id}`, REALTIME_EVENTS.BOOKING_STATUS_CHANGED, bookingEvent);
    
    return updatedBooking;
  } catch (err) {
    await client.query('ROLLBACK');
    if (err instanceof AppError) throw err;
    logError('Error updating booking status:', err);
    throw new AppError(500, 'Failed to update booking status');
  } finally {
    client.release();
  }
}

// Process refund for a booking
async function processRefund(bookingId, amount, reason, refundType, actorId, actorRole) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Get booking details
    const bookingResult = await client.query(
      'SELECT * FROM bookings WHERE id = $1 FOR UPDATE',
      [bookingId]
    );
    
    if (bookingResult.rows.length === 0) {
      throw new AppError(404, 'Booking not found');
    }
    
    const booking = bookingResult.rows[0];
    
    // Validate refund amount
    const refundAmount = parseFloat(amount);
    if (isNaN(refundAmount) || refundAmount <= 0) {
      throw new AppError(400, 'Invalid refund amount');
    }
    
    if (refundAmount > parseFloat(booking.fiat_amount || booking.total_price)) {
      throw new AppError(400, 'Refund amount exceeds booking amount');
    }
    
    // Create refund record in transactions table
    const transactionResult = await client.query(
      `INSERT INTO transactions 
       (user_id, booking_id, amount, transaction_type, description, created_at)
       VALUES ($1, $2, $3, 'refund', $4, CURRENT_TIMESTAMP)
       RETURNING *`,
      [booking.user_id, bookingId, refundAmount, reason || 'Admin refund']
    );
    
    // If EZT was redeemed, credit it back
    if (booking.ezt_redeemed && parseFloat(booking.ezt_redeemed) > 0) {
      await client.query(
        `UPDATE users 
         SET available_tokens = available_tokens + $1 
         WHERE id = $2`,
        [booking.ezt_redeemed, booking.user_id]
      );
      
      // Log token credit
      await client.query(
        `INSERT INTO token_ledger 
         (user_id, booking_id, amount, transaction_type, description, created_at)
         VALUES ($1, $2, $3, 'refund_credit', $4, CURRENT_TIMESTAMP)`,
        [booking.user_id, bookingId, booking.ezt_redeemed, 'EZT refund for cancelled booking']
      );
    }
    
    // Update booking status to cancelled
    await client.query(
      `UPDATE bookings 
       SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1`,
      [bookingId]
    );
    
    // Log audit
    await writeAudit(client, {
      actor_user_id: actorId,
      actor_role: actorRole,
      action: 'refund_processed',
      entity_type: 'booking',
      entity_id: bookingId,
      meta: {
        refund_amount: refundAmount,
        refund_type: refundType || 'full',
        reason: reason || null,
        ezt_refunded: booking.ezt_redeemed || 0,
        booking_reference: booking.booking_reference
      }
    });
    
    await client.query('COMMIT');
    
    const refundPayload = {
      action: 'refunded',
      bookingId,
      refundId: transactionResult.rows[0]?.id || null,
      amount: refundAmount,
      reason: reason || null,
      refundType: refundType || 'full',
      userId: booking.user_id,
      partnerId: booking.partner_id,
      bookingReference: booking.booking_reference,
      eztRefunded: booking.ezt_redeemed || 0,
      timestamp: new Date().toISOString()
    };

    emitRealtimeEvent(REALTIME_EVENTS.BOOKING_REFUNDED, refundPayload);
    emitRealtimeEvent(REALTIME_EVENTS.PARTNER_BOOKING_UPDATE, refundPayload);
    emitToRoom(`partners:${booking.partner_id}`, REALTIME_EVENTS.PARTNER_BOOKING_UPDATE, refundPayload);
    emitToRoom(`users:${booking.user_id}`, REALTIME_EVENTS.BOOKING_REFUNDED, refundPayload);
    
    return {
      refund: transactionResult.rows[0],
      booking: booking,
      ezt_refunded: booking.ezt_redeemed || 0
    };
  } catch (err) {
    await client.query('ROLLBACK');
    if (err instanceof AppError) throw err;
    logError('Error processing refund:', err);
    throw new AppError(500, 'Failed to process refund');
  } finally {
    client.release();
  }
}

// Get booking statistics
async function getBookingStats(range = '30') {
  try {
    const days = parseInt(range);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const query = `
      SELECT 
        COUNT(*) as total_bookings,
        COUNT(*) FILTER (WHERE status = 'confirmed') as confirmed_bookings,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_bookings,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_bookings,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_bookings,
        COUNT(*) FILTER (WHERE status = 'no_show') as no_show_bookings,
        COALESCE(SUM(total_price), 0) as total_revenue,
        COALESCE(SUM(fiat_amount), 0) as total_fiat_revenue,
        COALESCE(SUM(ezt_redeemed), 0) as total_ezt_redeemed,
        COALESCE(AVG(total_price), 0) as avg_booking_value,
        COUNT(*) FILTER (WHERE booking_date >= CURRENT_DATE) as upcoming_bookings,
        COUNT(*) FILTER (WHERE booking_date < CURRENT_DATE AND status NOT IN ('completed', 'cancelled')) as overdue_bookings
      FROM bookings
      WHERE created_at >= $1
    `;
    
    const result = await pool.query(query, [startDate]);
    const stats = result.rows[0];
    
    // Get daily breakdown
    const dailyQuery = `
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as count,
        COALESCE(SUM(total_price), 0) as revenue
      FROM bookings
      WHERE created_at >= $1
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `;
    
    const dailyResult = await pool.query(dailyQuery, [startDate]);
    stats.daily_breakdown = dailyResult.rows;
    
    // Get booking type breakdown
    const typeQuery = `
      SELECT 
        booking_type,
        COUNT(*) as count,
        COALESCE(SUM(total_price), 0) as revenue
      FROM bookings
      WHERE created_at >= $1
      GROUP BY booking_type
      ORDER BY count DESC
    `;
    
    const typeResult = await pool.query(typeQuery, [startDate]);
    stats.type_breakdown = typeResult.rows;
    
    return stats;
  } catch (err) {
    logError('Error getting booking stats:', err);
    throw new AppError(500, 'Failed to retrieve booking statistics');
  }
}

// Get rewards overview
async function getRewardsOverview() {
  const { getPool } = require('../config/db');
  const pool = getPool();
  
  try {
    // Total EZT in circulation (sum of all user balances)
    const circulationResult = await pool.query(
      `SELECT COALESCE(SUM(available_tokens), 0)::numeric as total_ezt_circulation
       FROM users`
    );
    const totalEztCirculation = parseFloat(circulationResult.rows[0]?.total_ezt_circulation || 0);
    
    // Total EZT earned (sum of all earned tokens)
    const earnedResult = await pool.query(
      `SELECT COALESCE(SUM(total_tokens_earned), 0)::numeric as total_ezt_earned
       FROM users`
    );
    const totalEztEarned = parseFloat(earnedResult.rows[0]?.total_ezt_earned || 0);
    
    // Total EZT redeemed (sum of all spent tokens)
    const redeemedResult = await pool.query(
      `SELECT COALESCE(SUM(total_tokens_spent), 0)::numeric as total_ezt_redeemed
       FROM users`
    );
    const totalEztRedeemed = parseFloat(redeemedResult.rows[0]?.total_ezt_redeemed || 0);
    
    // Tier distribution
    const tierDistributionResult = await pool.query(
      `SELECT 
        COALESCE(current_tier_name, 'Ather') as tier,
        COUNT(*)::int as count
       FROM users
       GROUP BY current_tier_name
       ORDER BY 
         CASE COALESCE(current_tier_name, 'Ather')
           WHEN 'Ather' THEN 1
           WHEN 'Nova' THEN 2
           WHEN 'Luminar' THEN 3
           WHEN 'Valiant' THEN 4
           WHEN 'Echelon' THEN 5
           ELSE 1
         END`
    );
    const tierDistribution = {};
    tierDistributionResult.rows.forEach(row => {
      tierDistribution[row.tier] = row.count;
    });
    
    // Recent EZT transactions (last 20)
    const recentTransactionsResult = await pool.query(
      `SELECT 
        tl.id,
        tl.user_id,
        tl.amount,
        tl.balance_after,
        tl.ledger_type,
        tl.description,
        tl.created_at,
        u.first_name || ' ' || u.last_name as user_name,
        u.phone_number as user_phone
      FROM token_ledger tl
      LEFT JOIN users u ON tl.user_id = u.id
      ORDER BY tl.created_at DESC
      LIMIT 20`
    );
    const recentTransactions = recentTransactionsResult.rows.map(tx => ({
      id: tx.id,
      user_name: tx.user_name || 'Unknown',
      user_phone: tx.user_phone || null,
      transaction_type: tx.ledger_type || 'unknown',
      amount: parseFloat(tx.amount || 0),
      balance_after: parseFloat(tx.balance_after || 0),
      description: tx.description || '',
      created_at: tx.created_at
    }));
    
    // Recent tier upgrades (last 10)
    const recentUpgradesResult = await pool.query(
      `SELECT 
        uth.id,
        uth.user_id,
        uth.from_tier_name,
        uth.to_tier_name,
        uth.annual_spend_at_change,
        uth.changed_at,
        u.first_name || ' ' || u.last_name as user_name,
        u.phone_number as user_phone
      FROM user_tier_history uth
      LEFT JOIN users u ON uth.user_id = u.id
      WHERE uth.tier_level_change > 0
      ORDER BY uth.changed_at DESC
      LIMIT 10`
    );
    const recentUpgrades = recentUpgradesResult.rows.map(upgrade => ({
      user_name: upgrade.user_name || 'Unknown',
      user_phone: upgrade.user_phone || null,
      from_tier: upgrade.from_tier_name || 'Ather',
      to_tier: upgrade.to_tier_name || 'Ather',
      total_spending: parseFloat(upgrade.annual_spend_at_change || 0),
      upgraded_at: upgrade.changed_at
    }));
    
    return {
      total_ezt_in_circulation: totalEztCirculation,
      total_ezt_earned: totalEztEarned,
      total_ezt_redeemed: totalEztRedeemed,
      tier_distribution: tierDistribution,
      recent_transactions: recentTransactions,
      recent_upgrades: recentUpgrades
    };
  } catch (error) {
    logError('Error in getRewardsOverview:', error);
    throw error;
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
  getRewardsOverview,
  validateStatusTransition,
  // Booking management
  listBookings,
  getBookingDetails,
  updateBookingStatus,
  processRefund,
  getBookingStats
};


