const { getPool } = require("../config/db");
const { extractCity } = require("../utils/queries");

const pool = getPool();

// List partners with optional category filter
// CRITICAL: Only show approved partners to users
async function listPartners({ category = null } = {}) {
  const query = `
    SELECT p.id, p.name, p.description, p.partner_discount_percentage AS discount_percentage,
           p.latitude, p.longitude, p.address, p.partner_code, p.email, p.phone_number,
           p.approved_for_featured,
           c.slug AS category, c.name AS category_name
    FROM partners p
    JOIN categories c ON p.category_id = c.id
    WHERE p.is_active = true
      AND (p.status IS NULL OR p.status IN ('active', 'approved'))
      AND ($1::text IS NULL OR c.slug = $1)
    ORDER BY p.name ASC
  `;
  const result = await pool.query(query, [category || null]);

  return result.rows.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    discount_percentage: Number(r.discount_percentage),
    latitude: r.latitude,
    longitude: r.longitude,
    city: extractCity(r.address),
    address: r.address,
    partner_code: r.partner_code,
    email: r.email,
    phone_number: r.phone_number,
    approved_for_featured: r.approved_for_featured || false,
  }));
}

// Get partner by ID
// If requireApproval is true (default), only return approved partners
// Works with or without partner_tiers table (migration not yet run).
async function getPartnerById(partnerId, requireApproval = true) {
  const approvalClause = requireApproval
    ? `AND p.is_active = true AND (p.status IS NULL OR p.status IN ('active', 'approved'))`
    : "";

  let result;
  try {
    result = await pool.query(
      `SELECT p.*, c.name as category_name, c.slug as category_slug,
              pt.name AS partner_tier
       FROM partners p
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN partner_tiers pt ON pt.id = p.tier_id
       WHERE p.id = $1 ${approvalClause}`,
      [partnerId]
    );
  } catch (e) {
    if (e.code === "42P01" && (e.message || "").includes("partner_tiers")) {
      try {
        result = await pool.query(
          `SELECT p.*, c.name as category_name, c.slug as category_slug,
                  COALESCE(p.partner_tier, 'Bronze') AS partner_tier
           FROM partners p
           LEFT JOIN categories c ON p.category_id = c.id
           WHERE p.id = $1 ${approvalClause}`,
          [partnerId]
        );
      } catch (e2) {
        if (e2.code === "42703") {
          result = await pool.query(
            `SELECT p.*, c.name as category_name, c.slug as category_slug,
                    'Bronze' AS partner_tier
             FROM partners p
             LEFT JOIN categories c ON p.category_id = c.id
             WHERE p.id = $1 ${approvalClause}`,
            [partnerId]
          );
        } else throw e2;
      }
    } else throw e;
  }

  const row = result.rows[0];
  if (row && Number(row.latitude) === 0 && Number(row.longitude) === 0) {
    row.latitude = null;
    row.longitude = null;
  }
  return row;
}

// Get partner's category_id
async function getPartnerCategoryId(partnerId) {
  const result = await pool.query(
    `SELECT category_id FROM partners WHERE id = $1`,
    [partnerId]
  );
  return result.rows[0]?.category_id || null;
}

// Get partner by email (case-insensitive)
async function getPartnerByEmail(email) {
  const result = await pool.query(
    `SELECT * FROM partners WHERE LOWER(email) = LOWER($1)`,
    [email]
  );
  return result.rows[0];
}

// Create partner
async function createPartner(partnerData) {
  const {
    name,
    category_id,
    description,
    address,
    phone_number,
    email,
    partner_discount_percentage,
    rating,
    latitude,
    longitude,
    is_active = false,
    status = "pending",
    cuisine_types = [],
    dietary_preferences = [],
    avg_cost_for_two = null,
  } = partnerData;

  const result = await pool.query(
    `INSERT INTO partners (name, category_id, description, address, phone_number, email, partner_discount_percentage, rating, latitude, longitude, is_active, status, cuisine_types, dietary_preferences, avg_cost_for_two)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     RETURNING *`,
    [
      name,
      category_id,
      description,
      address,
      phone_number,
      email,
      partner_discount_percentage || 0,
      rating,
      latitude,
      longitude,
      is_active,
      status || "pending",
      Array.isArray(cuisine_types) ? cuisine_types : [],
      Array.isArray(dietary_preferences) ? dietary_preferences : [],
      avg_cost_for_two,
    ]
  );
  return result.rows[0];
}

// Update partner
async function updatePartner(partnerId, updates) {
  const allowedFields = [
    "name",
    "description",
    "address",
    "phone_number",
    "email",
    "partner_discount_percentage",
    "rating",
    "is_active",
    "website_url",
    "partner_category_type",
    "cuisine_types",
    "dietary_preferences",
    "avg_cost_for_two",
    "latitude",
    "longitude",
  ];

  const updateFields = [];
  const values = [];
  let paramCount = 0;

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key) && value !== undefined) {
      paramCount++;
      // Handle array fields (cuisine_types, dietary_preferences) specially
      if (["cuisine_types", "dietary_preferences"].includes(key)) {
        const arrVal = Array.isArray(value) ? value : value ? [value] : [];
        updateFields.push(`${key} = $${paramCount}::text[]`);
        values.push(arrVal);
      } else if (key === "avg_cost_for_two" || key === "latitude" || key === "longitude") {
        updateFields.push(`${key} = $${paramCount}::numeric`);
        values.push(value);
      } else {
        updateFields.push(`${key} = $${paramCount}`);
        values.push(value);
      }
    }
  }

  if (updateFields.length === 0) {
    throw new Error("No valid fields to update");
  }

  paramCount++;
  updateFields.push("updated_at = CURRENT_TIMESTAMP");
  values.push(partnerId);

  const result = await pool.query(
    `UPDATE partners 
     SET ${updateFields.join(", ")}
     WHERE id = $${paramCount} 
     RETURNING *`,
    values
  );
  return result.rows[0];
}

/**
 * Update only geo fields (server-side only, after geocoding). Do not accept from client.
 * Tries full update (lat, lon, place_id, geo_verified, formatted_address) first; if that
 * fails (e.g. migration not run), falls back to latitude/longitude only so exact location is always stored.
 */
async function updatePartnerGeo(partnerId, geo) {
  if (!geo || (geo.latitude == null && geo.longitude == null && geo.place_id == null && geo.geo_verified == null && geo.formatted_address == null)) {
    return null;
  }
  // Never store (0,0) - treat as invalid
  const lat = geo.latitude != null ? Number(geo.latitude) : null;
  const lng = geo.longitude != null ? Number(geo.longitude) : null;
  if (lat === 0 && lng === 0) return null;
  const updates = {};
  if (lat != null) updates.latitude = lat;
  if (lng != null) updates.longitude = lng;
  if (geo.place_id !== undefined) updates.place_id = geo.place_id;
  if (geo.geo_verified !== undefined) updates.geo_verified = Boolean(geo.geo_verified);
  if (geo.formatted_address !== undefined) updates.formatted_address = geo.formatted_address;
  if (Object.keys(updates).length === 0) return null;

  const setClauses = [];
  const values = [];
  let i = 0;
  if (updates.latitude != null) { i++; setClauses.push(`latitude = $${i}`); values.push(updates.latitude); }
  if (updates.longitude != null) { i++; setClauses.push(`longitude = $${i}`); values.push(updates.longitude); }
  if (updates.place_id !== undefined) { i++; setClauses.push(`place_id = $${i}`); values.push(updates.place_id); }
  if (updates.geo_verified !== undefined) { i++; setClauses.push(`geo_verified = $${i}`); values.push(updates.geo_verified); }
  if (updates.formatted_address !== undefined) { i++; setClauses.push(`formatted_address = $${i}`); values.push(updates.formatted_address); }
  setClauses.push("updated_at = CURRENT_TIMESTAMP");
  i++;
  values.push(partnerId);

  try {
    const result = await pool.query(
      `UPDATE partners SET ${setClauses.join(", ")} WHERE id = $${i} RETURNING *`,
      values
    );
    return result.rows[0];
  } catch (err) {
    // If optional geo columns (place_id, geo_verified, formatted_address) don't exist, update only lat/lon
    if ((err.message && (err.message.includes('place_id') || err.message.includes('geo_verified') || err.message.includes('formatted_address'))) || err.code === '42703') {
      const minimal = [
        `latitude = $1`,
        `longitude = $2`,
        'updated_at = CURRENT_TIMESTAMP'
      ];
      const minimalValues = [updates.latitude, updates.longitude, partnerId];
      const res = await pool.query(
        `UPDATE partners SET ${minimal.join(", ")} WHERE id = $3 RETURNING *`,
        minimalValues
      );
      return res.rows[0];
    }
    throw err;
  }
}

// Delete partner
async function deletePartner(partnerId) {
  const result = await pool.query(
    `DELETE FROM partners WHERE id = $1 RETURNING *`,
    [partnerId]
  );
  return result.rows[0];
}

// Get partner dashboard stats
async function getPartnerDashboardStats(partnerId) {
  // Get partner info
  const partnerResult = await pool.query(
    `SELECT * FROM partners WHERE id = $1`,
    [partnerId]
  );

  if (partnerResult.rows.length === 0) {
    return null;
  }

  // Get menu items count
  const menuResult = await pool.query(
    `SELECT COUNT(*) as count FROM menu_items WHERE partner_id = $1`,
    [partnerId]
  );

  // Get orders stats (food/pre-orders from orders table)
  const ordersResult = await pool.query(
    `SELECT 
       COUNT(*) as total_orders,
       COUNT(CASE WHEN DATE(created_at) = CURRENT_DATE THEN 1 END) as today_orders,
       COALESCE(SUM(total_amount), 0) as total_revenue
     FROM orders WHERE partner_id = $1`,
    [partnerId]
  );

  // Get bookings stats (events/deals from bookings table via partner_offers)
  const bookingsResult = await pool.query(
    `SELECT 
       COUNT(*) as total_bookings,
       COUNT(CASE WHEN DATE(b.created_at) = CURRENT_DATE THEN 1 END) as today_bookings,
       COALESCE(SUM(b.total_price), 0) as bookings_revenue
     FROM bookings b
     INNER JOIN partner_offers po ON b.deal_id = po.id
     WHERE po.partner_id = $1`,
    [partnerId]
  );

  // Get recent orders and bookings with voucher redemption details (total bill, fiat paid, co-pay, redeemed_at)
  const recentOrdersResult = await pool.query(
    `SELECT type, id, customer_name, amount, status, created_at,
            total_bill_amount, net_amount_from_user, ezt_co_pay_amount, ezt_tokens_required, redeemed_at
     FROM (
       SELECT 'order' AS type, o.id, o.customer_name, o.total_amount AS amount, o.status, o.created_at,
         NULL::DECIMAL(12,2) AS total_bill_amount, NULL::DECIMAL(12,2) AS net_amount_from_user,
         NULL::DECIMAL(12,2) AS ezt_co_pay_amount, NULL::DECIMAL(15,5) AS ezt_tokens_required, NULL::TIMESTAMPTZ AS redeemed_at,
         o.created_at AS sort_at
       FROM orders o
       WHERE o.partner_id = $1
       UNION ALL
       SELECT 'booking' AS type, b.id,
         COALESCE(u.first_name || ' ' || COALESCE(u.last_name, ''), 'Guest') AS customer_name,
         b.total_price AS amount, b.status, b.created_at,
         ra.total_bill_amount, ra.net_amount_from_user, ra.ezt_co_pay_amount, (ra.ezt_co_pay_amount / 100) AS ezt_tokens_required, ra.redeemed_at,
         COALESCE(ra.redeemed_at, b.created_at) AS sort_at
       FROM bookings b
       INNER JOIN partner_offers po ON b.deal_id = po.id
       LEFT JOIN users u ON b.user_id = u.id
       LEFT JOIN LATERAL (
         SELECT total_bill_amount, net_amount_from_user, ezt_co_pay_amount, redeemed_at
         FROM redemption_audit
         WHERE redemption_audit.booking_id = b.id
         ORDER BY redemption_audit.redeemed_at DESC NULLS LAST
         LIMIT 1
       ) ra ON true
       WHERE po.partner_id = $1
     ) combined
     ORDER BY sort_at DESC NULLS LAST
     LIMIT 10`,
    [partnerId]
  );
  const recentOrders = (recentOrdersResult.rows || []).map(({ sort_at, ...rest }) => rest);

  const ordersData = ordersResult.rows[0];
  const bookingsData = bookingsResult.rows[0];

  return {
    partner: partnerResult.rows[0],
    menu_items_count: parseInt(menuResult.rows[0].count),
    total_orders:
      parseInt(ordersData.total_orders || 0) +
      parseInt(bookingsData.total_bookings || 0),
    today_orders:
      parseInt(ordersData.today_orders || 0) +
      parseInt(bookingsData.today_bookings || 0),
    total_revenue:
      parseFloat(ordersData.total_revenue || 0) +
      parseFloat(bookingsData.bookings_revenue || 0),
    recent_orders: recentOrders,
  };
}

// Get partner analytics
async function getPartnerAnalytics(partnerId, daysWindow = 30) {
  const startDate = new Date(Date.now() - daysWindow * 24 * 60 * 60 * 1000);

  const summaryResult = await pool.query(
    `SELECT 
      COUNT(*)::int AS total_bookings,
      COALESCE(SUM(fiat_amount), 0)::numeric AS total_revenue,
      COALESCE(AVG(fiat_amount), 0)::numeric AS avg_order_value,
      COUNT(DISTINCT user_id)::int AS total_customers,
      COUNT(CASE WHEN status = 'redeemed' THEN 1 END)::int AS redeemed_count,
      COUNT(CASE WHEN status = 'completed' THEN 1 END)::int AS completed_count
     FROM bookings
     WHERE partner_id = $1 AND created_at >= $2`,
    [partnerId, startDate]
  );

  const repeatResult = await pool.query(
    `SELECT COUNT(*)::int AS repeat_customers
     FROM (
       SELECT user_id
       FROM bookings
       WHERE partner_id = $1 AND created_at >= $2
       GROUP BY user_id
       HAVING COUNT(*) > 1
     ) t`,
    [partnerId, startDate]
  );

  const trendsResult = await pool.query(
    `SELECT 
      DATE_TRUNC('day', created_at) AS period,
      COUNT(*)::int AS bookings,
      COALESCE(SUM(fiat_amount), 0)::numeric AS revenue
     FROM bookings
     WHERE partner_id = $1 AND created_at >= $2
     GROUP BY period
     ORDER BY period ASC`,
    [partnerId, startDate]
  );

  const topOffersResult = await pool.query(
    `SELECT 
      po.id,
      po.title,
      po.service_type,
      COUNT(b.id)::int AS booking_count,
      COALESCE(SUM(b.fiat_amount), 0)::numeric AS revenue
     FROM bookings b
     JOIN partner_offers po ON b.deal_id = po.id
     WHERE po.partner_id = $1 AND b.created_at >= $2
     GROUP BY po.id, po.title, po.service_type
     ORDER BY revenue DESC
     LIMIT 5`,
    [partnerId, startDate]
  );

  const summary = summaryResult.rows[0] || {};
  const repeatCustomers = repeatResult.rows[0]?.repeat_customers || 0;
  const completionRate = summary.total_bookings
    ? Math.round((summary.completed_count / summary.total_bookings) * 100)
    : 0;
  const repeatRate = summary.total_customers
    ? Math.round((repeatCustomers / summary.total_customers) * 100)
    : 0;

  return {
    summary: {
      totalBookings: summary.total_bookings || 0,
      totalRevenue: parseFloat(summary.total_revenue || 0),
      avgOrderValue: parseFloat(summary.avg_order_value || 0),
      totalCustomers: summary.total_customers || 0,
      repeatCustomersPercent: repeatRate,
      completionRatePercent: completionRate,
    },
    trends: trendsResult.rows.map((row) => ({
      period: row.period,
      bookings: row.bookings,
      revenue: parseFloat(row.revenue || 0),
    })),
    top_offers: topOffersResult.rows.map((row) => ({
      id: row.id,
      title: row.title,
      service_type: row.service_type,
      booking_count: row.booking_count,
      revenue: parseFloat(row.revenue || 0),
    })),
    period: daysWindow.toString(),
  };
}

// Update partner menu images (scrollable menu viewer)
async function updatePartnerMenuImages(partnerId, menuImages) {
  const query = `
    UPDATE partners
    SET menu_images = $1, updated_at = CURRENT_TIMESTAMP
    WHERE id = $2
    RETURNING *
  `;
  const result = await pool.query(query, [
    JSON.stringify(menuImages),
    partnerId,
  ]);
  return result.rows[0];
}

async function getPartnerWithMenuImages(partnerId, requireApproval = true) {
  let query = `
    SELECT 
      p.*, 
      c.name AS category_name, 
      COALESCE(p.menu_images, '[]'::jsonb) AS menu_images
    FROM partners p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.id = $1
  `;

  // Add approval filter for public access - menu should only be visible for approved partners
  if (requireApproval) {
    query += ` AND p.is_active = true 
               AND (p.status IS NULL OR p.status IN ('active', 'approved'))`;
  }

  const result = await pool.query(query, [partnerId]);
  return result.rows[0];
}

/**
 * Get venue detail for public venue page: partner, menu images, operating hours, review stats.
 * Does not include offers (caller should add from offerService).
 */
async function getVenueDetail(partnerId, requireApproval = true) {
  const partner = await getPartnerWithMenuImages(partnerId, requireApproval);
  if (!partner) return null;

  let reviewStats = { review_count: 0, average_rating: null };
  try {
    const fromReputation = await pool.query(
      `SELECT review_count, rolling_avg_rating AS average_rating
       FROM review_analytics WHERE partner_id = $1`,
      [partnerId]
    );
    if (fromReputation.rows[0]?.review_count > 0) {
      reviewStats.review_count = fromReputation.rows[0].review_count;
      reviewStats.average_rating = fromReputation.rows[0].average_rating != null ? parseFloat(fromReputation.rows[0].average_rating) : null;
    }
    if (reviewStats.review_count === 0) {
      const fromReviews = await pool.query(
        `SELECT COUNT(*)::int AS review_count, ROUND(AVG(rating)::numeric, 2) AS average_rating
         FROM reputation_reviews WHERE partner_id = $1 AND deleted_at IS NULL AND is_visible = true AND moderation_status = 'APPROVED'`,
        [partnerId]
      );
      if (fromReviews.rows[0]?.review_count > 0) {
        reviewStats.review_count = fromReviews.rows[0].review_count;
        reviewStats.average_rating = parseFloat(fromReviews.rows[0].average_rating);
      }
    }
    if (reviewStats.review_count === 0) {
      const legacyResult = await pool.query(
        `SELECT COUNT(*)::int AS review_count, ROUND(AVG(rating)::numeric, 2) AS average_rating
         FROM venue_reviews WHERE partner_id = $1`,
        [partnerId]
      );
      if (legacyResult.rows[0]?.review_count > 0) {
        reviewStats.review_count = legacyResult.rows[0].review_count;
        reviewStats.average_rating = parseFloat(legacyResult.rows[0].average_rating);
      }
    }
  } catch (_) {
    // reputation_reviews / review_analytics / venue_reviews may not exist yet
  }

  // Partner operating hours (from partner_hours if present)
  let hours = [];
  try {
    const hoursResult = await pool.query(
      `SELECT day_of_week, opens_at, closes_at, is_closed FROM partner_hours WHERE partner_id = $1 ORDER BY day_of_week`,
      [partnerId]
    );
    hours = hoursResult.rows;
  } catch (_) {}

  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const hoursFormatted = hours.map((h) => ({
    day: DAYS[h.day_of_week] || `Day ${h.day_of_week}`,
    opens_at: h.opens_at,
    closes_at: h.closes_at,
    is_closed: h.is_closed,
  }));

  return {
    ...partner,
    menu_images: partner.menu_images || [],
    review_count: reviewStats.review_count,
    average_rating: reviewStats.average_rating ?? partner.average_rating ?? partner.rating,
    operating_hours: hoursFormatted,
  };
}

module.exports = {
  listPartners,
  getPartnerById,
  getPartnerCategoryId,
  getPartnerByEmail,
  createPartner,
  updatePartner,
  updatePartnerGeo,
  deletePartner,
  getPartnerDashboardStats,
  getPartnerAnalytics,
  updatePartnerMenuImages,
  getPartnerWithMenuImages,
  getVenueDetail,
};
