const partnerEnterpriseCampaignService = require('../services/partnerEnterpriseCampaignService');
const { successResponse, errorResponse } = require('../../utils/response');
const { logError } = require('../../utils/logger');

async function getSchema(req, res) {
  try {
    const { id: partnerId } = req.params;
    const tier = await partnerEnterpriseCampaignService.getPartnerTier(partnerId);
    successResponse(res, 200, 'Enterprise campaign schema', {
      tier,
      ...partnerEnterpriseCampaignService.getPartnerEnterpriseCampaignSchema(),
    });
  } catch (error) {
    logError('Partner enterprise campaign schema error:', error);
    errorResponse(res, error.statusCode || 500, error.message || 'Failed to load schema');
  }
}

async function listCampaigns(req, res) {
  try {
    const { id: partnerId } = req.params;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const data = await partnerEnterpriseCampaignService.listPartnerEnterpriseCampaigns(partnerId, {
      search: req.query.search || null,
      status: req.query.status || null,
      limit,
      offset,
    });
    successResponse(res, 200, 'Partner enterprise campaigns retrieved', {
      ...data,
      limit,
      offset,
    });
  } catch (error) {
    logError('Partner enterprise campaign list error:', error);
    errorResponse(res, error.statusCode || 500, error.message || 'Failed to list campaigns');
  }
}

async function getCampaign(req, res) {
  try {
    const { id: partnerId, campaignId } = req.params;
    const data = await partnerEnterpriseCampaignService.getPartnerEnterpriseCampaign(partnerId, campaignId);
    successResponse(res, 200, 'Partner enterprise campaign retrieved', data);
  } catch (error) {
    logError('Partner enterprise campaign get error:', error);
    errorResponse(res, error.statusCode || 500, error.message || 'Failed to get campaign');
  }
}

async function createCampaign(req, res) {
  try {
    const { id: partnerId } = req.params;
    const data = await partnerEnterpriseCampaignService.createPartnerEnterpriseCampaign(partnerId, req.body || {});
    const message = data.request_mode
      ? 'Campaign request submitted to admin for review'
      : 'Enterprise campaign created';
    successResponse(res, 201, message, data);
  } catch (error) {
    logError('Partner enterprise campaign create error:', error);
    errorResponse(res, error.statusCode || 500, error.message || 'Failed to create campaign');
  }
}

async function updateCampaign(req, res) {
  try {
    const { id: partnerId, campaignId } = req.params;
    const data = await partnerEnterpriseCampaignService.updatePartnerEnterpriseCampaign(partnerId, campaignId, req.body || {});
    const message = data.request_mode
      ? 'Campaign request updated'
      : 'Enterprise campaign updated';
    successResponse(res, 200, message, data);
  } catch (error) {
    logError('Partner enterprise campaign update error:', error);
    errorResponse(res, error.statusCode || 500, error.message || 'Failed to update campaign');
  }
}

async function pauseCampaign(req, res) {
  try {
    const { id: partnerId, campaignId } = req.params;
    const data = await partnerEnterpriseCampaignService.pausePartnerEnterpriseCampaign(partnerId, campaignId);
    successResponse(res, 200, 'Campaign paused', data);
  } catch (error) {
    logError('Partner enterprise campaign pause error:', error);
    errorResponse(res, error.statusCode || 500, error.message || 'Failed to pause campaign');
  }
}

async function activateCampaign(req, res) {
  try {
    const { id: partnerId, campaignId } = req.params;
    const data = await partnerEnterpriseCampaignService.activatePartnerEnterpriseCampaign(partnerId, campaignId);
    successResponse(res, 200, 'Campaign activated', data);
  } catch (error) {
    logError('Partner enterprise campaign activate error:', error);
    errorResponse(res, error.statusCode || 500, error.message || 'Failed to activate campaign');
  }
}

module.exports = {
  getSchema,
  listCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
  pauseCampaign,
  activateCampaign,
};

