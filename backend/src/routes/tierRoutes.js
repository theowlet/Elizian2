const express = require('express');
const router = express.Router();
const tierService = require('../services/tierService');
const tierCardController = require('../controllers/tierCardController');
const authenticateToken = require('../../middleware/authenticateToken');
const requireSuperAdmin = require('../middleware/requireSuperAdmin');
const { successResponse, errorResponse } = require('../../utils/response');
const { logError } = require('../../utils/logger');

// Get all tiers (public endpoint)
router.get('/tiers', async (req, res) => {
  try {
    const tiers = await tierService.getAllTiers();
    successResponse(res, 200, 'Tiers retrieved successfully', tiers);
  } catch (error) {
    logError('Error getting tiers:', error);
    errorResponse(res, error.statusCode || 500, error.message || 'Failed to retrieve tiers');
  }
});

// Get current user tier info
router.get('/user/tier', authenticateToken, async (req, res) => {
  try {
    const tierInfo = await tierService.getUserTier(req.userId);
    successResponse(res, 200, 'User tier info retrieved successfully', tierInfo);
  } catch (error) {
    logError('Error getting user tier:', error);
    errorResponse(res, error.statusCode || 500, error.message || 'Failed to retrieve user tier');
  }
});

// Get user tier history
router.get('/user/tier/history', authenticateToken, async (req, res) => {
  try {
    const history = await tierService.getTierHistory(req.userId);
    successResponse(res, 200, 'Tier history retrieved successfully', history);
  } catch (error) {
    logError('Error getting tier history:', error);
    errorResponse(res, error.statusCode || 500, error.message || 'Failed to retrieve tier history');
  }
});

// Admin: Manually adjust user tier
router.post('/admin/users/:userId/tier', 
  authenticateToken, 
  requireSuperAdmin, 
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { tierName, reason } = req.body;
      
      if (!tierName) {
        return errorResponse(res, 400, 'tierName is required');
      }
      
      const result = await tierService.adminAdjustUserTier(
        userId, 
        tierName, 
        reason || 'Manual adjustment', 
        req.userId
      );
      
      successResponse(res, 200, 'User tier adjusted successfully', result);
    } catch (error) {
      logError('Error adjusting user tier:', error);
      errorResponse(res, error.statusCode || 500, error.message || 'Failed to adjust user tier');
    }
  }
);

// User: Get EAZY PASS tier card data
router.get('/user/tier-card', authenticateToken, tierCardController.getTierCard);

// Partner/User: Verify a tier card QR token
router.post('/partner/verify-tier-card', authenticateToken, tierCardController.verifyTierCard);

// Admin: Update tier configuration
router.put('/admin/tiers/:tierName',
  authenticateToken,
  requireSuperAdmin,
  async (req, res) => {
    try {
      const { tierName } = req.params;
      const { ezt_reward_percentage, min_annual_spend, max_annual_spend, benefits, badge_color, badge_icon, card_theme_config, is_active } = req.body;

      const updates = {};
      if (ezt_reward_percentage !== undefined) updates.ezt_reward_percentage = ezt_reward_percentage;
      if (min_annual_spend !== undefined) updates.min_annual_spend = min_annual_spend;
      if (max_annual_spend !== undefined) updates.max_annual_spend = max_annual_spend;
      if (benefits !== undefined) updates.benefits = benefits;
      if (badge_color !== undefined) updates.badge_color = badge_color;
      if (badge_icon !== undefined) updates.badge_icon = badge_icon;
      if (card_theme_config !== undefined) updates.card_theme_config = card_theme_config;
      if (is_active !== undefined) updates.is_active = is_active;

      if (Object.keys(updates).length === 0) {
        return errorResponse(res, 400, 'No fields to update');
      }

      const updated = await tierService.adminUpdateTier(tierName, updates, req.userId);
      successResponse(res, 200, `Tier "${tierName}" updated successfully`, updated);
    } catch (error) {
      logError('Error updating tier config:', error);
      errorResponse(res, error.statusCode || 500, error.message || 'Failed to update tier');
    }
  }
);

// Admin: Lookup pass by number
router.get('/admin/pass/:passNumber',
  authenticateToken,
  requireSuperAdmin,
  tierCardController.lookupPass
);

// Admin: Get scan history for a pass
router.get('/admin/pass/:passNumber/scans',
  authenticateToken,
  requireSuperAdmin,
  tierCardController.getPassScanHistory
);

module.exports = router;

