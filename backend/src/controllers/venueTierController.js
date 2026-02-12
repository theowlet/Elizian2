const venueTierRepository = require('../repositories/venueTierRepository');
const { successResponse, errorResponse } = require('../../utils/response');
const { logError } = require('../../utils/logger');
function requirePartner(req, res, partnerId) {
  if (!req.partnerId) return errorResponse(res, 401, 'Partner authentication required');
  if (req.partnerId !== partnerId) return errorResponse(res, 403, 'Not authorized');
  return null;
}

async function list(req, res) {
  try {
    const { id: partnerId } = req.params;
    const err = requirePartner(req, res, partnerId);
    if (err) return err;
    const tiers = await venueTierRepository.listByPartner(partnerId);
    successResponse(res, 200, 'Tiers retrieved successfully', tiers);
  } catch (err) {
    logError('List venue tiers error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to list tiers');
  }
}

async function create(req, res) {
  try {
    const { id: partnerId } = req.params;
    const err = requirePartner(req, res, partnerId);
    if (err) return err;
    const { tier_name, tier_level, min_visits_or_spend, perks_description, display_order, is_active } = req.body;
    if (!tier_name || !tier_name.trim()) {
      return errorResponse(res, 400, 'tier_name is required');
    }
    const tier = await venueTierRepository.create(partnerId, {
      tier_name: tier_name.trim(),
      tier_level: tier_level != null ? Number(tier_level) : 1,
      min_visits_or_spend: min_visits_or_spend || null,
      perks_description: perks_description || null,
      display_order: display_order != null ? Number(display_order) : 0,
      is_active: is_active !== false,
    });
    successResponse(res, 201, 'Tier created successfully', tier);
  } catch (err) {
    logError('Create venue tier error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to create tier');
  }
}

async function update(req, res) {
  try {
    const { id: partnerId, tierId } = req.params;
    const err = requirePartner(req, res, partnerId);
    if (err) return err;
    const existing = await venueTierRepository.getByIdAndPartner(tierId, partnerId);
    if (!existing) return errorResponse(res, 404, 'Tier not found');
    const { tier_name, tier_level, min_visits_or_spend, perks_description, display_order, is_active } = req.body;
    const tier = await venueTierRepository.update(tierId, partnerId, {
      ...(tier_name !== undefined && { tier_name: tier_name.trim() }),
      ...(tier_level !== undefined && { tier_level: Number(tier_level) }),
      ...(min_visits_or_spend !== undefined && { min_visits_or_spend }),
      ...(perks_description !== undefined && { perks_description }),
      ...(display_order !== undefined && { display_order: Number(display_order) }),
      ...(is_active !== undefined && { is_active: !!is_active }),
    });
    successResponse(res, 200, 'Tier updated successfully', tier);
  } catch (err) {
    logError('Update venue tier error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to update tier');
  }
}

async function remove(req, res) {
  try {
    const { id: partnerId, tierId } = req.params;
    const err = requirePartner(req, res, partnerId);
    if (err) return err;
    const deleted = await venueTierRepository.remove(tierId, partnerId);
    if (!deleted) return errorResponse(res, 404, 'Tier not found');
    successResponse(res, 200, 'Tier deleted successfully');
  } catch (err) {
    logError('Delete venue tier error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to delete tier');
  }
}

module.exports = { list, create, update, remove };
