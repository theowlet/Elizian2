const taxonomyRepository = require('../repositories/taxonomyRepository');

// Valid service type keys — must match serviceController.js SERVICE_TYPES
const VALID_SERVICE_TYPES = ['dining', 'events', 'spa-and-salon', 'wellness', 'healthcare', 'travel', 'others'];

/**
 * Build a nested tree from flat taxonomy rows.
 * Returns: Array of top-level category nodes, each with a `children` array.
 */
function buildTree(rows) {
  const map = {};
  const roots = [];

  for (const row of rows) {
    map[row.id] = { ...row, children: [] };
  }

  for (const row of rows) {
    if (row.parent_id && map[row.parent_id]) {
      map[row.parent_id].children.push(map[row.id]);
    } else if (!row.parent_id) {
      roots.push(map[row.id]);
    }
  }

  // Sort roots by display_order, then children within each root
  roots.sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name));
  for (const root of roots) {
    root.children.sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name));
  }

  return roots;
}

/**
 * Get the full taxonomy tree for a service type.
 * Merges global (is_custom=false) and partner-specific (is_custom=true) nodes.
 */
async function getFullTaxonomyTree(serviceType, partnerId = null) {
  if (!VALID_SERVICE_TYPES.includes(serviceType)) {
    const err = new Error(`Invalid service type: ${serviceType}`);
    err.statusCode = 400;
    throw err;
  }

  const rows = await taxonomyRepository.getTaxonomyTree(serviceType, partnerId);
  const tree = buildTree(rows);
  return { service_type: serviceType, categories: tree };
}

/**
 * Generate a URL-safe slug from a name string.
 */
function nameToSlug(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 100);
}

/**
 * Create a custom category for a partner.
 * Validates service type, generates slug, prevents duplicates.
 */
async function createCustomCategory(partnerId, data) {
  const { service_type, name, parent_id, display_order } = data;

  if (!VALID_SERVICE_TYPES.includes(service_type)) {
    const err = new Error(`Invalid service type: ${service_type}`);
    err.statusCode = 400;
    throw err;
  }

  if (!name || name.trim().length < 2) {
    const err = new Error('Category name must be at least 2 characters');
    err.statusCode = 400;
    throw err;
  }

  if (name.trim().length > 150) {
    const err = new Error('Category name must be under 150 characters');
    err.statusCode = 400;
    throw err;
  }

  // Generate slug: prefix with partner short id to avoid collisions
  const baseSlug = nameToSlug(name.trim());
  const slug = `custom-${partnerId.slice(0, 8)}-${baseSlug}`;

  const exists = await taxonomyRepository.slugExistsForPartner(service_type, slug, partnerId);
  if (exists) {
    const err = new Error('A category with this name already exists');
    err.statusCode = 409;
    throw err;
  }

  // Validate parent_id belongs to the same service_type if provided
  if (parent_id) {
    const parent = await taxonomyRepository.getTaxonomyById(parent_id);
    if (!parent || parent.service_type !== service_type) {
      const err = new Error('Parent category does not exist or belongs to a different service type');
      err.statusCode = 400;
      throw err;
    }
    // Only allow one level of nesting for custom categories
    if (parent.parent_id) {
      const err = new Error('Cannot nest custom categories more than one level deep');
      err.statusCode = 400;
      throw err;
    }
  }

  return taxonomyRepository.createCustomTaxonomy(partnerId, {
    service_type,
    name: name.trim(),
    slug,
    parent_id: parent_id || null,
    display_order: display_order ?? 99
  });
}

/**
 * Get item name suggestions for autocomplete.
 */
async function getItemSuggestions(taxonomyId) {
  if (!taxonomyId) return [];
  return taxonomyRepository.getItemNameSuggestions(taxonomyId);
}

module.exports = {
  getFullTaxonomyTree,
  createCustomCategory,
  getItemSuggestions,
  VALID_SERVICE_TYPES
};
