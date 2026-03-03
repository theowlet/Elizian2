const { getPool } = require("../config/db");
const { logError } = require("../../utils/logger");
const { createAuditLogEntry } = require("../../utils/audit");

const pool = getPool();

async function tableExists(tableName) {
  const r = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
    [tableName]
  );
  return r.rowCount > 0;
}

async function columnExists(tableName, columnName) {
  const r = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [tableName, columnName]
  );
  return r.rowCount > 0;
}

const OFFER_STATUS = {
  DRAFT: "draft",
  PENDING: "pending_approval",
  ACTIVE: "active",
  PAUSED: "paused",
  REJECTED: "rejected",
  EXPIRED: "expired",
};

const TRENDING_ACTIONS = new Set([
  "partner_request",
  "admin_approve",
  "admin_reject",
]);

function getDealScheduleStatus(startUTC, endUTC) {
  const now = new Date();

  if (!startUTC || !endUTC) return "invalid";

  const start = new Date(startUTC);
  const end = new Date(endUTC);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()))
    return "invalid";
  if (end < now) return "expired";
  if (start > now) return "upcoming";
  return "live";
}

async function checkDealEligibility(dealId, executor = pool, options = {}) {
  const {
    lock = false,
    checkFeaturedEligibility = false,
    requireValidDates = false,
  } = options;
  const usePartnerTiersTable = await tableExists("partner_tiers");
  const hasPartnerTierCol = usePartnerTiersTable ? false : await columnExists("partners", "partner_tier");
  const tierSelect = usePartnerTiersTable
    ? "COALESCE(LOWER(TRIM(pt.name)), 'bronze') AS partner_tier"
    : hasPartnerTierCol
      ? "COALESCE(LOWER(TRIM(p.partner_tier)), 'bronze') AS partner_tier"
      : "'bronze' AS partner_tier";
  const tierJoin = usePartnerTiersTable
    ? "LEFT JOIN partner_tiers pt ON pt.id = p.tier_id"
    : "";
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
        o.is_trending,
        o.forced_by_admin,
        p.status AS partner_status,
        p.id AS partner_id,
        p.name AS partner_name,
        p.is_active,
        p.approved_for_featured,
        ${tierSelect}
     FROM partner_offers o
     JOIN partners p ON p.id = o.partner_id
     ${tierJoin}
     WHERE o.id = $1
     ${lock ? "FOR UPDATE OF o" : ""}`,
    [dealId]
  );

  if (result.rowCount === 0) {
    return null;
  }

  const row = result.rows[0];
  const reasons = [];
  const warnings = [];
  let eligible = true;

  const allowedPartnerStatuses = new Set(["active", "approved"]);
  if (row.partner_status && !allowedPartnerStatuses.has(row.partner_status)) {
    reasons.push(`Partner status is ${row.partner_status}`);
  } else if (!row.is_active) {
    reasons.push("Partner is inactive");
  }

  // Tier-based trending eligibility (Gold/Silver/Bronze)
  // Gold: all deals auto-trending — always eligible
  // Silver: can request per-deal — eligible to request
  // Bronze: cannot request; admin can override only
  if (checkFeaturedEligibility) {
    const tier = (row.partner_tier || "bronze").toLowerCase();
    if (tier === "gold") {
      // Gold: no restrictions
    } else if (tier === "silver") {
      // Silver: can request; no block on eligibility (admin approves)
    } else {
      // Bronze: cannot request trending
      const isTrendingDeal = row.is_trending || row.featured_request_pending;
      if (!row.forced_by_admin) {
        reasons.push(
          "Bronze partners cannot request Trending. Admin can override to mark a deal as Trending."
        );
      }
    }
  }

  if (row.status === OFFER_STATUS.EXPIRED) {
    reasons.push("Deal has already expired");
  }

  // Only enforce date requirements when activating deals
  if (requireValidDates) {
    if (!row.start_date || !row.end_date) {
      reasons.push("Deal must have start and end dates before activation");
    } else if (new Date(row.end_date) < new Date()) {
      reasons.push("Deal end date is in the past");
    } else if (new Date(row.start_date) >= new Date(row.end_date)) {
      reasons.push("Start date must be before end date");
    }
  }

  if (row.is_trending) {
    warnings.push("Deal is already promoted");
  }
  if (row.status === OFFER_STATUS.PAUSED) {
    warnings.push("Deal is currently paused");
  }

  eligible = reasons.length === 0;

  return {
    eligible,
    reasons,
    warnings,
    partner: {
      id: row.partner_id,
      name: row.partner_name,
      status: row.partner_status || (row.is_active ? "active" : "pending"),
      is_active: row.is_active,
      approved_for_featured: row.approved_for_featured,
      partner_tier: (row.partner_tier || "bronze").toLowerCase(),
    },
    deal: {
      id: row.id,
      title: row.title,
      status: row.status,
      start_date: row.start_date,
      end_date: row.end_date,
      is_trending: row.is_trending || false,
      original_price: row.original_price,
      discounted_price: row.discounted_price,
      featured_request_pending: row.featured_request_pending,
      is_active: row.deal_is_active,
      forced_by_admin: row.forced_by_admin,
    },
  };
}

async function getPartnerMeta(partnerId, executor = pool, options = {}) {
  const { lock = false } = options;
  const result = await executor.query(
    `SELECT id, is_active, deleted_at
     FROM partners
     WHERE id = $1
     ${lock ? "FOR UPDATE" : ""}`,
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
    dealsResult,
    bookingsCountResult,
    todayBookingsResult,
    redemptionsResult,
  ] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS count FROM users`),

    pool.query(
      `SELECT COUNT(*)::int AS count 
     FROM users 
     WHERE created_at >= to_timestamp($1 / 1000.0)`,
      [todayStartMs]
    ),

    pool.query(`SELECT COUNT(*)::int AS count FROM partners`),

    pool.query(`
    SELECT COUNT(*)::int AS count
    FROM partners
    WHERE
      (status IS NULL AND is_active = false)
      OR status = 'pending'
  `),

    pool.query(`
    SELECT
      COUNT(*)::int AS total_deals,
      COUNT(*) FILTER (
        WHERE status = 'active'
        AND (end_date IS NULL OR end_date >= NOW())
      )::int AS active_deals,
      COUNT(*) FILTER (WHERE is_trending = true)::int AS trending_deals
    FROM partner_offers
  `),

    pool.query(`SELECT COUNT(*)::int AS count FROM bookings`),
    pool.query(
      `SELECT COUNT(*)::int AS count FROM bookings WHERE created_at >= to_timestamp($1 / 1000.0)`,
      [todayStartMs]
    ),
    (async () => {
      try {
        const r = await pool.query(`SELECT COUNT(*)::int AS count FROM redemption_audit`);
        return r;
      } catch (e) {
        if (e.code === "42P01") return { rows: [{ count: 0 }] };
        throw e;
      }
    })(),
  ]);
  let activeSessions = 0;
  try {
    const sessionsResult = await pool.query(
      `SELECT COUNT(*)::int AS count FROM user_sessions WHERE expires_at > NOW()`
    );
    activeSessions = sessionsResult.rows[0]?.count || 0;
  } catch (sessionError) {
    if (sessionError.code !== "42P01") {
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
      amount: parseFloat(row.amount || 0),
    }));
    totalRevenue = revenueChart.reduce((sum, point) => sum + point.amount, 0);
  } catch (revenueError) {
    if (revenueError.code !== "42P01") {
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
      if (typeof meta === "string") {
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
        meta: meta || {},
      };
    });
  } catch (activityError) {
    if (activityError.code !== "42P01") {
      throw activityError;
    }
  }

  const partnersTotal = totalPartnersResult.rows[0]?.count || 0;
  const partnersPending = pendingPartnersResult.rows[0]?.count || 0;
  const usersTotal = totalUsersResult.rows[0]?.count || 0;
  const usersNewToday = newUsersTodayResult.rows[0]?.count || 0;
  const dealsTotal = dealsResult.rows[0]?.total_deals || 0;
  const dealsActive = dealsResult.rows[0]?.active_deals || 0;
  const totalBookings = bookingsCountResult.rows[0]?.count || 0;
  const todayBookings = todayBookingsResult.rows[0]?.count || 0;
  const totalRedemptions = redemptionsResult.rows[0]?.count || 0;

  return {
    users: {
      total: usersTotal,
      new_today: usersNewToday,
      active_sessions: activeSessions,
    },
    partners: {
      total: partnersTotal,
      pending: partnersPending,
    },
    deals: {
      total: dealsTotal,
      active: dealsActive,
      promoted: dealsResult.rows[0]?.trending_deals || 0,
    },
    revenue: {
      total: totalRevenue,
      chart: revenueChart,
    },
    recent_activity: recentActivity,
    // Flat keys for admin UI (dashboard expects totalPartners, total_users, etc.)
    total_partners: partnersTotal,
    totalPartners: partnersTotal,
    pending_partners: partnersPending,
    pendingPartners: partnersPending,
    total_users: usersTotal,
    totalUsers: usersTotal,
    new_today: usersNewToday,
    total_revenue: totalRevenue,
    totalRevenue: totalRevenue,
    active_deals: dealsActive,
    activeDeals: dealsActive,
    total_deals: dealsTotal,
    totalDeals: dealsTotal,
    total_bookings: totalBookings,
    totalBookings: totalBookings,
    today_bookings: todayBookings,
    todayBookings: todayBookings,
    total_redemptions: totalRedemptions,
    totalRedemptions: totalRedemptions,
  };
}

// List admin partners
async function listAdminPartners({ status = "all" } = {}) {
  const normalizedStatus = status ? status.toLowerCase() : "all";
  const params = [];
  const conditions = [];

  switch (normalizedStatus) {
    case "approved":
    case "active":
      conditions.push(
        "(p.is_active = true OR p.status IN ('active','approved'))"
      );
      break;

    case "pending":
      // Show all not-yet-approved: pending, pending_approval, or inactive (not suspended/rejected)
      conditions.push(
        "(p.status IS NULL OR p.status IN ('pending', 'pending_approval') OR (p.is_active = false AND (p.status IS NULL OR p.status NOT IN ('suspended', 'rejected'))))"
      );
      break;

    case "suspended":
    case "rejected":
      params.push(normalizedStatus);
      conditions.push(`p.status = $${params.length}`);
      break;

    default:
      if (normalizedStatus !== "all") {
        params.push(normalizedStatus);
        conditions.push(`p.status = $${params.length}`);
      }
      break;
  }

  const whereClause = conditions.length
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  const usePartnerTiersTable = await tableExists("partner_tiers");
  const hasPartnerTierCol = usePartnerTiersTable ? false : await columnExists("partners", "partner_tier");
  const tierSelect = usePartnerTiersTable
    ? "COALESCE(pt.name, 'Bronze') AS partner_tier,\n      p.tier_id,"
    : hasPartnerTierCol
      ? "COALESCE(p.partner_tier, 'Bronze') AS partner_tier,"
      : "'Bronze' AS partner_tier,";
  const tierJoin = usePartnerTiersTable
    ? "LEFT JOIN partner_tiers pt ON pt.id = p.tier_id\n    "
    : "";

  const result = await pool.query(
    `
    SELECT
      p.id,
      p.name,
      p.email,
      p.phone_number,
      p.address,
      p.latitude,
      p.longitude,
      p.is_active,
      p.status,
      p.partner_category_type,
      p.approved_for_featured,
      ${tierSelect}
      p.created_at,
      COALESCE(offer_stats.active_deals, 0)::int AS active_deals,
      COALESCE(offer_stats.trending_deals, 0)::int AS trending_deals,
      COALESCE(booking_stats.total_bookings, 0)::int AS total_bookings,
      COALESCE(booking_stats.revenue, 0)::numeric AS revenue
    FROM partners p
    ${tierJoin}
    LEFT JOIN (
      SELECT 
        partner_id,
        COUNT(*) FILTER (WHERE status = 'active')::int AS active_deals,
        COUNT(*) FILTER (WHERE is_trending = true)::int AS trending_deals
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
    const normalizedStatus = (row.status || "").toLowerCase();
    let computedStatus = normalizedStatus;

    if (!computedStatus) {
      computedStatus = row.is_active ? "approved" : "pending";
    } else if (computedStatus === "active" || computedStatus === "approved") {
      computedStatus = "approved";
    } else if (
      computedStatus === "pending_approval" ||
      computedStatus === "pending"
    ) {
      computedStatus = "pending";
    }

    return {
      id: row.id,
      name: row.name,
      email: row.email,
      phone_number: row.phone_number,
      address: row.address,
      formatted_address: row.formatted_address ?? null,
      latitude: row.latitude,
      longitude: row.longitude,
      geo_verified: row.geo_verified ?? false,
      status: computedStatus,
      partner_category_type: row.partner_category_type || null,
      approved_for_featured: row.approved_for_featured,
      partner_tier: (row.partner_tier || 'bronze').toLowerCase(),
      tier_id: row.tier_id || null,
      active_deals: row.active_deals,
      trending_deals: row.trending_deals || 0,
      promoted_deals: row.trending_deals || 0, // Backward compatibility alias
      total_bookings: row.total_bookings,
      revenue: parseFloat(row.revenue || 0),
    };
  });
}

// Update partner status
async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return { success: true, data: result };
  } catch (err) {
    await client.query("ROLLBACK");
    return {
      success: false,
      error: err.message || "Transaction failed",
      stack: err.stack || null,
    };
  } finally {
    client.release();
  }
}

async function updatePartnerStatus(
  partnerId,
  action,
  actorUserId = null,
  actorRole = null
) {
  const tx = await withTransaction(async (client) => {
    const currentResult = await client.query(
      `SELECT id, name, is_active, status, deleted_at FROM partners WHERE id = $1 FOR UPDATE`,
      [partnerId]
    );

    if (currentResult.rowCount === 0) {
      throw new Error("Partner not found");
    }

    const current = currentResult.rows[0];
    if (current.deleted_at) {
      throw new Error("Cannot update a deleted partner");
    }

    let nextActiveState = current.is_active;
    // Default to 'pending' if status is null (for backward compatibility)
    let nextStatus = current.status || "pending";
    let actionLabel = action;

    switch (action) {
      case "approve":
        if (current.is_active) {
          throw new Error("Partner is already active");
        }
        nextActiveState = true;
        nextStatus = "active";
        actionLabel = "approved";
        break;
      case "reject":
        // Allow rejecting partners in any state
        nextActiveState = false;
        nextStatus = "rejected";
        actionLabel = "rejected";
        break;
      case "suspend":
        // Only allow suspending active partners
        if (!current.is_active) {
          throw new Error("Cannot suspend an inactive partner");
        }
        nextActiveState = false;
        nextStatus = "suspended";
        actionLabel = "suspended";
        break;
      case "toggle":
        // Toggle only works between active and suspended
        if (current.status === "active") {
          nextActiveState = false;
          nextStatus = "suspended";
          actionLabel = "suspended";
        } else if (current.status === "suspended") {
          nextActiveState = true;
          nextStatus = "active";
          actionLabel = "approved";
        } else {
          throw new Error(
            "Can only toggle between active and suspended partners"
          );
        }
        break;
      default:
        throw new Error("Invalid action provided");
    }

    const updateResult = await client.query(
      `UPDATE partners SET is_active = $1, status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *`,
      [nextActiveState, nextStatus, partnerId]
    );

    await createAuditLogEntry.call(
      { client, actorRole },
      actorUserId || null,
      `${actionLabel} partner`,
      "partner",
      partnerId,
      {
        previous: {
          is_active: current.is_active,
          status: current.status || null,
        },
        next: {
          is_active: updateResult.rows[0].is_active,
          status: updateResult.rows[0].status,
        },
      }
    );

    return updateResult.rows[0];
  });

  if (!tx.success) {
    return {
      success: false,
      error: tx.error,
      stack: tx.stack,
      context: { partnerId, action },
    };
  }

  return { success: true, data: tx.data };
}

// Update partner featured eligibility
async function updatePartnerFeaturedEligibility(
  partnerId,
  approved_for_featured
) {
  const before = await pool.query(
    "SELECT approved_for_featured FROM partners WHERE id = $1",
    [partnerId]
  );
  if (before.rowCount === 0) {
    return null;
  }

  await pool.query(
    "UPDATE partners SET approved_for_featured = $1 WHERE id = $2",
    [!!approved_for_featured, partnerId]
  );

  return {
    previous: before.rows[0],
    next: { approved_for_featured: !!approved_for_featured },
  };
}

// Update partner subscription tier by tier_id (UUID) or tier name. Dynamic tiers from partner_tiers table.
// If tier name is "Gold" (case-insensitive), all active deals become trending; on downgrade from Gold, clear trending.
async function updatePartnerTier(partnerId, tierIdOrName) {
  const hasTierId = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'partners' AND column_name = 'tier_id'`
  );
  if (hasTierId.rowCount === 0) {
    throw new Error('Partner tier_id is not available. Run migration 2026-02-dynamic-partner-tiers.sql.');
  }

  let newTierId = null;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(String(tierIdOrName || '').trim())) {
    const t = await pool.query('SELECT id, name FROM partner_tiers WHERE id = $1', [tierIdOrName]);
    if (t.rowCount === 0) throw new Error('Tier not found for given tier_id');
    newTierId = t.rows[0].id;
  } else {
    const name = String(tierIdOrName || 'bronze').trim() || 'bronze';
    const t = await pool.query('SELECT id, name FROM partner_tiers WHERE LOWER(TRIM(name)) = LOWER($1)', [name]);
    if (t.rowCount === 0) throw new Error(`Tier not found: "${name}". Create it in Admin → Partner Tiers or use a valid tier_id.`);
    newTierId = t.rows[0].id;
  }

  const before = await pool.query(
    'SELECT tier_id FROM partners WHERE id = $1',
    [partnerId]
  );
  if (before.rowCount === 0) return null;
  const prevTierId = before.rows[0]?.tier_id;

  const result = await pool.query(
    'UPDATE partners SET tier_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, tier_id',
    [newTierId, partnerId]
  );
  const row = result.rows[0];
  if (!row) return null;

  const [newTierRow, prevTierRow] = await Promise.all([
    pool.query('SELECT name FROM partner_tiers WHERE id = $1', [newTierId]).then(r => r.rows[0] || {}),
    prevTierId ? pool.query('SELECT name FROM partner_tiers WHERE id = $1', [prevTierId]).then(r => r.rows[0] || {}) : Promise.resolve({}),
  ]);
  const newTierName = (newTierRow.name || '').toLowerCase();
  const prevTierName = (prevTierRow.name || '').toLowerCase();

  if (newTierName === 'gold') {
    await pool.query(
      `UPDATE partner_offers SET is_trending = true, featured_request_pending = false, updated_at = NOW()
       WHERE partner_id = $1 AND status = 'active' AND (end_date IS NULL OR end_date >= NOW())`,
      [partnerId]
    );
  } else if (prevTierName === 'gold') {
    await pool.query(
      `UPDATE partner_offers SET is_trending = false, updated_at = NOW()
       WHERE partner_id = $1 AND forced_by_admin = false`,
      [partnerId]
    );
  }

  return { id: row.id, tier_id: row.tier_id, tier_name: newTierRow.name || null };
}

// List admin deals
async function listAdminDeals({
  search = "",
  status = "all",
  promo = "all",
} = {}) {
  const searchTerm = search.trim().toLowerCase();
  const normalizedStatus = status ? status.toLowerCase() : "all";
  const normalizedPromo = promo ? promo.toLowerCase() : "all";

  const filters = [];
  const params = [];
  let idx = 1;

  if (searchTerm) {
    filters.push(
      `(LOWER(po.title) LIKE $${idx} OR LOWER(p.name) LIKE $${idx})`
    );
    params.push(`%${searchTerm}%`);
    idx += 1;
  }

  if (normalizedStatus === "active") {
    filters.push(`po.status = 'active'`);
  } else if (normalizedStatus === "pending_approval") {
    filters.push(`po.status = 'pending_approval'`);
  } else if (normalizedStatus === "pending") {
    filters.push(`po.status IN ('draft', 'pending_approval', 'paused')`);
  } else if (normalizedStatus === "expired") {
    filters.push(`po.status = 'expired'`);
  } else if (normalizedStatus === "rejected") {
    filters.push(`po.status = 'rejected'`);
  }

  if (normalizedPromo === "promoted") {
    filters.push(`po.is_trending = true`);
  } else if (normalizedPromo === "expiring") {
    filters.push(`po.end_date BETWEEN NOW() AND (NOW() + INTERVAL '3 day')`);
  } else if (normalizedPromo === "pending_trending") {
    filters.push(`po.featured_request_pending = true`);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

  const result = await pool.query(
    `
    SELECT
      po.id,
      po.partner_id,
      po.title,
      po.description,
      po.original_price,
      po.discounted_price,
      po.co_pay_percentage,
      po.discount_amount,
      po.start_date,
      po.end_date,
      -- Compatibility: Use status column if exists, fallback to computed status
      COALESCE(
        po.status::text,
        CASE 
          WHEN po.is_active = false THEN 'paused'
          WHEN po.end_date IS NOT NULL AND po.end_date < NOW() THEN 'expired'
          WHEN po.is_active = true THEN 'active'
          ELSE 'draft'
        END
      ) AS status,
      po.is_trending,
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
    const scheduleStatus = getDealScheduleStatus(
      deal.start_date,
      deal.end_date
    );

    return {
      id: deal.id,
      partner_id: deal.partner_id,
      partner_name: deal.partner_name,
      title: deal.title,
      description: deal.description,
      original_price: parseFloat(deal.original_price || 0),
      discounted_price: parseFloat(deal.discounted_price || 0),
      co_pay_percentage: parseFloat(deal.co_pay_percentage || 0),
      discount_amount: parseFloat(deal.discount_amount || 0),
      start_date: deal.start_date,
      end_date: deal.end_date,
      status: deal.status,
      schedule_status: scheduleStatus,
      is_trending: deal.is_trending,
      featured_request_pending: deal.featured_request_pending,
      max_redemptions: deal.max_redemptions,
      current_redemptions: deal.current_redemptions,
      service_type: deal.service_type,
    };
  });
}

// Update deal status
async function updateDealStatus(
  dealId,
  action,
  actorUserId = null,
  actorRole = null
) {
  const tx = await withTransaction(async (client) => {
    // First, check if deal is promoted/trending to determine if we need featured eligibility check
    const dealCheck = await client.query(
      "SELECT is_trending, featured_request_pending FROM partner_offers WHERE id = $1",
      [dealId]
    );

    if (dealCheck.rowCount === 0) {
      throw new Error("Deal not found");
    }

    const isTrendingDeal =
      dealCheck.rows[0]?.is_trending ||
      dealCheck.rows[0]?.is_trending ||
      dealCheck.rows[0]?.featured_request_pending;

    // Check eligibility with appropriate settings
    // - Check featured eligibility if deal is promoted/trending
    // - Require valid dates when activating (approve action)
    const eligibility = await checkDealEligibility(dealId, client, {
      lock: true,
      checkFeaturedEligibility: isTrendingDeal,
      requireValidDates:
        action === "approve" ||
        (action === "toggle" &&
          dealCheck.rows[0]?.status !== OFFER_STATUS.ACTIVE),
    });

    if (!eligibility) {
      throw new Error("Deal not found");
    }

    const current = eligibility.deal;
    const partner = eligibility.partner;
    const now = new Date();
    const startDate = current.start_date ? new Date(current.start_date) : null;
    const endDate = current.end_date ? new Date(current.end_date) : null;
    const isExpired = endDate && endDate < now;

    const willActivate =
      action === "approve" ||
      (action === "toggle" && current.status !== OFFER_STATUS.ACTIVE);

    const validationErrors = [];

    if (willActivate) {
      // Check partner is active (either by is_active flag or status)
      const partnerIsActive =
        partner.is_active === true &&
        (partner.status === null ||
          partner.status === "active" ||
          partner.status === "approved");

      if (!partnerIsActive) {
        const partnerStatusMsg =
          partner.status || (partner.is_active ? "active" : "pending");
        validationErrors.push(
          `Partner must be active to enable deals. Current status: ${partnerStatusMsg}`
        );
      }

      // Require dates for deal activation
      if (!startDate || !endDate) {
        validationErrors.push(
          "Start date and end date are required to activate a deal."
        );
      } else {
        // Validate date formats
        if (Number.isNaN(startDate.getTime())) {
          validationErrors.push("Start date is invalid.");
        }
        if (Number.isNaN(endDate.getTime())) {
          validationErrors.push("End date is invalid.");
        }

        // Validate date logic
        if (endDate <= startDate) {
          validationErrors.push("End date must be after start date.");
        }

        // Don't allow activating already expired deals
        if (endDate < now) {
          validationErrors.push(
            "Cannot activate a deal with end date in the past."
          );
        }
      }

      // Price validation - original_price is optional, discounted_price is required
      const originalPrice =
        current.original_price !== null && current.original_price !== undefined
          ? parseFloat(current.original_price)
          : null;

      const discountedPrice =
        current.discounted_price !== null &&
        current.discounted_price !== undefined
          ? parseFloat(current.discounted_price)
          : null;

      // Validate original_price if provided (allow 0 for free deals)
      if (originalPrice !== null) {
        if (!Number.isFinite(originalPrice) || originalPrice < 0) {
          validationErrors.push(
            "Original price must be a non-negative number if provided."
          );
        }
      }

      // Validate discounted_price (required for active deals, allow 0 for free deals)
      if (discountedPrice === null || !Number.isFinite(discountedPrice)) {
        validationErrors.push(
          "Discounted price is required and must be a valid number."
        );
      } else if (discountedPrice < 0) {
        validationErrors.push("Discounted price cannot be negative.");
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
        validationErrors.push(
          "Discounted price must be lower than original price when original price is set."
        );
      }
    }

    if (validationErrors.length > 0) {
      throw new Error(validationErrors.join(" "));
    }

    let nextStatus = current.status;
    let shouldClearFeatured = false;
    let shouldClearPromoted = false;
    // IMPORTANT: Preserve forced_by_admin flag - never clear it automatically
    // This allows admin-forced promotions to be restored when deal is reactivated
    // The forced_by_admin flag should only be cleared explicitly by admin via updateOfferFeaturedStatus

    switch (action) {
      case "approve":
        nextStatus = OFFER_STATUS.ACTIVE;
        shouldClearFeatured = true; // Clear pending request when activating
        // Don't clear is_trending on approve - it might already be trending
        break;
      case "reject":
        nextStatus = OFFER_STATUS.REJECTED;
        shouldClearFeatured = true; // Clear pending request when rejecting
        shouldClearPromoted = true; // Clear promotion when rejecting
        // Preserve forced_by_admin for potential future reactivation
        break;
      case "suspend":
        nextStatus = OFFER_STATUS.PAUSED;
        shouldClearFeatured = true; // Clear pending request when pausing
        shouldClearPromoted = true; // Clear promotion when pausing
        // Preserve forced_by_admin for potential future reactivation
        break;
      case "toggle":
        if (current.status === OFFER_STATUS.ACTIVE) {
          nextStatus = OFFER_STATUS.PAUSED;
          shouldClearFeatured = true;
          shouldClearPromoted = true;
        } else if (current.status === OFFER_STATUS.EXPIRED) {
          throw new Error("Cannot re-activate an expired deal");
        } else {
          nextStatus = OFFER_STATUS.ACTIVE;
          shouldClearFeatured = true; // Clear pending when activating
          // Don't clear is_trending - it might be restored if forced_by_admin is true
        }
        break;
      default:
        throw new Error("Invalid action provided");
    }

    const shouldSetStartDate = action === "approve" && !current.start_date;
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
        is_trending = CASE WHEN $6 THEN false ELSE is_trending END,
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
        dealId,
      ]
    );

    await createAuditLogEntry.call(
      { client, actorRole },
      actorUserId || null,
      `deal_${action}`,
      "offer",
      dealId,
      {
        previous: {
          status: current.status,
          is_active: current.is_active,
          featured_request_pending: current.featured_request_pending,
          is_trending: current.is_trending,
          forced_by_admin: current.forced_by_admin,
        },
        next: {
          status: result.rows[0].status,
          is_active: result.rows[0].is_active,
          featured_request_pending: result.rows[0].featured_request_pending,
          is_trending: result.rows[0].is_trending,
          forced_by_admin: result.rows[0].forced_by_admin,
        },
      }
    );

    return result.rows[0];
  });

  if (!tx.success) {
    return {
      success: false,
      error: tx.error,
      stack: tx.stack,
      context: { dealId, action },
    };
  }

  return { success: true, data: tx.data };
}

async function updateTrendingStatus(
  dealId,
  action,
  actorUserId = null,
  actorRole = null,
  reason = null
) {
  if (!TRENDING_ACTIONS.has(action)) {
    return { success: false, error: "Invalid trending action" };
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    // For trending operations, check featured eligibility
    const eligibility = await checkDealEligibility(dealId, client, {
      lock: true,
      checkFeaturedEligibility: true,
      requireValidDates: false,
    });

    if (!eligibility) {
      await client.query("ROLLBACK");
      return { success: false, error: "Deal not found" };
    }

    const current = eligibility.deal;
    const partnerTier = (eligibility.partner?.partner_tier || "bronze").toLowerCase();

    if (action === "partner_request") {
      // Validate deal status - must be active or pending to request trending
      if (
        current.status !== "active" &&
        current.status !== "pending_approval"
      ) {
        await client.query("ROLLBACK");
        return {
          success: false,
          error: `Cannot request trending for deal with status: ${current.status}. Deal must be active or pending approval.`,
        };
      }

      // Tier-based: Bronze cannot request, Gold doesn't need to (all deals auto-trending), Silver can request
      if (partnerTier === "bronze") {
        await client.query("ROLLBACK");
        return {
          success: false,
          error: "Bronze partners cannot request Trending. Admin can override to mark a deal as Trending.",
          context: { dealId, partnerId: eligibility.partner?.id },
        };
      }
      if (partnerTier === "gold") {
        await client.query("ROLLBACK");
        return {
          success: false,
          error: "Gold partners: all your deals are already Trending. No need to request.",
          context: { dealId, partnerId: eligibility.partner?.id },
        };
      }
      // Silver: allow request
    } else if (!eligibility.eligible) {
      // Admin actions require eligibility (e.g. approving a Silver partner's request)
      await client.query("ROLLBACK");
      return {
        success: false,
        error: `Deal not eligible: ${eligibility.reasons.join("; ")}`,
        context: { dealId, action },
      };
    }
    let nextIsTrending = current.is_trending;
    let nextFeaturedPending = current.featured_request_pending;

    switch (action) {
      case "partner_request":
        // Deal status validation already done above (lines 858-863), no need to duplicate
        nextIsTrending = false;
        nextFeaturedPending = true;
        break;
      case "admin_approve":
        nextIsTrending = true;
        nextFeaturedPending = false;
        break;
      case "admin_reject":
        nextIsTrending = false;
        nextFeaturedPending = false;
        break;
      default:
        await client.query("ROLLBACK");
        return { success: false, error: "Unsupported trending action" };
    }

    // For admin_approve (Silver request): set trending_approval_reason. For admin_reject: clear it.
    const approvalReason =
      action === "admin_approve" ? (reason || null) : action === "admin_reject" ? null : undefined;
    const colCheck = await client.query(
      `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'partner_offers' AND column_name = 'trending_approval_reason'`
    );
    const hasReasonCol = colCheck.rowCount > 0;
    const setReasonClause =
      hasReasonCol && approvalReason !== undefined ? ", trending_approval_reason = $4" : "";
    const updateParams =
      hasReasonCol && approvalReason !== undefined
        ? [nextIsTrending, nextFeaturedPending, dealId, approvalReason]
        : [nextIsTrending, nextFeaturedPending, dealId];
    const updateResult = await client.query(
      `UPDATE partner_offers
       SET is_trending = $1, featured_request_pending = $2${setReasonClause}, updated_at = NOW()
       WHERE id = $3
       RETURNING id, is_trending, featured_request_pending`,
      updateParams
    );

    const trendingActionLabels = {
      partner_request: "requested trending for",
      admin_approve: "approved trending for",
      admin_reject: "rejected trending for",
    };

    await createAuditLogEntry.call(
      { client, actorRole },
      actorUserId || null,
      trendingActionLabels[action] || action,
      "offer",
      dealId,
      {
        previous: {
          is_trending: current.is_trending,
          featured_request_pending: current.featured_request_pending,
        },
        next: {
          is_trending: updateResult.rows[0].is_trending,
          featured_request_pending:
            updateResult.rows[0].featured_request_pending,
        },
      }
    );

    await client.query("COMMIT");

    return {
      success: true,
      data: {
        dealId: updateResult.rows[0].id,
        is_trending: updateResult.rows[0].is_trending,
        featured_request_pending: updateResult.rows[0].featured_request_pending,
      },
    };
  } catch (error) {
    await client.query("ROLLBACK");
    logError("updateTrendingStatus error:", error);
    return { success: false, error: "Failed to update trending status" };
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
    if (typeof meta === "string") {
      try {
        meta = JSON.parse(meta);
      } catch {
        meta = {};
      }
    }
    meta = meta || {};

    return {
      actor_name: row.actor_name || "System",
      action: row.action,
      entity_type: row.entity_type,
      entity_name: row.entity_name || "Unknown entity",
      description: row.description || "",
      created_at: row.created_at,
      previous: meta.previous || null,
      next: meta.next || null,
    };
  });
}

// Get admin users
async function listAdminUsers(filters = {}) {
  const {
    search = "",
    role = "all",
    status = "all",
    limit = 20,
    offset = 0,
  } = filters;

  const params = [];
  const conditions = [];
  let paramCounter = 1;

  // Search filter (name, email, phone)
  if (search && search.trim() !== "") {
    const searchPattern = `%${search.trim()}%`;
    conditions.push(`(
      CONCAT(u.first_name, ' ', u.last_name) ILIKE $${paramCounter} OR
      u.email ILIKE $${paramCounter} OR
      u.phone_number ILIKE $${paramCounter}
    )`);
    params.push(searchPattern);
    paramCounter++;
  }

  // Role filter
  if (role && role !== "all") {
    conditions.push(`r.role_name = $${paramCounter}`);
    params.push(role);
    paramCounter++;
  }

  // Status filter (is_active)
  if (status && status !== "all") {
    const isActive = status === "active";
    conditions.push(`u.is_active = $${paramCounter}`);
    params.push(isActive);
    paramCounter++;
  }

  // Optional column/table checks (before tier filter and queries)
  let hasLastLogin = false;
  let hasLoyaltyTiers = false;
  let hasCurrentTierName = false;
  try {
    const [colRes, ltRes, tnRes] = await Promise.all([
      pool.query(`SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'last_login' LIMIT 1`),
      pool.query(`SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'loyalty_tiers' LIMIT 1`),
      pool.query(`SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'current_tier_name' LIMIT 1`)
    ]);
    hasLastLogin = colRes.rowCount > 0;
    hasLoyaltyTiers = ltRes.rowCount > 0;
    hasCurrentTierName = tnRes.rowCount > 0;
  } catch (_) {}

  // Tier filter (tiers.name or loyalty_tiers.tier_name when loyalty_tiers exists)
  if (filters.tier && filters.tier !== "all") {
    if (hasLoyaltyTiers) {
      conditions.push(`(t.name = $${paramCounter} OR lt.tier_name = $${paramCounter})`);
    } else {
      conditions.push(`t.name = $${paramCounter}`);
    }
    params.push(filters.tier);
    paramCounter++;
  }

  const finalWhereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const loyaltyTiersJoin = hasLoyaltyTiers ? "LEFT JOIN loyalty_tiers lt ON u.current_tier_id = lt.id" : "";

  // Count query: join tiers (and loyalty_tiers when available) so tier filter works
  const countQuery = `
    SELECT COUNT(*)::int as total
    FROM users u
    LEFT JOIN roles r ON u.role_id = r.id
    LEFT JOIN tiers t ON u.current_tier_id = t.id
    ${loyaltyTiersJoin}
    ${finalWhereClause}
  `;
  const countParams = [...params]; // Copy params for count query
  const countResult = await pool.query(countQuery, countParams);
  const total = countResult.rows[0].total;

  // Sort order (t = base "tiers" table with "level"; loyalty_tiers has "tier_level")
  let orderBy = "u.created_at DESC";
  if (filters.sortBy) {
    switch (filters.sortBy) {
      case "tier":
        orderBy = "t.level ASC NULLS LAST, u.created_at DESC";
        break;
      case "tier_desc":
        orderBy = "t.level DESC NULLS LAST, u.created_at DESC";
        break;
      case "spend":
        orderBy = "total_spent DESC";
        break;
      case "spend_asc":
        orderBy = "total_spent ASC";
        break;
      case "name":
        orderBy = "u.first_name ASC, u.last_name ASC";
        break;
      case "created":
        orderBy = "u.created_at DESC";
        break;
      default:
        orderBy = "u.created_at DESC";
    }
  }

  // Tier display: prefer current_tier_name (manual/enterprise), then loyalty_tiers, then tiers
  const tierSelectExpr = hasCurrentTierName && hasLoyaltyTiers
    ? "COALESCE(u.current_tier_name, lt.tier_name, t.name, 'Ather')"
    : hasCurrentTierName
      ? "COALESCE(u.current_tier_name, t.name, 'Ather')"
      : hasLoyaltyTiers
        ? "COALESCE(lt.tier_name, t.name, 'Ather')"
        : "COALESCE(t.name, 'Ather')";
  const tierLevelExpr = hasLoyaltyTiers ? "COALESCE(lt.tier_level, t.level)" : "t.level";
  const tokenPctExpr = hasLoyaltyTiers ? "COALESCE(lt.ezt_reward_percentage, t.token_earning_percentage)" : "t.token_earning_percentage";

  // Get paginated results
  const lastLoginSelect = hasLastLogin ? "u.last_login," : "";
  const dataQuery = `
    SELECT 
      u.id,
      u.first_name,
      u.last_name,
      u.email,
      u.phone_number,
      u.is_active,
      u.created_at,
      ${lastLoginSelect}
      u.available_tokens,
      r.role_name,
      t.name AS tier_name_from_tiers,
      ${tierSelectExpr} AS tier_name_resolved,
      t.level AS tier_level_from_tiers,
      ${tierLevelExpr} AS tier_level_resolved,
      t.token_earning_percentage,
      ${tokenPctExpr} AS token_pct_resolved,
      COALESCE(booking_stats.total_bookings, 0)::int AS total_bookings,
      COALESCE(booking_stats.total_spent, 0)::numeric AS total_spent
    FROM users u
    LEFT JOIN roles r ON u.role_id = r.id
    LEFT JOIN tiers t ON u.current_tier_id = t.id
    ${loyaltyTiersJoin}
    LEFT JOIN (
      SELECT 
        user_id,
        COUNT(*)::int AS total_bookings,
        COALESCE(SUM(fiat_amount), 0)::numeric AS total_spent
      FROM bookings
      GROUP BY user_id
    ) AS booking_stats ON booking_stats.user_id = u.id
    ${finalWhereClause}
    ORDER BY ${orderBy}
    LIMIT $${paramCounter} OFFSET $${paramCounter + 1}
  `;
  params.push(limit, offset);

  const result = await pool.query(dataQuery, params);

    return {
    items: result.rows.map((row) => ({
      id: row.id,
      first_name: row.first_name,
      last_name: row.last_name,
      name:
        `${row.first_name || ""} ${row.last_name || ""}`.trim() || row.email,
      email: row.email,
      phone_number: row.phone_number,
      role: row.role_name || "user",
      is_active: row.is_active !== false,
      created_at: row.created_at,
      last_login: row.last_login != null ? row.last_login : null,
      tier: row.tier_name_resolved || "Ather",
      tier_name: row.tier_name_resolved || "Ather",
      tier_level: row.tier_level_resolved ?? row.tier_level_from_tiers ?? 1,
      tier_percentage: parseFloat(row.token_pct_resolved || row.token_earning_percentage || 1),
      annual_spend: parseFloat(row.total_spent || 0),
      total_bookings: row.total_bookings,
      total_spent: parseFloat(row.total_spent || 0),
      available_tokens: parseFloat(row.available_tokens || 0),
      ezt_balance: parseFloat(row.available_tokens || 0),
    })),
    total,
    limit,
    offset,
  };
}

// Get admin analytics
async function getAdminAnalytics(period = "month") {
  const now = new Date();
  let startDate = new Date();

  switch (period) {
    case "day":
      startDate.setDate(now.getDate() - 1);
      break;
    case "week":
      startDate.setDate(now.getDate() - 7);
      break;
    case "month":
      startDate.setMonth(now.getMonth() - 1);
      break;
    case "year":
      startDate.setFullYear(now.getFullYear() - 1);
      break;
  }

  const [
    totalUsersResult,
    newUsersTodayResult,
    totalPartnersResult,
    pendingPartnersResult,
    dealsResult,
    globalResult,
  ] = await Promise.all([
    pool.query(`SELECT COUNT(*) as count FROM users`),
    pool.query(
      `SELECT COUNT(*) as count FROM users WHERE created_at >= to_timestamp($1 / 1000.0)`,
      [Date.now()]
    ),
    pool.query(`SELECT COUNT(*) as count FROM partners`),
    pool.query(
      `SELECT COUNT(*) as count FROM partners WHERE status <> 'active' OR status IS NULL`
    ),
    pool.query(`
      SELECT
        COUNT(*) as total_deals,
        COUNT(*) FILTER (WHERE status = 'active' AND (end_date IS NULL OR end_date > NOW())) as active_deals,
        COUNT(*) FILTER (WHERE is_trending = true) as trending_deals
      FROM partner_offers
    `),
    pool.query(
      `
      SELECT 
        COUNT(DISTINCT b.user_id) as total_users,
        COUNT(DISTINCT b.id) as total_bookings,
        SUM(b.amount) as total_revenue
      FROM bookings b
      WHERE b.created_at >= to_timestamp($1 / 1000.0)
    `,
      [startDate.getTime()]
    ),
  ]);

  let activeSessions = 0;
  try {
    const sessionsResult = await pool.query(
      `SELECT COUNT(*) as count FROM user_sessions WHERE expires_at > NOW()`
    );
    activeSessions = parseInt(sessionsResult.rows[0].count || 0);
  } catch (sessionsError) {
    // user_sessions table might not exist
  }

  return {
    users: {
      total: parseInt(totalUsersResult.rows[0]?.count || 0),
      new_today: parseInt(newUsersTodayResult.rows[0]?.count || 0),
      active_sessions: activeSessions,
    },
    partners: {
      total: parseInt(totalPartnersResult.rows[0]?.count || 0),
      pending: parseInt(pendingPartnersResult.rows[0]?.count || 0),
    },
    deals: {
      total: parseInt(dealsResult.rows[0]?.total_deals || 0),
      active: parseInt(dealsResult.rows[0]?.active_deals || 0),
      featured: parseInt(dealsResult.rows[0]?.trending_deals || 0),
    },
    bookings: {
      total_users: parseInt(globalResult.rows[0]?.total_users || 0),
      total_bookings: parseInt(globalResult.rows[0]?.total_bookings || 0),
      total_revenue: parseFloat(globalResult.rows[0]?.total_revenue || 0),
    },
    period,
  };
}

// Get system settings
async function getSystemSettings() {
  const result = await pool.query(
    "SELECT setting_key, setting_value FROM system_settings"
  );
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
async function updateOfferFeaturedStatus(
  offerId,
  is_trending,
  forced_by_admin,
  actorUserId = null,
  actorRole = null
) {
  const tx = await withTransaction(async (client) => {
    const usePartnerTiersTable = await tableExists("partner_tiers");
    const hasPartnerTierCol = usePartnerTiersTable ? false : await columnExists("partners", "partner_tier");
    const tierSelect = usePartnerTiersTable
      ? "COALESCE(LOWER(TRIM(pt.name)), 'bronze') AS partner_tier"
      : hasPartnerTierCol
        ? "COALESCE(LOWER(TRIM(p.partner_tier)), 'bronze') AS partner_tier"
        : "'bronze' AS partner_tier";
    const tierJoin = usePartnerTiersTable ? "LEFT JOIN partner_tiers pt ON pt.id = p.tier_id" : "";
    const offerResult = await client.query(
      `SELECT po.is_trending, po.featured_request_pending, po.forced_by_admin, po.partner_id,
              po.status, po.end_date,
              p.approved_for_featured, p.name as partner_name,
              ${tierSelect}
       FROM partner_offers po
       JOIN partners p ON po.partner_id = p.id
       ${tierJoin}
       WHERE po.id = $1
       FOR UPDATE OF po`,
      [offerId]
    );

    if (offerResult.rowCount === 0) {
      throw new Error("Offer not found");
    }

    const offer = offerResult.rows[0];
    const setTrending = !!is_trending;
    const tier = (offer.partner_tier || "bronze").toLowerCase();
    // Gold/Silver: eligible. Bronze: need forced_by_admin.
    const partnerEligible = tier === "gold" || tier === "silver" || !!offer.approved_for_featured;
    const now = new Date();

    if (setTrending) {
      if (
        offer.status !== OFFER_STATUS.ACTIVE ||
        (offer.end_date && new Date(offer.end_date) < now)
      ) {
        throw new Error("Cannot promote an inactive or expired deal");
      }
      if (!partnerEligible && !forced_by_admin) {
        throw new Error("Partner is not eligible for promotion");
      }
    }

    const updateResult = await client.query(
      `UPDATE partner_offers
       SET is_trending = $1,
           featured_request_pending = false,
           forced_by_admin = $2,
           updated_at = NOW()
       WHERE id = $3
       RETURNING id, is_trending, featured_request_pending, forced_by_admin`,
      [setTrending, setTrending ? !!forced_by_admin : false, offerId]
    );

    await createAuditLogEntry.call(
      { client, actorRole },
      actorUserId || null,
      setTrending ? "marked deal as trending" : "removed deal from trending",
      "offer",
      offerId,
      {
        previous: {
          is_trending: offer.is_trending || false,
          featured_request_pending: offer.featured_request_pending,
          forced_by_admin: offer.forced_by_admin,
        },
        next: {
          is_trending: updateResult.rows[0].is_trending,
          featured_request_pending:
            updateResult.rows[0].featured_request_pending,
          forced_by_admin: updateResult.rows[0].forced_by_admin,
        },
      }
    );

    return {
      previous: {
        is_trending: offer.is_trending,
        featured_request_pending: offer.featured_request_pending,
        forced_by_admin: offer.forced_by_admin,
      },
      next: {
        is_trending: updateResult.rows[0].is_trending,
        featured_request_pending: updateResult.rows[0].featured_request_pending,
        forced_by_admin: updateResult.rows[0].forced_by_admin,
      },
      partner_eligible: partnerEligible,
      blocked: false,
    };
  });

  if (!tx.success) {
    return {
      success: false,
      error: tx.error,
      stack: tx.stack,
      context: { offerId, is_trending },
    };
  }

  return { success: true, data: tx.data };
}

async function bulkApproveDeals(
  ids = [],
  actorUserId = null,
  actorRole = null
) {
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
        requireValidDates: false,
      });
      if (!eligibility) {
        failed.push({ id, reason: "Deal not found" });
        continue;
      }

      if (!eligibility.eligible) {
        failed.push({
          id,
          reason: `Deal not eligible: ${eligibility.reasons.join("; ")}`,
        });
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
      "bulk_approve_deals",
      "offer",
      null,
      {
        succeeded,
        failed,
      }
    );

    return { succeeded, failed };
  });

  if (!tx.success) {
    return {
      succeeded: [],
      failed: uniqueIds.map((id) => ({
        id,
        reason: tx.error || "Transaction failed",
      })),
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
        requireValidDates: false,
      });

      if (!eligibility) {
        failed.push({ id, reason: "Deal not found" });
        continue;
      }

      if (!eligibility.eligible) {
        failed.push({
          id,
          reason: `Deal not eligible: ${eligibility.reasons.join("; ")}`,
        });
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
      "bulk_reject_deals",
      "offer",
      null,
      {
        succeeded,
        failed,
      }
    );

    return { succeeded, failed };
  });

  if (!tx.success) {
    return {
      succeeded: [],
      failed: uniqueIds.map((id) => ({
        id,
        reason: tx.error || "Transaction failed",
      })),
    };
  }

  return tx.data;
}

async function bulkApprovePartners(
  ids = [],
  actorUserId = null,
  actorRole = null
) {
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
        failed.push({ id, reason: "Partner not found" });
        continue;
      }

      const partner = current.rows[0];

      if (partner.deleted_at) {
        failed.push({ id, reason: "Partner has been deleted" });
        continue;
      }

      if (partner.is_active) {
        failed.push({ id, reason: "Partner is already active" });
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
      "bulk_approve_partners",
      "partner",
      null,
      {
        succeeded,
        failed,
      }
    );

    return { succeeded, failed };
  });

  if (!tx.success) {
    return {
      succeeded: [],
      failed: uniqueIds.map((id) => ({
        id,
        reason: tx.error || "Transaction failed",
      })),
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
    if (err.code === "42P01") {
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
    return result.rows.map((row) => ({
      ...row,
      original_data:
        typeof row.original_data === "string"
          ? JSON.parse(row.original_data)
          : row.original_data,
    }));
  } catch (err) {
    if (err.code === "42P01") {
      return []; // archives table doesn't exist
    }
    throw err;
  }
}

// Reactivate archived item
async function reactivateArchive(archiveId) {
  try {
    const archiveResult = await pool.query(
      "SELECT * FROM archives WHERE id = $1",
      [archiveId]
    );

    if (archiveResult.rowCount === 0) {
      return null;
    }

    const archive = archiveResult.rows[0];
    const originalData =
      typeof archive.original_data === "string"
        ? JSON.parse(archive.original_data)
        : archive.original_data;

    // Reactivate based on entity type
    if (archive.entity_type === "offer") {
      await pool.query(
        `UPDATE partner_offers 
         SET status = 'active', is_active = true, updated_at = CURRENT_TIMESTAMP 
         WHERE id = $1`,
        [archive.entity_id]
      );
    } else if (archive.entity_type === "event") {
      await pool.query(
        `UPDATE events SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [archive.entity_id]
      );
    }

    // Delete from archives
    await pool.query("DELETE FROM archives WHERE id = $1", [archiveId]);

    return {
      success: true,
      entity_type: archive.entity_type,
      entity_id: archive.entity_id,
    };
  } catch (err) {
    if (err.code === "42P01") {
      throw new Error("Archives table does not exist");
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
        await client.query("BEGIN");
        // Insert into archives
        await client.query(
          `INSERT INTO archives (entity_type, entity_id, original_data, archived_at)
           VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
           ON CONFLICT DO NOTHING`,
          ["offer", offer.id, JSON.stringify(offer)]
        );
        // Mark as inactive
        await client.query(
          `UPDATE partner_offers SET status = 'expired', is_active = false WHERE id = $1`,
          [offer.id]
        );
        await client.query("COMMIT");
        archivedCount++;
      } catch (err) {
        await client.query("ROLLBACK");
        // Log error but continue with next item
        logError(`Failed to archive offer ${offer.id}:`, err);
      } finally {
        client.release();
      }
    }

    return { archived: archivedCount };
  } catch (err) {
    if (err.code === "42P01") {
      return { archived: 0, message: "Archives table does not exist" };
    }
    throw err;
  }
}

module.exports = {
  getDashboardStats,
  listAdminPartners,
  updatePartnerStatus,
  updatePartnerFeaturedEligibility,
  updatePartnerTier,
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
  archiveExpiredItems,
  getPlatformEarnings,
  getPlatformEarningsReport,
  getPlatformEarningsExportRows,
};

/** City filter: return search terms so e.g. Gurugram also matches Gurgaon in partner address. */
function getPlatformEarningsCitySearchTerms(city) {
  if (!city || typeof city !== 'string') return [];
  const c = String(city).trim();
  if (!c) return [];
  const lower = c.toLowerCase();
  if (lower === 'gurugram' || lower === 'gurgaon') return ['Gurugram', 'Gurgaon'];
  return [c];
}

// Platform earnings from ledger (filters: start_date, end_date, partner_id, tier_id, city)
async function getPlatformEarnings(filters = {}) {
  const { start_date, end_date, partner_id, tier_id, city } = filters;
  const conditions = [];
  const params = [];
  let idx = 1;
  const cityTerms = getPlatformEarningsCitySearchTerms(city);
  const needPartnerJoin = cityTerms.length > 0;

  if (start_date) {
    conditions.push(`pel.created_at >= $${idx}::timestamptz`);
    params.push(start_date);
    idx += 1;
  }
  if (end_date) {
    conditions.push(`pel.created_at <= $${idx}::timestamptz`);
    params.push(end_date);
    idx += 1;
  }
  if (partner_id) {
    conditions.push(`pel.partner_id = $${idx}`);
    params.push(partner_id);
    idx += 1;
  }
  if (tier_id) {
    conditions.push(`pel.tier_id = $${idx}`);
    params.push(tier_id);
    idx += 1;
  }
  if (needPartnerJoin) {
    const placeholders = cityTerms.map(() => `p.address ILIKE $${idx++}`).join(' OR ');
    conditions.push(`(p.address IS NOT NULL AND (${placeholders}))`);
    cityTerms.forEach(t => params.push(`%${t}%`));
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const baseFrom = needPartnerJoin
    ? `FROM platform_earnings_ledger pel JOIN partners p ON p.id = pel.partner_id ${where}`
    : `FROM platform_earnings_ledger pel ${where}`;
  const [totals, byTier, byPartner] = await Promise.all([
    pool.query(
      `SELECT
        COALESCE(SUM(pel.platform_fee_total), 0)::DECIMAL(12,2) AS total_earnings,
        COALESCE(SUM(pel.fiat_component), 0)::DECIMAL(12,2) AS total_fiat,
        COALESCE(SUM(pel.ezt_component), 0)::DECIMAL(12,2) AS total_ezt
       ${baseFrom}`,
      params
    ),
    pool.query(
      `SELECT pt.id AS tier_id, pt.name AS tier_name,
        COALESCE(SUM(pel.platform_fee_total), 0)::DECIMAL(12,2) AS total_earnings,
        COALESCE(SUM(pel.fiat_component), 0)::DECIMAL(12,2) AS total_fiat,
        COALESCE(SUM(pel.ezt_component), 0)::DECIMAL(12,2) AS total_ezt
       FROM platform_earnings_ledger pel
       JOIN partner_tiers pt ON pt.id = pel.tier_id
       ${needPartnerJoin ? 'JOIN partners p ON p.id = pel.partner_id' : ''}
       ${where}
       GROUP BY pt.id, pt.name
       ORDER BY total_earnings DESC`,
      params
    ).catch(() => ({ rows: [] })),
    pool.query(
      `SELECT pel.partner_id, p.name AS partner_name,
        COALESCE(SUM(pel.platform_fee_total), 0)::DECIMAL(12,2) AS total_earnings,
        COALESCE(SUM(pel.fiat_component), 0)::DECIMAL(12,2) AS total_fiat,
        COALESCE(SUM(pel.ezt_component), 0)::DECIMAL(12,2) AS total_ezt
       FROM platform_earnings_ledger pel
       JOIN partners p ON p.id = pel.partner_id
       ${where}
       GROUP BY pel.partner_id, p.name
       ORDER BY total_earnings DESC`,
      params
    ).catch(() => ({ rows: [] })),
  ]);
  const row = totals.rows[0] || {};
  return {
    total_earnings: parseFloat(row.total_earnings || 0),
    total_fiat: parseFloat(row.total_fiat || 0),
    total_ezt: parseFloat(row.total_ezt || 0),
    breakdown_by_tier: (byTier.rows || []).map(r => ({
      tier_id: r.tier_id,
      tier_name: r.tier_name,
      total_earnings: parseFloat(r.total_earnings || 0),
      total_fiat: parseFloat(r.total_fiat || 0),
      total_ezt: parseFloat(r.total_ezt || 0),
    })),
    breakdown_by_partner: (byPartner.rows || []).map(r => ({
      partner_id: r.partner_id,
      partner_name: r.partner_name,
      total_earnings: parseFloat(r.total_earnings || 0),
      total_fiat: parseFloat(r.total_fiat || 0),
      total_ezt: parseFloat(r.total_ezt || 0),
    })),
  };
}

const REPORT_SORT_WHITELIST = new Set([
  'id', 'booking_id', 'partner_id', 'created_at', 'partner_name', 'deal_title',
  'platform_fee_total', 'fiat_component', 'ezt_component', 'tier_name', 'bill_amount'
]);

/** Read-only drill-down report from admin_platform_earnings_view. Parameterized only; no recalculation. */
async function getPlatformEarningsReport(filters = {}) {
  const {
    startDate,
    endDate,
    city,
    partnerId,
    dealId,
    tier,
    page = 1,
    pageSize = 20,
    sortBy = 'created_at',
    sortOrder = 'desc'
  } = filters;
  const conditions = [];
  const params = [];
  let idx = 1;
  if (startDate) {
    conditions.push(`created_at >= $${idx}::timestamptz`);
    params.push(startDate);
    idx += 1;
  }
  if (endDate) {
    conditions.push(`created_at <= $${idx}::timestamptz`);
    params.push(endDate);
    idx += 1;
  }
  if (partnerId) {
    conditions.push(`partner_id = $${idx}`);
    params.push(partnerId);
    idx += 1;
  }
  if (dealId) {
    conditions.push(`deal_id = $${idx}`);
    params.push(dealId);
    idx += 1;
  }
  if (tier) {
    conditions.push(`(tier_name = $${idx} OR tier_name ILIKE $${idx})`);
    params.push(String(tier).trim());
    idx += 1;
  }
  const cityTermsReport = getPlatformEarningsCitySearchTerms(city);
  if (cityTermsReport.length > 0) {
    const placeholders = cityTermsReport.map(() => `partner_address ILIKE $${idx++}`).join(' OR ');
    conditions.push(`(partner_address IS NOT NULL AND (${placeholders}))`);
    cityTermsReport.forEach(t => params.push(`%${t}%`));
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const orderCol = REPORT_SORT_WHITELIST.has(sortBy) ? sortBy : 'created_at';
  const orderDir = sortOrder === 'asc' ? 'ASC' : 'DESC';
  const limit = Math.min(Math.max(parseInt(pageSize, 10) || 20, 1), 500);
  const offset = Math.max(parseInt(page, 10) || 1, 1) - 1;
  const whereParams = [...params];
  params.push(limit, offset);

  try {
    const [countRes, rowsRes] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS total FROM admin_platform_earnings_view ${where}`,
        whereParams
      ),
      pool.query(
        `SELECT id, booking_id, partner_id, tier_id, redemption_id, bill_amount, platform_fee_total, fiat_component, ezt_component, created_at, tier_name, tier_percentage, partner_name, partner_address, deal_id, deal_title
         FROM admin_platform_earnings_view
         ${where}
         ORDER BY ${orderCol} ${orderDir}
         LIMIT $${idx} OFFSET $${idx + 1}`,
        params
      )
    ]);
    const total = countRes.rows[0]?.total ?? 0;
    const rows = (rowsRes.rows || []).map(r => ({
      id: r.id,
      booking_id: r.booking_id,
      partner_id: r.partner_id,
      tier_id: r.tier_id,
      redemption_id: r.redemption_id,
      bill_amount: parseFloat(r.bill_amount || 0),
      platform_fee_total: parseFloat(r.platform_fee_total || 0),
      fiat_component: parseFloat(r.fiat_component || 0),
      ezt_component: parseFloat(r.ezt_component || 0),
      created_at: r.created_at,
      tier_name: r.tier_name,
      tier_percentage: r.tier_percentage != null ? parseFloat(r.tier_percentage) : null,
      partner_name: r.partner_name,
      partner_address: r.partner_address,
      deal_id: r.deal_id,
      deal_title: r.deal_title,
    }));
    return { rows, total, page: offset + 1, pageSize: limit };
  } catch (err) {
    if (err.code === '42P01' && (err.message || '').includes('admin_platform_earnings_view')) {
      return { rows: [], total: 0, page: 1, pageSize: limit };
    }
    throw err;
  }
}

/** Same filters as report; returns rows for CSV export. No recalculation. */
async function getPlatformEarningsExportRows(filters = {}) {
  const { startDate, endDate, city, partnerId, dealId, tier } = filters;
  const conditions = [];
  const params = [];
  let idx = 1;
  if (startDate) {
    conditions.push(`created_at >= $${idx}::timestamptz`);
    params.push(startDate);
    idx += 1;
  }
  if (endDate) {
    conditions.push(`created_at <= $${idx}::timestamptz`);
    params.push(endDate);
    idx += 1;
  }
  if (partnerId) {
    conditions.push(`partner_id = $${idx}`);
    params.push(partnerId);
    idx += 1;
  }
  if (dealId) {
    conditions.push(`deal_id = $${idx}`);
    params.push(dealId);
    idx += 1;
  }
  if (tier) {
    conditions.push(`(tier_name = $${idx} OR tier_name ILIKE $${idx})`);
    params.push(String(tier).trim());
    idx += 1;
  }
  const cityTermsExport = getPlatformEarningsCitySearchTerms(city);
  if (cityTermsExport.length > 0) {
    const placeholders = cityTermsExport.map(() => `partner_address ILIKE $${idx++}`).join(' OR ');
    conditions.push(`(partner_address IS NOT NULL AND (${placeholders}))`);
    cityTermsExport.forEach(t => params.push(`%${t}%`));
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  try {
    const res = await pool.query(
      `SELECT id, booking_id, partner_id, bill_amount, platform_fee_total, fiat_component, ezt_component, created_at, tier_name, tier_percentage, partner_name, partner_address, deal_id, deal_title
       FROM admin_platform_earnings_view ${where} ORDER BY created_at DESC LIMIT 10000`,
      params
    );
    return res.rows || [];
  } catch (err) {
    if (err.code === '42P01' && (err.message || '').includes('admin_platform_earnings_view')) {
      return [];
    }
    throw err;
  }
}
