const { getPool } = require('../config/db');
const pool = getPool();

/**
 * Get partner IDs from user's past bookings and redemptions (venues they've used).
 * Used for preference-based recommendations.
 */
async function getUserPartnerPreferences(userId, maxPartners = 30) {
  const result = await pool.query(
    `(SELECT b.partner_id FROM bookings b WHERE b.user_id = $1 AND b.partner_id IS NOT NULL)
     UNION
     (SELECT ra.redeemed_by_partner_id AS partner_id FROM redemption_audit ra
      JOIN bookings b ON b.id = ra.booking_id WHERE b.user_id = $1 AND ra.redeemed_by_partner_id IS NOT NULL)
     LIMIT $2`,
    [userId, maxPartners]
  );
  const partnerIds = result.rows.map((r) => r.partner_id).filter(Boolean);
  return partnerIds;
}

module.exports = {
  getUserPartnerPreferences,
};
