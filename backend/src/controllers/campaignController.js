const campaignService = require('../services/campaignService');
const { successResponse, errorResponse } = require('../../utils/response');
const { logError } = require('../../utils/logger');

function requirePartnerOwnership(req, partnerId) {
  if (!req.partnerId) {
    return { error: 401, message: 'Partner authentication required' };
  }
  if (req.partnerId !== partnerId) {
    return { error: 403, message: 'Not authorized to manage this venue\'s campaigns' };
  }
  return null;
}

async function listForPartner(req, res) {
  try {
    const { id: partnerId } = req.params;
    const err = requirePartnerOwnership(req, partnerId);
    if (err) return errorResponse(res, err.error, err.message);
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const offset = parseInt(req.query.offset, 10) || 0;
    const campaigns = await campaignService.list(partnerId, limit, offset);
    successResponse(res, 200, 'Campaigns retrieved successfully', campaigns);
  } catch (err) {
    logError('List campaigns error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to list campaigns');
  }
}

async function getOne(req, res) {
  try {
    const { id: partnerId, campaignId } = req.params;
    const err = requirePartnerOwnership(req, partnerId);
    if (err) return errorResponse(res, err.error, err.message);
    const campaign = await campaignService.get(campaignId, partnerId);
    successResponse(res, 200, 'Campaign retrieved successfully', campaign);
  } catch (err) {
    logError('Get campaign error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to get campaign');
  }
}

async function create(req, res) {
  try {
    const { id: partnerId } = req.params;
    const err = requirePartnerOwnership(req, partnerId);
    if (err) return errorResponse(res, err.error, err.message);
    const { title, body, segment_filter, scheduled_at, status } = req.body;
    const campaign = await campaignService.create(partnerId, {
      title,
      body,
      segment_filter,
      scheduled_at,
      status,
    });
    successResponse(res, 201, 'Campaign created successfully', campaign);
  } catch (err) {
    logError('Create campaign error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to create campaign');
  }
}

async function update(req, res) {
  try {
    const { id: partnerId, campaignId } = req.params;
    const err = requirePartnerOwnership(req, partnerId);
    if (err) return errorResponse(res, err.error, err.message);
    const campaign = await campaignService.update(partnerId, campaignId, req.body);
    successResponse(res, 200, 'Campaign updated successfully', campaign);
  } catch (err) {
    logError('Update campaign error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to update campaign');
  }
}

async function sendCampaign(req, res) {
  try {
    const { id: partnerId, campaignId } = req.params;
    const err = requirePartnerOwnership(req, partnerId);
    if (err) return errorResponse(res, err.error, err.message);
    const campaign = await campaignService.send(partnerId, campaignId);
    successResponse(res, 200, 'Campaign sent successfully', campaign);
  } catch (err) {
    logError('Send campaign error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to send campaign');
  }
}

module.exports = {
  listForPartner,
  getOne,
  create,
  update,
  sendCampaign,
};
