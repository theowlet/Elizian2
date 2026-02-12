/**
 * Guest CRM: list guests for a partner, guest profile, visit history, notes
 */
const { getPool } = require('../config/db');
const pool = getPool();

/**
 * List guests who have had bookings at this partner (visit count, total spend, last visit, tier)
 */
async function listGuestsForPartner(partnerId) {
  const query = `
    SELECT
      u.id AS user_id,
      u.first_name,
      u.last_name,
      u.phone_number,
      u.email,
      u.current_tier_name AS tier_name,
      COUNT(b.id)::int AS visit_count,
      COALESCE(SUM(b.total_price), 0)::numeric AS total_spend,
      MAX(b.booking_date) AS last_visit
    FROM users u
    INNER JOIN bookings b ON b.user_id = u.id
    INNER JOIN partner_offers po ON po.id = b.deal_id AND po.partner_id = $1
    WHERE b.status IN ('confirmed', 'redeemed')
    GROUP BY u.id, u.first_name, u.last_name, u.phone_number, u.email, u.current_tier_name
    ORDER BY last_visit DESC NULLS LAST, total_spend DESC
  `;
  const result = await pool.query(query, [partnerId]);
  return result.rows.map((r) => ({
    user_id: r.user_id,
    first_name: r.first_name,
    last_name: r.last_name,
    phone_number: r.phone_number,
    email: r.email,
    tier_name: r.tier_name,
    visit_count: r.visit_count,
    total_spend: parseFloat(r.total_spend),
    last_visit: r.last_visit,
  }));
}

/**
 * Get detailed guest profile for a partner: user info, visit history, notes, value score
 */
async function getGuestProfileForPartner(partnerId, userId) {
  const userResult = await pool.query(
    `SELECT id, first_name, last_name, phone_number, email, current_tier_name
     FROM users WHERE id = $1`,
    [userId]
  );
  if (userResult.rows.length === 0) return null;
  const user = userResult.rows[0];

  const visitsResult = await pool.query(
    `SELECT b.id, b.booking_reference, b.booking_date, b.status, b.total_price, po.title AS offer_title
     FROM bookings b
     INNER JOIN partner_offers po ON po.id = b.deal_id AND po.partner_id = $1
     WHERE b.user_id = $2
     ORDER BY b.booking_date DESC
     LIMIT 50`,
    [partnerId, userId]
  );
  const visit_count = visitsResult.rows.length;
  const total_spend = visitsResult.rows.reduce((s, r) => s + parseFloat(r.total_price || 0), 0);

  let notes = [];
  try {
    const notesResult = await pool.query(
      `SELECT id, note, created_at FROM partner_guest_notes
       WHERE partner_id = $1 AND user_id = $2 ORDER BY created_at DESC`,
      [partnerId, userId]
    );
    notes = notesResult.rows;
  } catch (_) {}

  return {
    user_id: user.id,
    first_name: user.first_name,
    last_name: user.last_name,
    phone_number: user.phone_number,
    email: user.email,
    tier_name: user.current_tier_name,
    visit_count,
    total_spend,
    last_visit: visitsResult.rows[0]?.booking_date || null,
    value_score: computeValueScore(visit_count, total_spend),
    visit_history: visitsResult.rows.map((r) => ({
      booking_id: r.id,
      booking_reference: r.booking_reference,
      booking_date: r.booking_date,
      status: r.status,
      total_price: parseFloat(r.total_price),
      offer_title: r.offer_title,
    })),
    notes: notes.map((n) => ({ id: n.id, note: n.note, created_at: n.created_at })),
  };
}

function computeValueScore(visitCount, totalSpend) {
  const visitScore = Math.min(visitCount * 10, 50);
  const spendScore = Math.min(Math.log10(1 + totalSpend / 1000) * 20, 50);
  return Math.round(visitScore + spendScore);
}

/**
 * Add a note for a guest (partner-only)
 */
async function addGuestNote(partnerId, userId, note, createdByPartnerId) {
  const result = await pool.query(
    `INSERT INTO partner_guest_notes (partner_id, user_id, note, created_by_partner_id)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [partnerId, userId, note, createdByPartnerId]
  );
  return result.rows[0];
}

module.exports = {
  listGuestsForPartner,
  getGuestProfileForPartner,
  addGuestNote,
};
