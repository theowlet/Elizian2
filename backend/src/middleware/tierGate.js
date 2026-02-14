/**
 * Tier-gating middleware for exclusive offers/experiences
 * Checks if user's current tier meets the minimum required tier
 */

const { getPool } = require('../config/db');
const { errorResponse } = require('../../utils/response');

const TIER_ORDER = ['Ather', 'Nova', 'Luminar', 'Valiant', 'Echelon'];

function getTierLevel(tierName) {
  const idx = TIER_ORDER.indexOf(tierName);
  return idx >= 0 ? idx : 0;
}

/**
 * Middleware that checks if the user's tier meets a minimum requirement.
 * Use on routes that serve tier-gated content.
 *
 * @param {string} minTier - Minimum tier name required (e.g., 'Luminar')
 */
function requireMinTier(minTier) {
  return async (req, res, next) => {
    try {
      if (!req.userId) {
        return errorResponse(res, 401, 'Authentication required for exclusive content');
      }

      const pool = getPool();
      const result = await pool.query(
        `SELECT t.name as tier_name
         FROM users u
         LEFT JOIN tiers t ON u.current_tier_id = t.id
         WHERE u.id = $1`,
        [req.userId]
      );

      const userTier = result.rows[0]?.tier_name || 'Ather';
      const userLevel = getTierLevel(userTier);
      const requiredLevel = getTierLevel(minTier);

      if (userLevel < requiredLevel) {
        return errorResponse(res, 403, `This experience requires ${minTier} tier or higher. Your current tier: ${userTier}`);
      }

      req.userTier = userTier;
      req.userTierLevel = userLevel;
      next();
    } catch (error) {
      return errorResponse(res, 500, 'Failed to verify tier access');
    }
  };
}

/**
 * Checks if an offer is tier-gated and if user has access.
 * Does not block — sets req.tierAccessGranted for the controller to use.
 */
async function checkOfferTierAccess(req, res, next) {
  try {
    const offerId = req.params.offerId || req.params.id || req.body.offerId;
    if (!offerId || !req.userId) {
      req.tierAccessGranted = true;
      return next();
    }

    const pool = getPool();
    const offerResult = await pool.query(
      'SELECT min_tier_name, is_exclusive FROM partner_offers WHERE id = $1',
      [offerId]
    );

    if (offerResult.rows.length === 0 || !offerResult.rows[0].min_tier_name) {
      req.tierAccessGranted = true;
      return next();
    }

    const minTier = offerResult.rows[0].min_tier_name;

    const userResult = await pool.query(
      `SELECT t.name as tier_name
       FROM users u
       LEFT JOIN tiers t ON u.current_tier_id = t.id
       WHERE u.id = $1`,
      [req.userId]
    );

    const userTier = userResult.rows[0]?.tier_name || 'Ather';
    req.tierAccessGranted = getTierLevel(userTier) >= getTierLevel(minTier);
    req.offerMinTier = minTier;
    req.userTier = userTier;
    next();
  } catch (error) {
    req.tierAccessGranted = true; // Fail open — don't block on error
    next();
  }
}

module.exports = {
  requireMinTier,
  checkOfferTierAccess,
  getTierLevel,
  TIER_ORDER,
};
