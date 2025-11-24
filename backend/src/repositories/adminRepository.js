const { getPool } = require('../config/db');
const { logError } = require('../../utils/logger');
const { createAuditLogEntry } = require('../../utils/audit');

const pool = getPool();

const OFFER_STATUS = {
  DRAFT: 'draft',
  PENDING: 'pending_approval',
  ACTIVE: 'active',
  PAUSED: 'paused',
  REJECTED: 'rejected',
  EXPIRED: 'expired'
};

const TRENDING_ACTIONS = new Set(['partner_request', 'admin_approve', 'admin_reject']);

function getDealScheduleStatus(startUTC, endUTC) {
  const now = new Date();

  if (!startUTC || !endUTC) return 'invalid';

  const start = new Date(startUTC);
  const end = new Date(endUTC);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 'invalid';
  if (end < now) return 'expired';
  if (start > now) return 'upcoming';
  return 'live';
}

async function checkDealEligibility(dealId, executor = pool, options = {}) {
  const { lock = false, checkFeaturedEligibility = false, requireValidDates = false } = options;
  const result = await executor.query(
    `SELECT 
        o.id,
        o.title,
        o.start_date,
        o.end_date,
        o.status,
        o.original_price,
        o.discounted_price,
        o.featured_request_pending,
        o.is_active AS deal_is_active,
        o.is_promoted,
        o.is_trending,
        o.forced_by_admin,
        p.status AS partner_status,
        p.id AS partner_id,
        p.name AS partner_name,
        p.is_active,
        p.approved_for_featured
     FROM partner_offers o
     JOIN partners p ON p.id = o.partner_id
     WHERE o.id = $1
     ${lock ? 'FOR UPDATE' : ''}`,
    [dealId]
  );

  if (result.rowCount === 0) {
    return null;
  }

  const row = result.rows[0];
  const reasons = [];
  const warnings = [];
  let eligible = true;

  if (row.partner_status && row.partner_status !== 'active') {
    reasons.push(`Partner status is ${row.partner_status}`);
  } else if (!row.is_active) {
    reasons.push('Partner is inactive');
  }
  
  // Only check featured eligibility if explicitly requested (for trending/featured operations)
  if (checkFeaturedEligibility) {
    const isTrendingDeal = row.is_promoted || row.featured_request_pending || (row.is_trending || false);
    // Check eligibility: partner must be approved OR admin has forced it
    if (isTrendingDeal && !row.approved_for_featured && !row.forced_by_admin) {
      reasons.push('Partner is not approved for featured/trending content. Partner must be approved for featured content or admin must force the promotion.');
    }
  }
  
  if (row.status === OFFER_STATUS.EXPIRED) {
    reasons.push('Deal has already expired');
  }
  
  // Only enforce date requirements when activating deals
  if (requireValidDates) {
    if (!row.start_date || !row.end_date) {
      reasons.push('Deal must have start and end dates before activation');
    } else if (new Date(row.end_date) < new Date()) {
      reasons.push('Deal end date is in the past');
    } else if (new Date(row.start_date) >= new Date(row.end_date)) {
      reasons.push('Start date must be before end date');
    }
  }

  if (row.is_promoted) {
    warnings.push('Deal is already promoted');
  }
  if (row.status === OFFER_STATUS.PAUSED) {
    warnings.push('Deal is currently paused');
  }

  eligible = reasons.length === 0;

  return {
    eligible,
    reasons,
    warnings,
    partner: {
      id: row.partner_id,
      name: row.partner_name,
      status: row.partner_status || (row.is_active ? 'active' : 'pending'),
      is_active: row.is_active,
      approved_for_featured: row.approved_for_featured
    },
    deal: {
      id: row.id,
      title: row.title,
      status: row.status,
      start_date: row.start_date,
      end_date: row.end_date,
      is_promoted: row.is_promoted,
      is_trending: row.is_trending || false,
      original_price: row.original_price,
      discounted_price: row.discounted_price,
      featured_request_pending: row.featured_request_pending,
      is_active: row.deal_is_active,
      forced_by_admin: row.forced_by_admin
    }
  };
}

async function getPartnerMeta(partnerId, executor = pool, options = {}) {
  const { lock = false } = options;
  const result = await executor.query(
    `SELECT id, is_active, deleted_at
     FROM partners
     WHERE id = $1
     ${lock ? 'FOR UPDATE' : ''}`,
    [partnerId]
  );
  return result.rows[0] || null;
}

// Get admin dashboard stats
async function getDashboardStats(rangeDays = 30) {
  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);
  startDate.setDate(startDate.getDate() - (rangeDays - 1));

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStartMs = todayStart.getTime();
  const rangeStartMs = startDate.getTime();

  const startDateISO = startDate.toISOString().slice(0, 10);

  const [
    totalUsersResult,
    newUsersTodayResult,
    totalPartnersResult,
    pendingPartnersResult,
    dealsResult
  ] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS count FROM users`),
    pool.query(`SELECT COUNT(*)::int AS count FROM users WHERE created_at >= to_timestamp($1 / 1000.0)`, [todayStartMs]),
    pool.query(`SELECT COUNT(*)::int AS count FROM partners`),
    pool.query(`SELECT COUNT(*)::int AS count FROM partners WHERE status <> 'active' OR status IS NULL`),
    pool.query(`
      SELECT
        COUNT(*)::int AS total_deals,
        COUNT(*) FILTER (WHERE status = 'active' AND (end_date IS NULL OR end_date >= NOW()))::int AS active_deals,
        COUNT(*) FILTER (WHERE is_promoted = true)::int AS promoted_deals
      FROM partner_offers
    `)
  ]);

  let activeSessions = 0;
  try {
    const sessionsResult = await pool.query(`SELECT COUNT(*)::int AS count FROM user_sessions WHERE expires_at > NOW()`);
    activeSessions = sessionsResult.rows[0]?.count || 0;
  } catch (sessionError) {
    if (sessionError.code !== '42P01') {
      throw sessionError;
    }
  }

  let totalRevenue = 0;
  let revenueChart = [];
  try {
    const revenueResult = await pool.query(
      `SELECT booking_date::date AS date, COALESCE(SUM(fiat_amount), 0)::numeric AS amount
       FROM bookings
       WHERE booking_date >= $1
       GROUP BY booking_date::date
       ORDER BY booking_date::date ASC`,
      [startDateISO]
    );
    revenueChart = revenueResult.rows.map((row) => ({
      date: row.date,
      amount: parseFloat(row.amount || 0)
    }));
    totalRevenue = revenueChart.reduce((sum, point) => sum + point.amount, 0);
  } catch (revenueError) {
    if (revenueError.code !== '42P01') {
      throw revenueError;
    }
  }

  let recentActivity = [];
  try {
    const activityResult = await pool.query(`
      SELECT 
        al.action,
        al.entity_type,
        al.entity_id,
        al.meta,
        al.created_at,
        al.actor_role,
        al.actor_user_id,
        COALESCE(ua.first_name || ' ' || ua.last_name, ua.email, 'System') AS actor_name,
        CASE
          WHEN al.entity_type = 'offer' THEN po.title
          WHEN al.entity_type = 'partner' THEN pr.name
          WHEN al.entity_type = 'user' THEN ue.first_name || ' ' || ue.last_name
          ELSE NULL
        END AS entity_name
      FROM audit_log al
      LEFT JOIN users ua ON al.actor_user_id = ua.id
      LEFT JOIN partner_offers po ON al.entity_type = 'offer' AND po.id = al.entity_id
      LEFT JOIN partners pr ON al.entity_type = 'partner' AND pr.id = al.entity_id
      LEFT JOIN users ue ON al.entity_type = 'user' AND ue.id = al.entity_id
      ORDER BY al.created_at DESC
      LIMIT 10
    `);

    recentActivity = activityResult.rows.map((row) => {
      let meta = row.meta;
      if (typeof meta === 'string') {
        try {
          meta = JSON.parse(meta);
        } catch (e) {
          meta = {};
        }
      }
      return {
        action: row.action,
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        entity_name: row.entity_name,
        actor_name: row.actor_name,
        created_at: row.created_at,
        meta: meta || {}
      };
    });
  } catch (activityError) {
    if (activityError.code !== '42P01') {
      throw activityError;
    }
  }

  return {
    users: {
      total: totalUsersResult.rows[0]?.count || 0,
      new_today: newUsersTodayResult.rows[0]?.count || 0,
      active_sessions: activeSessions
    },
    partners: {
      total: totalPartnersResult.rows[0]?.count || 0,
      pending: pendingPartnersResult.rows[0]?.count || 0
    },
    deals: {
      total: dealsResult.rows[0]?.total_deals || 0,
      active: dealsResult.rows[0]?.active_deals || 0,
      promoted: dealsResult.rows[0]?.promoted_deals || 0
    },
    revenue: {
      total: totalRevenue,
      chart: revenueChart
    },
    recent_activity: recentActivity
  };
}

// List admin partners
async function listAdminPartners({ status = 'all' } = {}) {
  const normalizedStatus = status ? status.toLowerCase() : 'all';
  const params = [];
  const conditions = [];

  switch (normalizedStatus) {
    case 'approved':
      conditions.push('p.is_active = true');
      break;
    case 'pending':
      conditions.push('p.is_active = false');
      break;
    case 'suspended':
    case 'rejected':
      params.push(normalizedStatus);
      conditions.push(`p.status = $${params.length}`);
      break;
    default:
      if (normalizedStatus !== 'all') {
        params.push(normalizedStatus);
        conditions.push(`p.status = $${params.length}`);
      }
      break;
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await pool.query(
    `
    SELECT
      p.id,
      p.name,
      p.email,
      p.phone_number,
      p.address,
      p.is_active,
      p.status,
      p.approved_for_featured,
      p.created_at,
      COALESCE(offer_stats.active_deals, 0)::int AS active_deals,
      COALESCE(offer_stats.promoted_deals, 0)::int AS promoted_deals,
      COALESCE(booking_stats.total_bookings, 0)::int AS total_bookings,
      COALESCE(booking_stats.revenue, 0)::numeric AS revenue
    FROM partners p
    LEFT JOIN (
      SELECT 
        partner_id,
        COUNT(*) FILTER (WHERE status = 'active')::int AS active_deals,
        COUNT(*) FILTER (WHERE is_promoted = true)::int AS promoted_deals
      FROM partner_offers
      GROUP BY partner_id
    ) AS offer_stats ON offer_stats.partner_id = p.id
    LEFT JOIN (
      SELECT 
        partner_id,
        COUNT(*)::int AS total_bookings,
        COALESCE(SUM(fiat_amount), 0)::numeric AS revenue
      FROM bookings
      GROUP BY partner_id
    ) AS booking_stats ON booking_stats.partner_id = p.id
    ${whereClause}
    ORDER BY p.created_at DESC
    `,
    params
  );

  return result.rows.map((row) => {
    let computedStatus;
    if (row.is_active === true) {
      computedStatus = 'approved';
    } else if (row.is_active === false) {
      computedStatus = 'pending';
    } else {
      computedStatus = row.status || 'pending';
    }

    return {
      id: row.id,
      name: row.name,
      email: row.email,
      phone_number: row.phone_number,
      address: row.address,
      status: computedStatus,
      approved_for_featured: row.approved_for_featured,
      active_deals: row.active_deals,
      promoted_deals: row.promoted_deals,
      total_bookings: row.total_bookings,
      revenue: parseFloat(row.revenue || 0)
    };
  });
}

// Update partner status
async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return { success: true, data: result };
  } catch (err) {
    await client.query('ROLLBACK');
    return {
      success: false,
      error: err.message || 'Transaction failed',
      stack: err.stack || null
    };
  } finally {
    client.release();
  }
}

async function updatePartnerStatus(partnerId, action, actorUserId = null, actorRole = null) {
  const tx = await withTransaction(async (client) => {
    const currentResult = await client.query(
      `SELECT id, name, is_active, status, deleted_at FROM partners WHERE id = $1 FOR UPDATE`,
      [partnerId]
    );

    if (currentResult.rowCount === 0) {
      throw new Error('Partner not found');
    }

    const current = currentResult.rows[0];
    if (current.deleted_at) {
      throw new Error('Cannot update a deleted partner');
    }

    let nextActiveState = current.is_active;
    // Default to 'pending' if status is null (for backward compatibility)
    let nextStatus = current.status || 'pending';
    let actionLabel = action;

    switch (action) {
      case 'approve':
        if (current.is_active) {
          throw new Error('Partner is already active');
        }
        nextActiveState = true;
        nextStatus = 'active';
        actionLabel = 'approved';
        break;
      case 'reject':
        // Allow rejecting partners in any state
        nextActiveState = false;
        nextStatus = 'rejected';
        actionLabel = 'rejected';
        break;
      case 'suspend':
        // Only allow suspending active partners
        if (!current.is_active) {
          throw new Error('Cannot suspend an inactive partner');
        }
        nextActiveState = false;
        nextStatus = 'suspended';
        actionLabel = 'suspended';
        break;
      case 'toggle':
        // Toggle only works between active and suspended
        if (current.status === 'active') {
          nextActiveState = false;
          nextStatus = 'suspended';
          actionLabel = 'suspended';
        } else if (current.status === 'suspended') {
          nextActiveState = true;
          nextStatus = 'active';
          actionLabel = 'approved';
        } else {
          throw new Error('Can only toggle between active and suspended partners');
        }
        break;
      default:
        throw new Error('Invalid action provided');
    }

    const updateResult = await client.query(
      `UPDATE partners SET is_active = $1, status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *`,
      [nextActiveState, nextStatus, partnerId]
    );

    await createAuditLogEntry.call(
      { client, actorRole },
      actorUserId || null,
      `${actionLabel} partner`,
      'partner',
      partnerId,
      {
        previous: { is_active: current.is_active, status: current.status || null },
        next: { is_active: updateResult.rows[0].is_active, status: updateResult.rows[0].status }
      }
    );

    return updateResult.rows[0];
  });

  if (!tx.success) {
    return {
      success: false,
      error: tx.error,
      stack: tx.stack,
      context: { partnerId, action }
    };
  }

  return { success: true, data: tx.data };
}

// Update partner featured eligibility
async function updatePartnerFeaturedEligibility(partnerId, approved_for_featured) {
  const before = await pool.query('SELECT approved_for_featured FROM partners WHERE id = $1', [partnerId]);
  if (before.rowCount === 0) {
    return null;
  }

  await pool.query('UPDATE partners SET approved_for_featured = $1 WHERE id = $2', [!!approved_for_featured, partnerId]);

  return {
    previous: before.rows[0],
    next: { approved_for_featured: !!approved_for_featured }
  };
}

// List admin deals
async function listAdminDeals({ search = '', status = 'all', promo = 'all' } = {}) {
  const searchTerm = search.trim().toLowerCase();
  const normalizedStatus = status ? status.toLowerCase() : 'all';
  const normalizedPromo = promo ? promo.toLowerCase() : 'all';

  const filters = [];
  const params = [];
  let idx = 1;

  if (searchTerm) {
    filters.push(`(LOWER(po.title) LIKE $${idx} OR LOWER(p.name) LIKE $${idx})`);
    params.push(`%${searchTerm}%`);
    idx += 1;
  }

  if (normalizedStatus === 'active') {
    filters.push(`po.status = 'active'`);
  } else if (normalizedStatus === 'pending') {
    filters.push(`po.status IN ('draft', 'pending_approval', 'paused')`);
  } else if (normalizedStatus === 'expired') {
    filters.push(`po.status = 'expired'`);
  } else if (normalizedStatus === 'rejected') {
    filters.push(`po.status = 'rejected'`);
  }

  if (normalizedPromo === 'promoted') {
    filters.push(`po.is_promoted = true`);
  } else if (normalizedPromo === 'expiring') {
    filters.push(`po.end_date BETWEEN NOW() AND (NOW() + INTERVAL '3 day')`);
  } else if (normalizedPromo === 'pending_trending') {
    filters.push(`po.featured_request_pending = true`);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const result = await pool.query(
    `
    SELECT
      po.id,
      po.partner_id,
      po.title,
      po.description,
      po.original_price,
      po.discounted_price,
      po.discount_percentage,
      po.discount_amount,
      po.start_date,
      po.end_date,
      po.status,
      po.is_promoted,
      po.featured_request_pending,
      po.max_redemptions,
      po.current_redemptions,
      po.service_type,
      p.name AS partner_name,
      p.email AS partner_email
    FROM partner_offers po
    JOIN partners p ON p.id = po.partner_id
    ${whereClause}
    ORDER BY po.featured_request_pending DESC, po.created_at DESC
    LIMIT 200
    `,
    params
  );

  return result.rows.map((deal) => {
    const scheduleStatus = getDealScheduleStatus(deal.start_date, deal.end_date);

    return {
      id: deal.id,
      partner_id: deal.partner_id,
      partner_name: deal.partner_name,
      title: deal.title,
      description: deal.description,
      original_price: parseFloat(deal.original_price || 0),
      discounted_price: parseFloat(deal.discounted_price || 0),
      discount_percentage: parseFloat(deal.discount_percentage || 0),
      discount_amount: parseFloat(deal.discount_amount || 0),
      start_date: deal.start_date,
      end_date: deal.end_date,
      status: deal.status,
      schedule_status: scheduleStatus,
      is_promoted: deal.is_promoted,
      featured_request_pending: deal.featured_request_pending,
      max_redemptions: deal.max_redemptions,
      current_redemptions: deal.current_redemptions,
      service_type: deal.service_type
    };
  });
}

// Update deal status
async function updateDealStatus(dealId, action, actorUserId = null, actorRole = null) {
  const tx = await withTransaction(async (client) => {
    // First, check if deal is promoted/trending to determine if we need featured eligibility check
    const dealCheck = await client.query(
      'SELECT is_promoted, is_trending, featured_request_pending FROM partner_offers WHERE id = $1',
      [dealId]
    );
    
    if (dealCheck.rowCount === 0) {
      throw new Error('Deal not found');
    }
    
    const isPromotedDeal = dealCheck.rows[0]?.is_promoted || 
                          dealCheck.rows[0]?.is_trending || 
                          dealCheck.rows[0]?.featured_request_pending;
    
    // Check eligibility with appropriate settings
    // - Check featured eligibility if deal is promoted/trending
    // - Require valid dates when activating (approve action)
    const eligibility = await checkDealEligibility(dealId, client, { 
      lock: true, 
      checkFeaturedEligibility: isPromotedDeal,
      requireValidDates: action === 'approve' || (action === 'toggle' && dealCheck.rows[0]?.status !== OFFER_STATUS.ACTIVE)
    });
    
    if (!eligibility) {
      throw new Error('Deal not found');
    }

    const current = eligibility.deal;
    const partner = eligibility.partner;
    const now = new Date();
    const startDate = current.start_date ? new Date(current.start_date) : null;
    const endDate = current.end_date ? new Date(current.end_date) : null;
    const isExpired = endDate && endDate < now;

    const willActivate =
      action === 'approve' ||
      (action === 'toggle' && current.status !== OFFER_STATUS.ACTIVE);

    const validationErrors = [];

    if (willActivate) {
      // Check partner is active (either by is_active flag or status)
      const partnerIsActive = partner.is_active === true && 
        (partner.status === null || partner.status === 'active');
      
      if (!partnerIsActive) {
        const partnerStatusMsg = partner.status || (partner.is_active ? 'active' : 'pending');
        validationErrors.push(`Partner must be active to enable deals. Current status: ${partnerStatusMsg}`);
      }

      // Require dates for deal activation
      if (!startDate || !endDate) {
        validationErrors.push('Start date and end date are required to activate a deal.');
      } else {
        // Validate date formats
        if (Number.isNaN(startDate.getTime())) {
          validationErrors.push('Start date is invalid.');
        }
        if (Number.isNaN(endDate.getTime())) {
          validationErrors.push('End date is invalid.');
        }
        
        // Validate date logic
        if (endDate <= startDate) {
          validationErrors.push('End date must be after start date.');
        }
        
        // Don't allow activating already expired deals
        if (endDate < now) {
          validationErrors.push('Cannot activate a deal with end date in the past.');
        }
      }

      // Price validation - original_price is optional, discounted_price is required
      const originalPrice = (current.original_price !== null && current.original_price !== undefined) 
        ? parseFloat(current.original_price) 
        : null;
      
      const discountedPrice = (current.discounted_price !== null && current.discounted_price !== undefined)
        ? parseFloat(current.discounted_price)
        : null;
      
      // Validate original_price if provided (allow 0 for free deals)
      if (originalPrice !== null) {
        if (!Number.isFinite(originalPrice) || originalPrice < 0) {
          validationErrors.push('Original price must be a non-negative number if provided.');
        }
      }
      
      // Validate discounted_price (required for active deals, allow 0 for free deals)
      if (discountedPrice === null || !Number.isFinite(discountedPrice)) {
        validationErrors.push('Discounted price is required and must be a valid number.');
      } else if (discountedPrice < 0) {
        validationErrors.push('Discounted price cannot be negative.');
      }
      
      // Only compare prices if original_price is provided and > 0
      // Allow free deals (both prices = 0) or deals with only discounted_price
      if (
        originalPrice !== null &&
        Number.isFinite(originalPrice) &&
        originalPrice > 0 && // Only enforce discount rule if original price is actually set (> 0)
        discountedPrice !== null &&
        Number.isFinite(discountedPrice) &&
        discountedPrice >= originalPrice
      ) {
        validationErrors.push('Discounted price must be lower than original price when original price is set.');
      }
    }

    if (validationErrors.length > 0) {
      throw new Error(validationErrors.join(' '));
    }

    let nextStatus = current.status;
    let shouldClearFeatured = false;
    let shouldClearPromoted = false;
    // IMPORTANT: Preserve forced_by_admin flag - never clear it automatically
    // This allows admin-forced promotions to be restored when deal is reactivated
    // The forced_by_admin flag should only be cleared explicitly by admin via updateOfferFeaturedStatus

    switch (action) {
      case 'approve':
        nextStatus = OFFER_STATUS.ACTIVE;
        shouldClearFeatured = true; // Clear pending request when activating
        // Don't clear is_promoted on approve - it might already be promoted
        break;
      case 'reject':
        nextStatus = OFFER_STATUS.REJECTED;
        shouldClearFeatured = true; // Clear pending request when rejecting
        shouldClearPromoted = true; // Clear promotion when rejecting
        // Preserve forced_by_admin for potential future reactivation
        break;
      case 'suspend':
        nextStatus = OFFER_STATUS.PAUSED;
        shouldClearFeatured = true; // Clear pending request when pausing
        shouldClearPromoted = true; // Clear promotion when pausing
        // Preserve forced_by_admin for potential future reactivation
        break;
      case 'toggle':
        if (current.status === OFFER_STATUS.ACTIVE) {
          nextStatus = OFFER_STATUS.PAUSED;
          shouldClearFeatured = true;
          shouldClearPromoted = true;
        } else if (current.status === OFFER_STATUS.EXPIRED) {
          throw new Error('Cannot re-activate an expired deal');
        } else {
          nextStatus = OFFER_STATUS.ACTIVE;
          shouldClearFeatured = true; // Clear pending when activating
          // Don't clear is_promoted - it might be restored if forced_by_admin is true
        }
        break;
      default:
        throw new Error('Invalid action provided');
    }

    const shouldSetStartDate = action === 'approve' && !current.start_date;
    const startDateValue = shouldSetStartDate ? new Date() : null;

    // Build UPDATE query with conditional clearing of featured flags
    // Preserve forced_by_admin flag - it should only be cleared explicitly by admin
    const result = await client.query(
      `
      UPDATE partner_offers 
      SET 
        status = $1,
        is_active = $2,
        start_date = CASE WHEN $3 THEN $4 ELSE start_date END,
        featured_request_pending = CASE WHEN $5 THEN false ELSE featured_request_pending END,
        is_promoted = CASE WHEN $6 THEN false ELSE is_promoted END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $7 
      RETURNING *
      `,
      [
        nextStatus,
        nextStatus === OFFER_STATUS.ACTIVE,
        shouldSetStartDate,
        startDateValue,
        shouldClearFeatured,
        shouldClearPromoted,
        dealId
      ]
    );

    await createAuditLogEntry.call(
      { client, actorRole },
      actorUserId || null,
      `deal_${action}`,
      'offer',
      dealId,
      {
        previous: {
          status: current.status,
          is_active: current.is_active,
          featured_request_pending: current.featured_request_pending,
          is_promoted: current.is_promoted,
          forced_by_admin: current.forced_by_admin
        },
        next: {
          status: result.rows[0].status,
          is_active: result.rows[0].is_active,
          featured_request_pending: result.rows[0].featured_request_pending,
          is_promoted: result.rows[0].is_promoted,
          forced_by_admin: result.rows[0].forced_by_admin
        }
      }
    );

    return result.rows[0];
  });

  if (!tx.success) {
    return {
      success: false,
      error: tx.error,
      stack: tx.stack,
      context: { dealId, action }
    };
  }

  return { success: true, data: tx.data };
}

async function updateTrendingStatus(dealId, action, actorUserId = null, actorRole = null) {
  if (!TRENDING_ACTIONS.has(action)) {
    return { success: false, error: 'Invalid trending action' };
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    // For trending operations, check featured eligibility
    const eligibility = await checkDealEligibility(dealId, client, { 
      lock: true,
      checkFeaturedEligibility: true,
      requireValidDates: false
    });

    if (!eligibility) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Deal not found' };
    }

    // For partner requests: 
    // Option 1: Allow request but log warning (current - better UX, admin decides)
    // Option 2: Block request upfront (stricter, prevents invalid requests)
    // 
    // Current implementation: Allow request, admin sees eligibility issue when approving
    // To block upfront, uncomment the block below and remove the warning-only logic
    if (action === 'partner_request') {
      // Validate deal status - must be active or pending to request trending
      if (current.status !== 'active' && current.status !== 'pending_approval') {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: `Cannot request trending for deal with status: ${current.status}. Deal must be active or pending approval.`
        };
      }
      
      // Check eligibility and log warning (but allow request)
      // This allows partners to submit requests even if not eligible
      // Admin will see the eligibility issue when reviewing the request
      if (!eligibility.eligible) {
        const ineligibleReason = eligibility.reasons.find(r => r.includes('not approved for featured'));
        if (ineligibleReason) {
          logError('⚠️ Partner requested trending but is not eligible for featured content:', {
            dealId,
            partnerId: eligibility.partner.id,
            partnerName: eligibility.partner.name,
            reasons: eligibility.reasons
          });
          // Note: Request is still allowed - admin will see this when reviewing
          // To block upfront, uncomment the following:
          // await client.query('ROLLBACK');
          // return {
          //   success: false,
          //   error: 'Partner is not approved for featured/trending content. Please contact admin to enable featured content for your partner account.',
          //   context: { dealId, action, partnerId: eligibility.partner.id }
          // };
        }
      }
    } else if (!eligibility.eligible) {
      // Admin actions require full eligibility (unless forced)
      await client.query('ROLLBACK');
      return {
        success: false,
        error: `Deal not eligible: ${eligibility.reasons.join('; ')}`,
        context: { dealId, action }
      };
    }

    const current = eligibility.deal;
    let nextIsPromoted = current.is_promoted;
    let nextFeaturedPending = current.featured_request_pending;

    switch (action) {
      case 'partner_request':
        // Deal status validation already done above (lines 858-863), no need to duplicate
        nextIsPromoted = false;
        nextFeaturedPending = true;
        break;
      case 'admin_approve':
        nextIsPromoted = true;
        nextFeaturedPending = false;
        break;
      case 'admin_reject':
        nextIsPromoted = false;
        nextFeaturedPending = false;
        break;
      default:
        await client.query('ROLLBACK');
        return { success: false, error: 'Unsupported trending action' };
    }

    const updateResult = await client.query(
      `UPDATE partner_offers
       SET is_promoted = $1,
           featured_request_pending = $2,
           updated_at = NOW()
       WHERE id = $3
       RETURNING id, is_promoted, featured_request_pending`,
      [nextIsPromoted, nextFeaturedPending, dealId]
    );

    const trendingActionLabels = {
      partner_request: 'requested trending for',
      admin_approve: 'approved trending for',
      admin_reject: 'rejected trending for'
    };

    await createAuditLogEntry.call(
      { client, actorRole },
      actorUserId || null,
      trendingActionLabels[action] || action,
      'offer',
      dealId,
      {
        previous: {
          is_promoted: current.is_promoted,
          featured_request_pending: current.featured_request_pending
        },
        next: {
          is_promoted: updateResult.rows[0].is_promoted,
          featured_request_pending: updateResult.rows[0].featured_request_pending
        }
      }
    );

    await client.query('COMMIT');

    return {
      success: true,
      data: {
        dealId: updateResult.rows[0].id,
        is_promoted: updateResult.rows[0].is_promoted,
        featured_request_pending: updateResult.rows[0].featured_request_pending
      }
    };
  } catch (error) {
    await client.query('ROLLBACK');
    logError('updateTrendingStatus error:', error);
    return { success: false, error: 'Failed to update trending status' };
  } finally {
    client.release();
  }
}

// Get admin activity/audit logs
async function getAdminActivity() {
  const result = await pool.query(
    `
    SELECT
      actor_name,
      action,
      entity_type,
      entity_name,
      meta,
      description,
      created_at
    FROM audit_log
    ORDER BY created_at DESC
    LIMIT 50
    `
  );

  return result.rows.map((row) => {
    let meta = row.meta;
    if (typeof meta === 'string') {
      try {
        meta = JSON.parse(meta);
      } catch {
        meta = {};
      }
    }
    meta = meta || {};

    return {
      actor_name: row.actor_name || 'System',
      action: row.action,
      entity_type: row.entity_type,
      entity_name: row.entity_name || 'Unknown entity',
      description: row.description || '',
      created_at: row.created_at,
      previous: meta.previous || null,
      next: meta.next || null
    };
  });
}

// Get admin users
async function listAdminUsers() {
  const result = await pool.query(`
    SELECT 
      u.id,
      u.first_name,
      u.last_name,
      u.email,
      u.phone_number,
      u.created_at,
      u.last_login,
      r.role_name,
      COALESCE(booking_stats.total_bookings, 0)::int AS total_bookings,
      COALESCE(booking_stats.total_spent, 0)::numeric AS total_spent
    FROM users u
    LEFT JOIN roles r ON u.role_id = r.id
    LEFT JOIN (
      SELECT 
        user_id,
        COUNT(*)::int AS total_bookings,
        COALESCE(SUM(fiat_amount), 0)::numeric AS total_spent
      FROM bookings
      GROUP BY user_id
    ) AS booking_stats ON booking_stats.user_id = u.id
    ORDER BY u.created_at DESC
    LIMIT 100
  `);

  return result.rows.map((row) => ({
    id: row.id,
    name: `${row.first_name || ''} ${row.last_name || ''}`.trim() || row.email,
    email: row.email,
    phone_number: row.phone_number,
    role: row.role_name || 'user',
    created_at: row.created_at,
    last_login: row.last_login,
    total_bookings: row.total_bookings,
    total_spent: parseFloat(row.total_spent || 0)
  }));
}

// Get admin analytics
async function getAdminAnalytics(period = 'month') {
  const now = new Date();
  let startDate = new Date();
  
  switch (period) {
    case 'day':
      startDate.setDate(now.getDate() - 1);
      break;
    case 'week':
      startDate.setDate(now.getDate() - 7);
      break;
    case 'month':
      startDate.setMonth(now.getMonth() - 1);
      break;
    case 'year':
      startDate.setFullYear(now.getFullYear() - 1);
      break;
  }

  const [
    totalUsersResult,
    newUsersTodayResult,
    totalPartnersResult,
    pendingPartnersResult,
    dealsResult,
    globalResult
  ] = await Promise.all([
    pool.query(`SELECT COUNT(*) as count FROM users`),
    pool.query(
      `SELECT COUNT(*) as count FROM users WHERE created_at >= to_timestamp($1 / 1000.0)`,
      [Date.now()]
    ),
    pool.query(`SELECT COUNT(*) as count FROM partners`),
    pool.query(`SELECT COUNT(*) as count FROM partners WHERE status <> 'active' OR status IS NULL`),
    pool.query(`
      SELECT
        COUNT(*) as total_deals,
        COUNT(*) FILTER (WHERE status = 'active' AND (end_date IS NULL OR end_date > NOW())) as active_deals,
        COUNT(*) FILTER (WHERE is_promoted = true) as featured_deals
      FROM partner_offers
    `),
    pool.query(`
      SELECT 
        COUNT(DISTINCT b.user_id) as total_users,
        COUNT(DISTINCT b.id) as total_bookings,
        SUM(b.amount) as total_revenue
      FROM bookings b
      WHERE b.created_at >= to_timestamp($1 / 1000.0)
    `, [startDate.getTime()])
  ]);

  let activeSessions = 0;
  try {
    const sessionsResult = await pool.query(`SELECT COUNT(*) as count FROM user_sessions WHERE expires_at > NOW()`);
    activeSessions = parseInt(sessionsResult.rows[0].count || 0);
  } catch (sessionsError) {
    // user_sessions table might not exist
  }

  return {
    users: {
      total: parseInt(totalUsersResult.rows[0]?.count || 0),
      new_today: parseInt(newUsersTodayResult.rows[0]?.count || 0),
      active_sessions: activeSessions
    },
    partners: {
      total: parseInt(totalPartnersResult.rows[0]?.count || 0),
      pending: parseInt(pendingPartnersResult.rows[0]?.count || 0)
    },
    deals: {
      total: parseInt(dealsResult.rows[0]?.total_deals || 0),
      active: parseInt(dealsResult.rows[0]?.active_deals || 0),
      featured: parseInt(dealsResult.rows[0]?.featured_deals || 0)
    },
    bookings: {
      total_users: parseInt(globalResult.rows[0]?.total_users || 0),
      total_bookings: parseInt(globalResult.rows[0]?.total_bookings || 0),
      total_revenue: parseFloat(globalResult.rows[0]?.total_revenue || 0)
    },
    period
  };
}

// Get system settings
async function getSystemSettings() {
  const result = await pool.query('SELECT setting_key, setting_value FROM system_settings');
  return result.rows.reduce((acc, row) => {
    acc[row.setting_key] = row.setting_value;
    return acc;
  }, {});
}

// Update system settings
async function updateSystemSettings(settings, userId) {
  const updates = Object.entries(settings)
    .filter(([key, value]) => value !== undefined && value !== null)
    .map(([key, value]) => ({ key, value: String(value) }));

  for (const setting of updates) {
    await pool.query(
      `INSERT INTO system_settings (setting_key, setting_value, updated_by, updated_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (setting_key)
       DO UPDATE SET setting_value = $2, updated_by = $3, updated_at = CURRENT_TIMESTAMP`,
      [setting.key, setting.value, userId]
    );
  }
}

// Update single system setting
async function updateSystemSetting(key, value, userId) {
  await pool.query(
    `INSERT INTO system_settings (setting_key, setting_value, updated_by, updated_at)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
     ON CONFLICT (setting_key)
     DO UPDATE SET setting_value = $2, updated_by = $3, updated_at = CURRENT_TIMESTAMP`,
    [key, String(value), userId]
  );
}

// Update offer featured status
async function updateOfferFeaturedStatus(offerId, is_promoted, forced_by_admin, actorUserId = null, actorRole = null) {
  const tx = await withTransaction(async (client) => {
    const offerResult = await client.query(
      `SELECT po.is_promoted, po.featured_request_pending, po.forced_by_admin, po.partner_id,
              po.status, po.end_date,
              p.approved_for_featured, p.name as partner_name
       FROM partner_offers po
       JOIN partners p ON po.partner_id = p.id
       WHERE po.id = $1
       FOR UPDATE`,
      [offerId]
    );
    
    if (offerResult.rowCount === 0) {
      throw new Error('Offer not found');
    }

    const offer = offerResult.rows[0];
    const setPromoted = !!is_promoted;
    const partnerEligible = !!offer.approved_for_featured;
    const now = new Date();

    if (setPromoted) {
      if (offer.status !== OFFER_STATUS.ACTIVE || (offer.end_date && new Date(offer.end_date) < now)) {
        throw new Error('Cannot promote an inactive or expired deal');
      }
      if (!partnerEligible && !forced_by_admin) {
        throw new Error('Partner is not eligible for promotion');
      }
    }

    const updateResult = await client.query(
      `UPDATE partner_offers
       SET is_promoted = $1,
           featured_request_pending = false,
           forced_by_admin = $2,
           updated_at = NOW()
       WHERE id = $3
       RETURNING id, is_promoted, featured_request_pending, forced_by_admin`,
      [setPromoted, setPromoted ? !!forced_by_admin : false, offerId]
    );

    await createAuditLogEntry.call(
      { client, actorRole },
      actorUserId || null,
      setPromoted ? 'promoted deal' : 'demoted deal',
      'offer',
      offerId,
      {
        previous: {
          is_promoted: offer.is_promoted,
          featured_request_pending: offer.featured_request_pending,
          forced_by_admin: offer.forced_by_admin
        },
        next: {
          is_promoted: updateResult.rows[0].is_promoted,
          featured_request_pending: updateResult.rows[0].featured_request_pending,
          forced_by_admin: updateResult.rows[0].forced_by_admin
        }
      }
    );

    return {
      previous: {
        is_promoted: offer.is_promoted,
        featured_request_pending: offer.featured_request_pending,
        forced_by_admin: offer.forced_by_admin
      },
      next: {
        is_promoted: updateResult.rows[0].is_promoted,
        featured_request_pending: updateResult.rows[0].featured_request_pending,
        forced_by_admin: updateResult.rows[0].forced_by_admin
      },
      partner_eligible: partnerEligible,
      blocked: false
    };
  });

  if (!tx.success) {
    return {
      success: false,
      error: tx.error,
      stack: tx.stack,
      context: { offerId, is_promoted }
    };
  }

  return { success: true, data: tx.data };
}

async function bulkApproveDeals(ids = [], actorUserId = null, actorRole = null) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return { succeeded: [], failed: [] };
  }

  const uniqueIds = Array.from(new Set(ids));

  const tx = await withTransaction(async (client) => {
    const succeeded = [];
    const failed = [];

    for (const id of uniqueIds) {
      // For regular bulk approval, don't check featured eligibility
      const eligibility = await checkDealEligibility(id, client, { 
        lock: true,
        checkFeaturedEligibility: false,
        requireValidDates: false
      });
      if (!eligibility) {
        failed.push({ id, reason: 'Deal not found' });
        continue;
      }

      if (!eligibility.eligible) {
        failed.push({ id, reason: `Deal not eligible: ${eligibility.reasons.join('; ')}` });
        continue;
      }

      await client.query(
        `UPDATE partner_offers
         SET status = 'active',
             is_active = true,
             featured_request_pending = false,
             start_date = COALESCE(start_date, NOW()),
             updated_at = NOW()
         WHERE id = $1`,
        [id]
      );

      succeeded.push(id);
    }

    await createAuditLogEntry.call(
      { client, actorRole },
      actorUserId || null,
      'bulk_approve_deals',
      'offer',
      null,
      {
        succeeded,
        failed
      }
    );

    return { succeeded, failed };
  });

  if (!tx.success) {
    return {
      succeeded: [],
      failed: uniqueIds.map((id) => ({ id, reason: tx.error || 'Transaction failed' }))
    };
  }

  return tx.data;
}

async function bulkRejectDeals(ids = [], actorUserId = null, actorRole = null) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return { succeeded: [], failed: [] };
  }

  const uniqueIds = Array.from(new Set(ids));

  const tx = await withTransaction(async (client) => {
    const succeeded = [];
    const failed = [];

    for (const id of uniqueIds) {
      // For regular bulk rejection, don't check featured eligibility
      const eligibility = await checkDealEligibility(id, client, { 
        lock: true,
        checkFeaturedEligibility: false,
        requireValidDates: false
      });

      if (!eligibility) {
        failed.push({ id, reason: 'Deal not found' });
        continue;
      }

      if (!eligibility.eligible) {
        failed.push({ id, reason: `Deal not eligible: ${eligibility.reasons.join('; ')}` });
        continue;
      }

      await client.query(
        `UPDATE partner_offers
         SET status = 'rejected',
             is_active = false,
             featured_request_pending = false,
             updated_at = NOW()
         WHERE id = $1`,
        [id]
      );

      succeeded.push(id);
    }

    await createAuditLogEntry.call(
      { client, actorRole },
      actorUserId || null,
      'bulk_reject_deals',
      'offer',
      null,
      {
        succeeded,
        failed
      }
    );

    return { succeeded, failed };
  });

  if (!tx.success) {
    return {
      succeeded: [],
      failed: uniqueIds.map((id) => ({ id, reason: tx.error || 'Transaction failed' }))
    };
  }

  return tx.data;
}

async function bulkApprovePartners(ids = [], actorUserId = null, actorRole = null) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return { succeeded: [], failed: [] };
  }

  const uniqueIds = Array.from(new Set(ids));

  const tx = await withTransaction(async (client) => {
    const succeeded = [];
    const failed = [];

    for (const id of uniqueIds) {
      const current = await client.query(
        `SELECT id, is_active, deleted_at FROM partners WHERE id = $1 FOR UPDATE`,
        [id]
      );

      if (current.rowCount === 0) {
        failed.push({ id, reason: 'Partner not found' });
        continue;
      }

      const partner = current.rows[0];

      if (partner.deleted_at) {
        failed.push({ id, reason: 'Partner has been deleted' });
        continue;
      }

      if (partner.is_active) {
        failed.push({ id, reason: 'Partner is already active' });
        continue;
      }

      await client.query(
        `UPDATE partners
         SET is_active = true,
             updated_at = NOW()
         WHERE id = $1`,
        [id]
      );

      succeeded.push(id);
    }

    await createAuditLogEntry.call(
      { client, actorRole },
      actorUserId || null,
      'bulk_approve_partners',
      'partner',
      null,
      {
        succeeded,
        failed
      }
    );

    return { succeeded, failed };
  });

  if (!tx.success) {
    return {
      succeeded: [],
      failed: uniqueIds.map((id) => ({ id, reason: tx.error || 'Transaction failed' }))
    };
  }

  return tx.data;
}

// Get admin sessions
async function getAdminSessions() {
  try {
    const result = await pool.query(`
      SELECT 
        us.id,
        us.user_id,
        us.token,
        us.expires_at,
        us.created_at,
        u.email,
        u.first_name,
        u.last_name
      FROM user_sessions us
      JOIN users u ON us.user_id = u.id
      ORDER BY us.created_at DESC
      LIMIT 100
    `);
    return result.rows;
  } catch (err) {
    if (err.code === '42P01') {
      return []; // user_sessions table doesn't exist
    }
    throw err;
  }
}

// Get admin archives
async function getAdminArchives() {
  try {
    const result = await pool.query(`
      SELECT 
        a.id,
        a.entity_type,
        a.entity_id,
        a.original_data,
        a.archived_at,
        a.archived_by
      FROM archives a
      ORDER BY a.archived_at DESC
      LIMIT 100
    `);
    return result.rows.map(row => ({
      ...row,
      original_data: typeof row.original_data === 'string' ? JSON.parse(row.original_data) : row.original_data
    }));
  } catch (err) {
    if (err.code === '42P01') {
      return []; // archives table doesn't exist
    }
    throw err;
  }
}

// Reactivate archived item
async function reactivateArchive(archiveId) {
  try {
    const archiveResult = await pool.query(
      'SELECT * FROM archives WHERE id = $1',
      [archiveId]
    );

    if (archiveResult.rowCount === 0) {
      return null;
    }

    const archive = archiveResult.rows[0];
    const originalData = typeof archive.original_data === 'string' 
      ? JSON.parse(archive.original_data) 
      : archive.original_data;

    // Reactivate based on entity type
    if (archive.entity_type === 'offer') {
      await pool.query(
        `UPDATE partner_offers 
         SET status = 'active', is_active = true, updated_at = CURRENT_TIMESTAMP 
         WHERE id = $1`,
        [archive.entity_id]
      );
    } else if (archive.entity_type === 'event') {
      await pool.query(
        `UPDATE events SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [archive.entity_id]
      );
    }

    // Delete from archives
    await pool.query('DELETE FROM archives WHERE id = $1', [archiveId]);

    return { success: true, entity_type: archive.entity_type, entity_id: archive.entity_id };
  } catch (err) {
    if (err.code === '42P01') {
      throw new Error('Archives table does not exist');
    }
    throw err;
  }
}

// Archive expired items (manual trigger)
async function archiveExpiredItems() {
  try {
    // Archive expired offers
    const expiredOffers = await pool.query(`
      SELECT * FROM partner_offers 
      WHERE status = 'active' 
      AND end_date IS NOT NULL 
      AND end_date < NOW()
      LIMIT 100
    `);

    let archivedCount = 0;
    for (const offer of expiredOffers.rows) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // Insert into archives
        await client.query(
          `INSERT INTO archives (entity_type, entity_id, original_data, archived_at)
           VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
           ON CONFLICT DO NOTHING`,
          ['offer', offer.id, JSON.stringify(offer)]
        );
        // Mark as inactive
        await client.query(
          `UPDATE partner_offers SET status = 'expired', is_active = false WHERE id = $1`,
          [offer.id]
        );
        await client.query('COMMIT');
        archivedCount++;
      } catch (err) {
        await client.query('ROLLBACK');
        // Log error but continue with next item
        logError(`Failed to archive offer ${offer.id}:`, err);
      } finally {
        client.release();
      }
    }

    return { archived: archivedCount };
  } catch (err) {
    if (err.code === '42P01') {
      return { archived: 0, message: 'Archives table does not exist' };
    }
    throw err;
  }
}

module.exports = {
  getDashboardStats,
  listAdminPartners,
  updatePartnerStatus,
  updatePartnerFeaturedEligibility,
  listAdminDeals,
  updateDealStatus,
  updateTrendingStatus,
  checkDealEligibility,
  getPartnerMeta,
  getAdminActivity,
  listAdminUsers,
  getAdminAnalytics,
  getSystemSettings,
  updateSystemSettings,
  updateSystemSetting,
  updateOfferFeaturedStatus,
  bulkApproveDeals,
  bulkRejectDeals,
  bulkApprovePartners,
  getAdminSessions,
  getAdminArchives,
  reactivateArchive,
  archiveExpiredItems
};

