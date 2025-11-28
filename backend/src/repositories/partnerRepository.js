const { getPool } = require('../config/db');
const { extractCity } = require('../utils/queries');

const pool = getPool();

// List partners with optional category filter
async function listPartners({ category = null } = {}) {
  const query = `
    SELECT p.id, p.name, p.description, p.partner_discount_percentage AS discount_percentage,
           p.latitude, p.longitude, p.address, p.partner_code, p.email, p.phone_number,
           p.approved_for_featured,
           c.slug AS category, c.name AS category_name
    FROM partners p
    JOIN categories c ON p.category_id = c.id
    WHERE ($1::text IS NULL OR c.slug = $1)
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
async function getPartnerById(partnerId) {
  const result = await pool.query(
    `SELECT p.*, c.name as category_name, c.slug as category_slug 
     FROM partners p 
     LEFT JOIN categories c ON p.category_id = c.id 
     WHERE p.id = $1`,
    [partnerId]
  );
  return result.rows[0];
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
    status = 'pending',
    cuisine_types = [],
    dietary_preferences = [],
    avg_cost_for_two = null
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
      status || 'pending',
      Array.isArray(cuisine_types) ? cuisine_types : [],
      Array.isArray(dietary_preferences) ? dietary_preferences : [],
      avg_cost_for_two
    ]
  );
  return result.rows[0];
}

// Update partner
async function updatePartner(partnerId, updates) {
  const allowedFields = [
    'name', 'description', 'address', 'phone_number', 'email',
    'partner_discount_percentage', 'rating', 'is_active', 'website_url',
    'partner_category_type', 'cuisine_types', 'dietary_preferences', 'avg_cost_for_two'
  ];
  
  const updateFields = [];
  const values = [];
  let paramCount = 0;

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key) && value !== undefined) {
      paramCount++;
      // Handle array fields (cuisine_types, dietary_preferences) specially
      if (['cuisine_types', 'dietary_preferences'].includes(key)) {
        const arrVal = Array.isArray(value) ? value : (value ? [value] : []);
        updateFields.push(`${key} = $${paramCount}::text[]`);
        values.push(arrVal);
      } else if (key === 'avg_cost_for_two') {
        updateFields.push(`${key} = $${paramCount}::numeric`);
        values.push(value);
      } else {
        updateFields.push(`${key} = $${paramCount}`);
        values.push(value);
      }
    }
  }

  if (updateFields.length === 0) {
    throw new Error('No valid fields to update');
  }

  paramCount++;
  updateFields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(partnerId);

  const result = await pool.query(
    `UPDATE partners 
     SET ${updateFields.join(', ')}
     WHERE id = $${paramCount} 
     RETURNING *`,
    values
  );
  return result.rows[0];
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

  // Get recent orders (combine both orders and bookings)
  const recentOrdersResult = await pool.query(
    `SELECT 'order' as type, id, customer_name, total_amount as amount, status, created_at 
     FROM orders 
     WHERE partner_id = $1
     UNION ALL
     SELECT 'booking' as type, b.id, u.first_name || ' ' || u.last_name as customer_name, 
            b.total_price as amount, b.status, b.created_at
     FROM bookings b
     INNER JOIN partner_offers po ON b.deal_id = po.id
     LEFT JOIN users u ON b.user_id = u.id
     WHERE po.partner_id = $1
     ORDER BY created_at DESC LIMIT 5`,
    [partnerId]
  );

  const ordersData = ordersResult.rows[0];
  const bookingsData = bookingsResult.rows[0];

  return {
    partner: partnerResult.rows[0],
    menu_items_count: parseInt(menuResult.rows[0].count),
    total_orders: parseInt(ordersData.total_orders || 0) + parseInt(bookingsData.total_bookings || 0),
    today_orders: parseInt(ordersData.today_orders || 0) + parseInt(bookingsData.today_bookings || 0),
    total_revenue: parseFloat(ordersData.total_revenue || 0) + parseFloat(bookingsData.bookings_revenue || 0),
    recent_orders: recentOrdersResult.rows
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
      completionRatePercent: completionRate
    },
    trends: trendsResult.rows.map(row => ({
      period: row.period,
      bookings: row.bookings,
      revenue: parseFloat(row.revenue || 0)
    })),
    top_offers: topOffersResult.rows.map(row => ({
      id: row.id,
      title: row.title,
      service_type: row.service_type,
      booking_count: row.booking_count,
      revenue: parseFloat(row.revenue || 0)
    })),
    period: daysWindow.toString()
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
  const result = await pool.query(query, [JSON.stringify(menuImages), partnerId]);
  return result.rows[0];
}

async function getPartnerWithMenuImages(partnerId) {
  const query = `
    SELECT 
      p.*, 
      c.name AS category_name, 
      COALESCE(p.menu_images, '[]'::jsonb) AS menu_images
    FROM partners p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.id = $1
  `;
  const result = await pool.query(query, [partnerId]);
  return result.rows[0];
}

module.exports = {
  listPartners,
  getPartnerById,
  getPartnerCategoryId,
  getPartnerByEmail,
  createPartner,
  updatePartner,
  deletePartner,
  getPartnerDashboardStats,
  getPartnerAnalytics,
  updatePartnerMenuImages,
  getPartnerWithMenuImages
};
