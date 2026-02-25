/**
 * Partner tier repository — dynamic tier CRUD (no ENUM).
 * Tiers live in partner_tiers; partners reference by tier_id.
 */

const { getPool } = require('../config/db');

const pool = getPool();

async function list(options = {}) {
  const { activeOnly = false } = options;
  const result = await pool.query(
    `SELECT id, name, description, platform_fee_percent, fiat_fee_percent, ezt_fee_percent, is_active, created_at, updated_at
     FROM partner_tiers
     ${activeOnly ? 'WHERE is_active = true' : ''}
     ORDER BY name`,
    []
  );
  return result.rows;
}

async function getById(id) {
  const result = await pool.query(
    `SELECT id, name, description, platform_fee_percent, fiat_fee_percent, ezt_fee_percent, is_active, created_at, updated_at
     FROM partner_tiers WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

async function getByName(name) {
  if (!name || !String(name).trim()) return null;
  const result = await pool.query(
    `SELECT id, name, description, platform_fee_percent, fiat_fee_percent, ezt_fee_percent, is_active, created_at, updated_at
     FROM partner_tiers WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))`,
    [name]
  );
  return result.rows[0] || null;
}

async function countPartnersByTierId(tierId, executor = pool) {
  const result = await executor.query(
    'SELECT COUNT(*) AS count FROM partners WHERE tier_id = $1',
    [tierId]
  );
  return parseInt(result.rows[0]?.count || 0, 10);
}

async function create(row, executor = pool) {
  const {
    name,
    description = null,
    platform_fee_percent,
    fiat_fee_percent,
    ezt_fee_percent,
    is_active = true
  } = row;
  const result = await executor.query(
    `INSERT INTO partner_tiers (name, description, platform_fee_percent, fiat_fee_percent, ezt_fee_percent, is_active)
     VALUES ($1, $2, $3::DECIMAL(5,2), $4::DECIMAL(5,2), $5::DECIMAL(5,2), $6)
     RETURNING id, name, description, platform_fee_percent, fiat_fee_percent, ezt_fee_percent, is_active, created_at, updated_at`,
    [name, description, platform_fee_percent, fiat_fee_percent, ezt_fee_percent, is_active]
  );
  return result.rows[0];
}

async function update(id, row, executor = pool) {
  const updates = [];
  const values = [];
  let idx = 1;
  const allowed = ['name', 'description', 'platform_fee_percent', 'fiat_fee_percent', 'ezt_fee_percent', 'is_active'];
  for (const key of allowed) {
    if (row[key] !== undefined) {
      if (key === 'platform_fee_percent' || key === 'fiat_fee_percent' || key === 'ezt_fee_percent') {
        updates.push(`${key} = $${idx}::DECIMAL(5,2)`);
      } else {
        updates.push(`${key} = $${idx}`);
      }
      values.push(row[key]);
      idx += 1;
    }
  }
  if (updates.length === 0) return getById(id);
  updates.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(id);
  const result = await executor.query(
    `UPDATE partner_tiers SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id, name, description, platform_fee_percent, fiat_fee_percent, ezt_fee_percent, is_active, created_at, updated_at`,
    values
  );
  return result.rows[0] || null;
}

async function setActive(id, isActive, executor = pool) {
  const result = await executor.query(
    `UPDATE partner_tiers SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, name, is_active, updated_at`,
    [!!isActive, id]
  );
  return result.rows[0] || null;
}

async function remove(id, executor = pool) {
  const count = await countPartnersByTierId(id, executor);
  if (count > 0) {
    const err = new Error(`Cannot delete tier: ${count} partner(s) are assigned to it. Reassign or remove them first.`);
    err.code = 'TIER_IN_USE';
    throw err;
  }
  const result = await executor.query('DELETE FROM partner_tiers WHERE id = $1 RETURNING id', [id]);
  return result.rows[0] || null;
}

/** Get tier by id for redemption (within transaction). */
async function getTierForRedemption(tierId, executor) {
  const result = await executor.query(
    `SELECT id, name, platform_fee_percent, fiat_fee_percent, ezt_fee_percent FROM partner_tiers WHERE id = $1 AND is_active = true`,
    [tierId]
  );
  return result.rows[0] || null;
}

/** Insert one row into platform_earnings_ledger (call within redemption transaction).
 * Stores tier snapshot (tier_name, tier_percentage) when provided so historical data is immune to tier changes.
 */
async function insertLedgerEntry(entry, executor) {
  const {
    partner_id,
    tier_id,
    tier_name,
    tier_percentage,
    booking_id,
    redemption_id,
    bill_amount,
    platform_fee_total,
    fiat_component,
    ezt_component
  } = entry;
  const baseParams = [partner_id, tier_id, booking_id, redemption_id, bill_amount, platform_fee_total, fiat_component, ezt_component];
  const hasTierSnapshot = tier_name != null && tier_percentage != null;
  if (hasTierSnapshot) {
    try {
      await executor.query(
        `INSERT INTO platform_earnings_ledger (partner_id, tier_id, tier_name, tier_percentage, booking_id, redemption_id, bill_amount, platform_fee_total, fiat_component, ezt_component)
         VALUES ($1, $2, $3, $4::DECIMAL(5,2), $5, $6, $7::DECIMAL(12,2), $8::DECIMAL(12,2), $9::DECIMAL(12,2), $10::DECIMAL(12,2))`,
        [partner_id, tier_id, tier_name, tier_percentage, ...baseParams.slice(2)]
      );
      return;
    } catch (err) {
      if (err.code === '42703' || (err.message && err.message.includes('tier_name'))) {
        // Columns not yet added by migration; fall back to insert without snapshot
      } else {
        throw err;
      }
    }
  }
  await executor.query(
    `INSERT INTO platform_earnings_ledger (partner_id, tier_id, booking_id, redemption_id, bill_amount, platform_fee_total, fiat_component, ezt_component)
     VALUES ($1, $2, $3, $4, $5::DECIMAL(12,2), $6::DECIMAL(12,2), $7::DECIMAL(12,2), $8::DECIMAL(12,2))`,
    baseParams
  );
}

module.exports = {
  list,
  getById,
  getByName,
  countPartnersByTierId,
  create,
  update,
  setActive,
  remove,
  getTierForRedemption,
  insertLedgerEntry,
};
