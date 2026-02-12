/**
 * Venue reviews (social proof) - repository
 */
const { getPool } = require('../config/db');
const pool = getPool();

async function create(partnerId, userId, { rating, title, comment, booking_id }) {
  const verified = Boolean(booking_id);
  const result = await pool.query(
    `INSERT INTO venue_reviews (partner_id, user_id, booking_id, rating, title, comment, is_verified_visit)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [partnerId, userId, booking_id || null, rating, title || null, comment || null, verified]
  );
  return result.rows[0];
}

async function listByPartner(partnerId, limit = 20, offset = 0) {
  const result = await pool.query(
    `SELECT r.id, r.partner_id, r.user_id, r.booking_id, r.rating, r.title, r.comment, r.is_verified_visit, r.created_at,
            u.first_name, u.last_name
     FROM venue_reviews r
     JOIN users u ON u.id = r.user_id
     WHERE r.partner_id = $1
     ORDER BY r.created_at DESC
     LIMIT $2 OFFSET $3`,
    [partnerId, limit, offset]
  );
  return result.rows.map((row) => ({
    id: row.id,
    partner_id: row.partner_id,
    user_id: row.user_id,
    booking_id: row.booking_id,
    rating: row.rating,
    title: row.title,
    comment: row.comment,
    is_verified_visit: row.is_verified_visit,
    created_at: row.created_at,
    user_name: [row.first_name, row.last_name].filter(Boolean).join(' ') || 'Guest',
  }));
}

async function getAggregate(partnerId) {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS review_count, ROUND(AVG(rating)::numeric, 2) AS average_rating
     FROM venue_reviews WHERE partner_id = $1`,
    [partnerId]
  );
  const row = result.rows[0];
  return {
    review_count: row?.review_count || 0,
    average_rating: row?.review_count > 0 ? parseFloat(row.average_rating) : null,
  };
}

/** Find a redeemed booking for this user at this partner (for verified review) */
async function findRedeemedBookingForUserPartner(userId, partnerId) {
  const result = await pool.query(
    `SELECT b.id FROM bookings b
     INNER JOIN partner_offers po ON po.id = b.deal_id AND po.partner_id = $2
     WHERE b.user_id = $1 AND b.status = 'redeemed'
     ORDER BY b.updated_at DESC LIMIT 1`,
    [userId, partnerId]
  );
  return result.rows[0]?.id || null;
}

module.exports = {
  create,
  listByPartner,
  getAggregate,
  findRedeemedBookingForUserPartner,
};
