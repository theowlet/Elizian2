const rewardsService = require('../services/rewardsService');
const { AppError } = require('../../utils/response');
const { logError } = require('../../utils/logger');

/**
 * Get user's complete rewards summary
 * GET /api/v1/rewards/summary
 */
async function getRewardsSummary(req, res) {
  try {
    const userId = req.user.id;
    const summary = await rewardsService.getUserRewardsSummary(userId);
    
    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    logError('Error getting rewards summary:', error);
    if (error instanceof AppError) {
      res.status(error.statusCode).json({
        success: false,
        error: error.message
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve rewards summary'
      });
    }
  }
}

/**
 * Get user's EZT transaction history
 * GET /api/v1/rewards/ezt/transactions
 */
async function getEZTTransactions(req, res) {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    
    const result = await rewardsService.getEZTTransactions(userId, { limit, offset });
    
    res.json({
      success: true,
      data: {
        transactions: result.transactions,
        pagination: {
          page,
          limit,
          total: result.total,
          pages: Math.ceil(result.total / limit)
        }
      }
    });
  } catch (error) {
    logError('Error getting EZT transactions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve EZT transactions'
    });
  }
}

/**
 * Get user's loyalty points transaction history
 * GET /api/v1/rewards/loyalty/transactions
 */
async function getLoyaltyTransactions(req, res) {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    
    const result = await rewardsService.getLoyaltyTransactions(userId, { limit, offset });
    
    res.json({
      success: true,
      data: {
        transactions: result.transactions,
        pagination: {
          page,
          limit,
          total: result.total,
          pages: Math.ceil(result.total / limit)
        }
      }
    });
  } catch (error) {
    logError('Error getting loyalty transactions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve loyalty transactions'
    });
  }
}

/**
 * Get user's tier upgrade history
 * GET /api/v1/rewards/tier/history
 */
async function getTierHistory(req, res) {
  try {
    const userId = req.user.id;
    const history = await rewardsService.getTierHistory(userId);
    
    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    logError('Error getting tier history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve tier history'
    });
  }
}

/**
 * Admin: Get user's rewards summary
 * GET /api/v1/admin/rewards/user/:userId
 */
async function adminGetUserRewards(req, res) {
  try {
    const { userId } = req.params;
    const summary = await rewardsService.getUserRewardsSummary(userId);
    
    // Get user basic info
    const { getPool } = require('../config/db');
    const pool = getPool();
    const userResult = await pool.query(
      'SELECT id, first_name, last_name, email, phone_number FROM users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    res.json({
      success: true,
      data: {
        user: userResult.rows[0],
        rewards: summary
      }
    });
  } catch (error) {
    logError('Error getting user rewards (admin):', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve user rewards'
    });
  }
}

/**
 * Admin: Manually credit EZT or loyalty points
 * POST /api/v1/admin/rewards/manual-credit
 */
async function adminManualCredit(req, res) {
  try {
    const { userId, type, amount, reason } = req.body;
    const adminUserId = req.user.id;
    
    if (!userId || !type || !amount) {
      return res.status(400).json({
        success: false,
        error: 'userId, type, and amount are required'
      });
    }
    
    if (!['ezt', 'loyalty'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'type must be "ezt" or "loyalty"'
      });
    }
    
    const result = await rewardsService.manualCredit(userId, type, amount, reason || `Manual credit by admin ${adminUserId}`, adminUserId);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logError('Error manually crediting rewards:', error);
    if (error instanceof AppError) {
      res.status(error.statusCode).json({
        success: false,
        error: error.message
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to credit rewards'
      });
    }
  }
}

module.exports = {
  getRewardsSummary,
  getEZTTransactions,
  getLoyaltyTransactions,
  getTierHistory,
  adminGetUserRewards,
  adminManualCredit
};

