/**
 * Saved dashboard views — user-scoped, role-scoped.
 */

const { getPool } = require('../config/db');
const pool = getPool();

async function listByUser(userId, role) {
  const result = await pool.query(
    `SELECT id, view_name, filter_json, is_default, created_at, updated_at
     FROM dashboard_views
     WHERE user_id = $1 AND role = $2
     ORDER BY is_default DESC, view_name ASC`,
    [userId, role]
  );
  return result.rows;
}

async function create(userId, role, viewName, filterJson, isDefault = false) {
  if (isDefault) {
    await pool.query(
      `UPDATE dashboard_views SET is_default = false WHERE user_id = $1 AND role = $2`,
      [userId, role]
    );
  }
  const result = await pool.query(
    `INSERT INTO dashboard_views (user_id, role, view_name, filter_json, is_default)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, role, view_name) DO UPDATE
     SET filter_json = EXCLUDED.filter_json, is_default = EXCLUDED.is_default, updated_at = CURRENT_TIMESTAMP
     RETURNING id, view_name, filter_json, is_default, created_at, updated_at`,
    [userId, role, viewName, JSON.stringify(filterJson), isDefault]
  );
  return result.rows[0];
}

async function getById(id, userId) {
  const result = await pool.query(
    `SELECT id, view_name, filter_json, is_default, created_at
     FROM dashboard_views WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return result.rows[0] || null;
}

async function setDefault(userId, role, viewId) {
  await pool.query(
    `UPDATE dashboard_views SET is_default = (id = $1) WHERE user_id = $2 AND role = $3`,
    [viewId, userId, role]
  );
  return true;
}

async function deleteView(id, userId) {
  const result = await pool.query(
    `DELETE FROM dashboard_views WHERE id = $1 AND user_id = $2 RETURNING id`,
    [id, userId]
  );
  return result.rowCount > 0;
}

module.exports = {
  listByUser,
  create,
  getById,
  setDefault,
  deleteView,
};
