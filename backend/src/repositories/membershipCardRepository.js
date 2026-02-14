const { getPool } = require('../config/db');
const pool = getPool();

async function addCard({ userId, partnerId, cardType = 'default', metadata = {} }) {
  const result = await pool.query(
    `INSERT INTO user_venue_membership_cards (user_id, partner_id, card_type, metadata)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, partner_id) DO NOTHING
     RETURNING *`,
    [userId, partnerId, cardType, JSON.stringify(metadata)]
  );
  return result.rows[0];
}

async function getCardsByUserId(userId) {
  const result = await pool.query(
    `SELECT c.*, p.name AS partner_name, NULL::text AS partner_image
     FROM user_venue_membership_cards c
     JOIN partners p ON p.id = c.partner_id
     WHERE c.user_id = $1
     ORDER BY c.earned_at DESC`,
    [userId]
  );
  return result.rows;
}

async function hasCard(userId, partnerId) {
  const result = await pool.query(
    `SELECT 1 FROM user_venue_membership_cards WHERE user_id = $1 AND partner_id = $2`,
    [userId, partnerId]
  );
  return result.rows.length > 0;
}

module.exports = {
  addCard,
  getCardsByUserId,
  hasCard,
};
