/**
 * Campaign Controller — public API for active campaigns (enterprise engine).
 */
const campaignService = require('../campaign/campaignService');
const { successResponse, errorResponse } = require('../../utils/response');
const { normalizeOffers } = require('../utils/responseNormalizer');

async function getActiveCampaigns(req, res) {
  try {
    const userTier = req.query.user_tier || null;
    const campaigns = await campaignService.getActiveCampaignsWithExperiences(userTier);
    const normalized = campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      banner_image_url: c.banner_image_url,
      campaign_type: c.campaign_type,
      priority_weight: c.priority_weight,
      offers: normalizeOffers(c.offers),
    }));
    successResponse(res, 200, 'Active campaigns', normalized);
  } catch (err) {
    errorResponse(res, 500, err.message || 'Failed to load campaigns');
  }
}

module.exports = { getActiveCampaigns };
