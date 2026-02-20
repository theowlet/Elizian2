const taxonomyService = require('../services/taxonomyService');
const { successResponse, errorResponse } = require('../../utils/response');
const { logError } = require('../../utils/logger');

/**
 * GET /api/v1/taxonomy?service_type=dining[&partner_id=uuid]
 * Returns the full taxonomy tree for a service type.
 * Includes global categories + partner-specific custom categories when partner_id is provided.
 */
async function getTaxonomyByServiceType(req, res) {
  try {
    const { service_type, partner_id } = req.query;

    if (!service_type) {
      return errorResponse(res, 400, 'service_type query parameter is required');
    }

    const tree = await taxonomyService.getFullTaxonomyTree(service_type, partner_id || null);
    successResponse(res, 200, 'Taxonomy retrieved successfully', tree);
  } catch (err) {
    logError('Taxonomy fetch error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to fetch taxonomy');
  }
}

/**
 * POST /api/v1/partners/:id/taxonomy
 * Create a custom category for a partner.
 * Body: { service_type, name, parent_id? }
 */
async function createCustomCategory(req, res) {
  try {
    const { id: partnerId } = req.params;
    const { service_type, name, parent_id } = req.body;

    if (!service_type || !name) {
      return errorResponse(res, 400, 'service_type and name are required');
    }

    const node = await taxonomyService.createCustomCategory(partnerId, { service_type, name, parent_id });
    successResponse(res, 201, 'Custom category created successfully', node);
  } catch (err) {
    logError('Custom taxonomy creation error:', err);
    if (err.code === '23505') {
      errorResponse(res, 409, 'A category with this name already exists');
    } else {
      errorResponse(res, err.statusCode || 500, err.message || 'Failed to create custom category');
    }
  }
}

/**
 * GET /api/v1/taxonomy/:id/items/suggestions
 * Return up to 20 distinct item names for autocomplete under a taxonomy node.
 */
async function getItemSuggestions(req, res) {
  try {
    const { id } = req.params;
    const suggestions = await taxonomyService.getItemSuggestions(id);
    successResponse(res, 200, 'Suggestions retrieved', { suggestions });
  } catch (err) {
    logError('Taxonomy suggestions error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to fetch suggestions');
  }
}

module.exports = {
  getTaxonomyByServiceType,
  createCustomCategory,
  getItemSuggestions
};
