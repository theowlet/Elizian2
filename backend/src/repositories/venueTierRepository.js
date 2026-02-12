/**
 * Per-venue custom tiers (partner_venue_tiers)
 */
const { getPool } = require('../config/db');
const pool = getPool();

async function listByPartner(partnerId) {
  const result = await pool.query(
    `SELECT id, partner_id, tier_name, tier_level, min_visits_or_spend, perks_description, display_order, is_active, created_at, updated_at
     FROM partner_venue_tiers
     WHERE partner_id = $1
     ORDER BY display_order ASC, tier_level ASC`,
    [partnerId]
  );
  return result.rows;
}

async function getByIdAndPartner(id, partnerId) {
  const result = await pool.query(
    `SELECT * FROM partner_venue_tiers WHERE id = $1 AND partner_id = $2`,
    [id, partnerId]
  );
  return result.rows[0];
}

async function create(partnerId, { tier_name, tier_level = 1, min_visits_or_spend, perks_description, display_order = 0, is_active = true }) {
  const result = await pool.query(
    `INSERT INTO partner_venue_tiers (partner_id, tier_name, tier_level, min_visits_or_spend, perks_description, display_order, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      partnerId,
      tier_name,
      tier_level,
      min_visits_or_spend ? JSON.stringify(min_visits_or_spend) : null,
      perks_description || null,
      display_order,
      is_active,
    ]
  );
  return result.rows[0];
}

async function update(id, partnerId, { tier_name, tier_level, min_visits_or_spend, perks_description, display_order, is_active }) {
  const updates = [];
  const values = [];
  let i = 1;
  if (tier_name !== undefined) { updates.push(`tier_name = $${i++}`); values.push(tier_name); }
  if (tier_level !== undefined) { updates.push(`tier_level = $${i++}`); values.push(tier_level); }
  if (min_visits_or_spend !== undefined) { updates.push(`min_visits_or_spend = $${i++}`); values.push(min_visits_or_spend ? JSON.stringify(min_visits_or_spend) : null); }
  if (perks_description !== undefined) { updates.push(`perks_description = $${i++}`); values.push(perks_description); }
  if (display_order !== undefined) { updates.push(`display_order = $${i++}`); values.push(display_order); }
  if (is_active !== undefined) { updates.push(`is_active = $${i++}`); values.push(is_active); }
  if (updates.length === 0) return getByIdAndPartner(id, partnerId);
  updates.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id, partnerId);
  const result = await pool.query(
    `UPDATE partner_venue_tiers SET ${updates.join(', ')} WHERE id = $${i} AND partner_id = $${i + 1} RETURNING *`,
    values
  );
  return result.rows[0];
}

async function remove(id, partnerId) {
  const result = await pool.query(
    `DELETE FROM partner_venue_tiers WHERE id = $1 AND partner_id = $2 RETURNING id`,
    [id, partnerId]
  );
  return result.rowCount > 0;
}

module.exports = {
  listByPartner,
  getByIdAndPartner,
  create,
  update,
  remove,
};
