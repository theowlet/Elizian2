const { getPool } = require('../config/db');
const { log, logError } = require('../../utils/logger');

const pool = getPool();

// Get all tiers
async function getAllTiers() {
  try {
    const result = await pool.query(
      `SELECT * FROM loyalty_tiers ORDER BY tier_level ASC`
    );
    return result.rows;
  } catch (error) {
    logError('Error getting all tiers:', error);
    throw error;
  }
}

// Get tier by name
async function getTierByName(tierName) {
  try {
    const result = await pool.query(
      `SELECT * FROM loyalty_tiers WHERE tier_name = $1`,
      [tierName]
    );
    return result.rows[0];
  } catch (error) {
    logError('Error getting tier by name:', error);
    throw error;
  }
}

// Get tier by spend amount
async function getTierBySpendAmount(annualSpend) {
  try {
    // Ensure annualSpend is a proper number
    const spendAmount = parseFloat(annualSpend) || 0;
    
    // CRITICAL FIX: Use distinct placeholders ($1 and $2) even though they have the same value
    // PostgreSQL requires distinct placeholders when the same parameter is used multiple times
    // This prevents "inconsistent types deduced for parameter $1" errors
    const result = await pool.query(
      `SELECT * FROM loyalty_tiers 
       WHERE min_annual_spend <= $1
         AND (max_annual_spend >= $2 OR max_annual_spend IS NULL)
       ORDER BY tier_level DESC
       LIMIT 1`,
      [spendAmount, spendAmount]
    );
    return result.rows[0];
  } catch (error) {
    logError('Error getting tier by spend amount:', error);
    throw error;
  }
}

// Get user's current tier info
async function getUserTierInfo(userId) {
  try {
    const result = await pool.query(
      `SELECT 
         u.id,
         u.current_tier_name,
         u.annual_spend_current,
         u.annual_spend_year,
         u.lifetime_spend,
         u.tier_upgraded_at,
         u.previous_tier_name,
         lt.tier_level,
         lt.ezt_reward_percentage,
         lt.min_annual_spend,
         lt.max_annual_spend,
         lt.benefits,
         lt.badge_color,
         lt.badge_icon,
         -- Calculate next tier info
         (SELECT lt2.tier_name FROM loyalty_tiers lt2 WHERE lt2.tier_level = lt.tier_level + 1) as next_tier_name,
         (SELECT lt2.min_annual_spend FROM loyalty_tiers lt2 WHERE lt2.tier_level = lt.tier_level + 1) as next_tier_spend_required,
         -- Calculate progress to next tier
         CASE 
           WHEN lt.max_annual_spend IS NULL THEN 100
           ELSE ROUND((u.annual_spend_current / lt.max_annual_spend) * 100, 2)
         END as tier_progress_percentage
       FROM users u
       LEFT JOIN loyalty_tiers lt ON u.current_tier_name = lt.tier_name
       WHERE u.id = $1`,
      [userId]
    );
    return result.rows[0];
  } catch (error) {
    logError('Error getting user tier info:', error);
    throw error;
  }
}

// Update user tier
async function updateUserTier(userId, newTierName, annualSpend, client = pool) {
  try {
    // Get current tier name before update
    const currentUser = await client.query(
      `SELECT current_tier_name FROM users WHERE id = $1`,
      [userId]
    );
    
    if (currentUser.rows.length === 0) {
      throw new Error('User not found');
    }
    
    const previousTierName = currentUser.rows[0].current_tier_name;
    
    // Get tier levels for history
    const fromTier = await client.query(
      `SELECT tier_level FROM loyalty_tiers WHERE tier_name = $1`,
      [previousTierName]
    );
    const toTier = await client.query(
      `SELECT tier_level FROM loyalty_tiers WHERE tier_name = $1`,
      [newTierName]
    );
    
    const tierLevelChange = (toTier.rows[0]?.tier_level || 0) - (fromTier.rows[0]?.tier_level || 0);
    
    // Update user tier
    // CRITICAL FIX: Avoid using $1 twice in the same query to prevent PostgreSQL type inference errors
    // Instead, get the tier_id first, then use it in the UPDATE
    const tierIdResult = await client.query(
      `SELECT id FROM loyalty_tiers WHERE tier_name = $1`,
      [newTierName]
    );
    const tierId = tierIdResult.rows[0]?.id || null;
    
    // Now update with distinct parameters: $1 = tierId, $2 = newTierName, $3 = previousTierName, $4 = userId
    const result = await client.query(
      `UPDATE users 
       SET 
         current_tier_name = $2,
         current_tier_id = $1,
         previous_tier_name = $3,
         tier_upgraded_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING *`,
      [tierId, newTierName, previousTierName, userId]
    );
    
    // Record tier change in history
    if (result.rows[0]) {
      await client.query(
        `INSERT INTO user_tier_history 
         (user_id, from_tier_name, to_tier_name, tier_level_change, annual_spend_at_change, reason)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, previousTierName, newTierName, tierLevelChange, annualSpend, 'Annual spend threshold reached']
      );
      
      log(`User ${userId} tier upgraded: ${previousTierName} → ${newTierName} at ₹${annualSpend}`);
    }
    
    return result.rows[0];
  } catch (error) {
    logError('Error updating user tier:', error);
    throw error;
  }
}

// Add to user's annual spend and check for tier upgrade
async function addToAnnualSpend(userId, amount, client = pool) {
  try {
    const currentYear = new Date().getFullYear();
    
    // Ensure amount is a proper number (DECIMAL)
    const spendAmount = parseFloat(amount) || 0;
    
    // Update spend amounts with explicit type casting
    const result = await client.query(
      `UPDATE users 
       SET 
         annual_spend_current = CASE 
           WHEN annual_spend_year = $2 THEN annual_spend_current + $3::DECIMAL(12, 2)
           ELSE $3::DECIMAL(12, 2)
         END,
         annual_spend_year = $2,
         lifetime_spend = lifetime_spend + $3::DECIMAL(12, 2),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING annual_spend_current, current_tier_name`,
      [userId, currentYear, spendAmount]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const user = result.rows[0];
    // CRITICAL: Ensure newAnnualSpend is a proper number (DECIMAL) before passing to getTierBySpendAmount
    // PostgreSQL requires consistent types - database values might be strings or null
    const newAnnualSpend = parseFloat(user.annual_spend_current) || 0;
    
    // Check if tier upgrade is needed
    const appropriateTier = await getTierBySpendAmount(newAnnualSpend);
    
    if (appropriateTier && appropriateTier.tier_name !== user.current_tier_name) {
      await updateUserTier(userId, appropriateTier.tier_name, newAnnualSpend, client);
      return {
        tierUpgraded: true,
        oldTier: user.current_tier_name,
        newTier: appropriateTier.tier_name,
        annualSpend: newAnnualSpend
      };
    }
    
    return {
      tierUpgraded: false,
      currentTier: user.current_tier_name,
      annualSpend: newAnnualSpend
    };
  } catch (error) {
    logError('Error adding to annual spend:', error);
    throw error;
  }
}

// Get user tier history
async function getUserTierHistory(userId, limit = 10) {
  try {
    const result = await pool.query(
      `SELECT * FROM user_tier_history 
       WHERE user_id = $1 
       ORDER BY changed_at DESC 
       LIMIT $2`,
      [userId, limit]
    );
    return result.rows;
  } catch (error) {
    logError('Error getting user tier history:', error);
    throw error;
  }
}

// Reset annual spend for new year (scheduled job)
async function resetAnnualSpendForNewYear() {
  try {
    const currentYear = new Date().getFullYear();
    
    const result = await pool.query(
      `UPDATE users 
       SET 
         annual_spend_current = 0,
         annual_spend_year = $1,
         current_tier_name = 'Aether',
         current_tier_id = (SELECT id FROM loyalty_tiers WHERE tier_name = 'Aether'),
         updated_at = CURRENT_TIMESTAMP
       WHERE annual_spend_year < $1
       RETURNING id, email, current_tier_name`,
      [currentYear]
    );
    
    log(`Reset annual spend for ${result.rows.length} users for year ${currentYear}`);
    return result.rows.length;
  } catch (error) {
    logError('Error resetting annual spend:', error);
    throw error;
  }
}

// Calculate EZT reward for booking
async function calculateEZTReward(userId, cashAmount) {
  try {
    // CRITICAL: Ensure cashAmount is a proper number (DECIMAL) to avoid PostgreSQL type inference errors
    const amount = parseFloat(cashAmount) || 0;
    
    const tierInfo = await getUserTierInfo(userId);
    
    if (!tierInfo) {
      return {
        eztAmount: 0,
        percentage: 1.0,
        tierName: 'Aether'
      };
    }
    
    const percentage = parseFloat(tierInfo.ezt_reward_percentage) || 1.0;
    const eztValue = 100; // 1 EZT = ₹100
    const eztAmount = (amount * percentage / 100) / eztValue;
    
    return {
      eztAmount: parseFloat(eztAmount.toFixed(4)),
      percentage,
      tierName: tierInfo.current_tier_name,
      tierLevel: tierInfo.tier_level
    };
  } catch (error) {
    logError('Error calculating EZT reward:', error);
    // Return default values on error
    return {
      eztAmount: 0,
      percentage: 1.0,
      tierName: 'Aether'
    };
  }
}

module.exports = {
  getAllTiers,
  getTierByName,
  getTierBySpendAmount,
  getUserTierInfo,
  updateUserTier,
  addToAnnualSpend,
  getUserTierHistory,
  resetAnnualSpendForNewYear,
  calculateEZTReward
};

