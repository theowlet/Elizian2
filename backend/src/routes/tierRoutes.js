const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const tierService = require('../services/tierService');
const tierCardController = require('../controllers/tierCardController');
const authenticateToken = require('../../middleware/authenticateToken');
const requireSuperAdmin = require('../middleware/requireSuperAdmin');
const { successResponse, errorResponse } = require('../../utils/response');
const { logError } = require('../../utils/logger');
const { getPool } = require('../config/db');
const { writeAuditWithExecutor } = require('../utils/audit');
const { getUserRoleById } = require('../utils/queries');

const pool = getPool();

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

// Admin: Manually adjust user tier (dual auth: requires password re-entry + mandatory reason)
router.post('/admin/users/:userId/tier',
  authenticateToken,
  requireSuperAdmin,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { tierName, reason, password } = req.body;

      if (!tierName) {
        return errorResponse(res, 400, 'tierName is required');
      }
      if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
        return errorResponse(res, 400, 'A reason (min 5 characters) is required for tier changes');
      }
      if (!password) {
        return errorResponse(res, 400, 'Password re-entry is required to confirm this action');
      }

      // Dual authentication: verify admin password
      const authResult = await pool.query(
        `SELECT c.password_hash FROM users u
         JOIN user_auth_credentials c ON u.id = c.user_id
         WHERE u.id = $1 AND c.password_hash IS NOT NULL`,
        [req.userId]
      );
      if (authResult.rows.length === 0) {
        return errorResponse(res, 403, 'Admin account has no password set. Use password reset.');
      }
      const isValid = await bcrypt.compare(password, authResult.rows[0].password_hash);
      if (!isValid) {
        return errorResponse(res, 401, 'Invalid password. Please re-enter your password to confirm.');
      }

      const result = await tierService.adminAdjustUserTier(
        userId,
        tierName,
        reason.trim(),
        req.userId,
        {
          ipAddress: req.ip || req.connection?.remoteAddress || req.headers['x-forwarded-for'] || null,
          userAgent: req.headers['user-agent'] || null
        }
      );

      // Non-repudiable audit log (append-only)
      const actorRole = await getUserRoleById(req.userId);
      await writeAuditWithExecutor(pool, req.userId, actorRole, 'user_tier_change', 'user', userId, {
        previous: result.previousTier,
        next: result.newTier,
        reason: reason.trim(),
        ip_address: req.ip || req.connection?.remoteAddress || req.headers['x-forwarded-for'] || null,
        user_agent: req.headers['user-agent'] || null,
        context: 'admin_manual_tier_change'
      });

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

