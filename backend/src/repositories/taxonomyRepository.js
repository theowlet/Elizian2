const { getPool } = require('../config/db');

const pool = getPool();

/**
 * Fetch all taxonomy rows for a given service type.
 * Returns both global rows (partner_id IS NULL) and partner-specific custom rows.
 * Caller is responsible for building the tree structure.
 */
async function getTaxonomyTree(serviceType, partnerId = null) {
  const params = [serviceType];
  let partnerFilter = 'AND partner_id IS NULL';
  if (partnerId) {
    params.push(partnerId);
    partnerFilter = `AND (partner_id IS NULL OR partner_id = $${params.length})`;
  }

  const result = await pool.query(
    `SELECT id, service_type, name, slug, parent_id, display_order, is_custom, partner_id, is_active
     FROM menu_taxonomy
     WHERE service_type = $1
       AND is_active = true
       ${partnerFilter}
     ORDER BY is_custom ASC, display_order ASC, name ASC`,
    params
  );
  return result.rows;
}

/**
 * Create a partner-specific custom taxonomy node.
 */
async function createCustomTaxonomy(partnerId, { service_type, name, slug, parent_id = null, display_order = 99 }) {
  const result = await pool.query(
    `INSERT INTO menu_taxonomy (service_type, name, slug, parent_id, display_order, is_custom, partner_id)
     VALUES ($1, $2, $3, $4, $5, true, $6)
     RETURNING *`,
    [service_type, name, slug, parent_id || null, display_order, partnerId]
  );
  return result.rows[0];
}

/**
 * Get a single taxonomy node by id.
 */
async function getTaxonomyById(id) {
  const result = await pool.query(
    `SELECT t.*, p.name AS parent_name, p.slug AS parent_slug
     FROM menu_taxonomy t
     LEFT JOIN menu_taxonomy p ON t.parent_id = p.id
     WHERE t.id = $1`,
    [id]
  );
  return result.rows[0];
}

/**
 * Return up to 20 distinct menu item names under a given taxonomy node.
 * Used for autocomplete in the MenuBuilderModal.
 * Excludes unavailable items. Aggregates across all partners (cross-venue suggestions).
 */
async function getItemNameSuggestions(taxonomyId, limit = 20) {
  const result = await pool.query(
    `SELECT DISTINCT mi.name
     FROM menu_items mi
     WHERE mi.taxonomy_id = $1
       AND (mi.is_available = true OR mi.is_available IS NULL)
       AND mi.status != 'archived'
     ORDER BY mi.name ASC
     LIMIT $2`,
    [taxonomyId, limit]
  );
  return result.rows.map(r => r.name);
}

/**
 * Check if a slug already exists for a given partner + service type
 * (used to prevent duplicate custom categories).
 */
async function slugExistsForPartner(serviceType, slug, partnerId) {
  const result = await pool.query(
    `SELECT 1 FROM menu_taxonomy
     WHERE service_type = $1 AND slug = $2 AND partner_id = $3
     LIMIT 1`,
    [serviceType, slug, partnerId]
  );
  return result.rowCount > 0;
}

module.exports = {
  getTaxonomyTree,
  createCustomTaxonomy,
  getTaxonomyById,
  getItemNameSuggestions,
  slugExistsForPartner
};
