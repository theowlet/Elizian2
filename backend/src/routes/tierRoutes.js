const express = require('express');
const router = express.Router();
const tierService = require('../services/tierService');
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

module.exports = router;

