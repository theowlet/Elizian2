const tierRepository = require('../repositories/tierRepository');
const { getPool } = require('../config/db');
const { AppError } = require('../../utils/response');
const { log, logError } = require('../../utils/logger');

const pool = getPool();

// Get all tiers
async function getAllTiers() {
  try {
    return await tierRepository.getAllTiers();
  } catch (error) {
    logError('Error in getAllTiers service:', error);
    throw error;
  }
}

// Get user tier information
async function getUserTier(userId) {
  try {
    const tierInfo = await tierRepository.getUserTierInfo(userId);
    
    if (!tierInfo) {
      throw new AppError(404, 'User not found');
    }
    
    return {
      current: {
        name: tierInfo.current_tier_name,
        level: tierInfo.tier_level,
        badgeColor: tierInfo.badge_color,
        badgeIcon: tierInfo.badge_icon,
        rewardPercentage: parseFloat(tierInfo.ezt_reward_percentage || 1.0),
        benefits: tierInfo.benefits
      },
      spending: {
        annual: parseFloat(tierInfo.annual_spend_current || 0),
        lifetime: parseFloat(tierInfo.lifetime_spend || 0),
        year: tierInfo.annual_spend_year
      },
      progress: {
        percentage: parseFloat(tierInfo.tier_progress_percentage || 0),
        nextTier: tierInfo.next_tier_name,
        nextTierRequirement: parseFloat(tierInfo.next_tier_spend_required || 0),
        amountNeeded: Math.max(0, parseFloat(tierInfo.next_tier_spend_required || 0) - parseFloat(tierInfo.annual_spend_current || 0))
      },
      history: {
        lastUpgrade: tierInfo.tier_upgraded_at,
        previousTier: tierInfo.previous_tier_name
      }
    };
  } catch (error) {
    logError('Error in getUserTier service:', error);
    throw error;
  }
}

// Process booking with tier logic. Pass executor (client) when called inside an existing transaction to avoid nested transactions.
async function processBookingWithTier(userId, bookingAmount, executor = null) {
  const client = executor || await pool.connect();
  const shouldRelease = !executor;
  try {
    if (!executor) await client.query('BEGIN');
    const amount = parseFloat(bookingAmount) || 0;
    if (amount <= 0) {
      throw new Error(`Invalid booking amount: ${bookingAmount}`);
    }
    const reward = await tierRepository.calculateEZTReward(userId, amount);
    const spendResult = await tierRepository.addToAnnualSpend(userId, amount, client);
    if (!executor) await client.query('COMMIT');
    return {
      eztEarned: reward.eztAmount,
      rewardPercentage: reward.percentage,
      tierAtBooking: reward.tierName,
      tierUpgrade: spendResult.tierUpgraded ? {
        upgraded: true,
        from: spendResult.oldTier,
        to: spendResult.newTier
      } : null,
      newAnnualSpend: spendResult.annualSpend
    };
  } catch (error) {
    if (!executor) await client.query('ROLLBACK');
    logError('Error in processBookingWithTier:', error);
    throw error;
  } finally {
    if (shouldRelease) client.release();
  }
}

// Get tier history
async function getTierHistory(userId) {
  try {
    return await tierRepository.getUserTierHistory(userId);
  } catch (error) {
    logError('Error in getTierHistory service:', error);
    throw error;
  }
}

// Admin: Manually adjust user tier
async function adminAdjustUserTier(userId, newTierName, reason, adminUserId) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const tier = await tierRepository.getTierByName(newTierName);
    
    if (!tier) {
      throw new AppError(400, `Invalid tier name: ${newTierName}`);
    }
    
    const user = await tierRepository.getUserTierInfo(userId);
    
    if (!user) {
      throw new AppError(404, 'User not found');
    }
    
    if (user.current_tier_name === newTierName) {
      throw new AppError(400, 'User is already in this tier');
    }
    
    const previousTierName = user.current_tier_name;
    const annualSpend = parseFloat(user.annual_spend_current || 0);
    
    await tierRepository.updateUserTier(userId, newTierName, annualSpend, client);
    
    // Log the manual adjustment in history
    const fromTier = await client.query(
      `SELECT tier_level FROM loyalty_tiers WHERE tier_name = $1`,
      [previousTierName]
    );
    const toTier = await client.query(
      `SELECT tier_level FROM loyalty_tiers WHERE tier_name = $1`,
      [newTierName]
    );
    
    const tierLevelChange = (toTier.rows[0]?.tier_level || 0) - (fromTier.rows[0]?.tier_level || 0);
    
    await client.query(
      `INSERT INTO user_tier_history 
       (user_id, from_tier_name, to_tier_name, tier_level_change, annual_spend_at_change, reason)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        userId,
        previousTierName,
        newTierName,
        tierLevelChange,
        annualSpend,
        `Manual adjustment by admin: ${reason}`
      ]
    );
    
    await client.query('COMMIT');
    
    log(`Admin ${adminUserId} adjusted tier for user ${userId}: ${previousTierName} → ${newTierName}`);
    
    return { 
      success: true,
      previousTier: previousTierName,
      newTier: newTierName
    };
  } catch (error) {
    await client.query('ROLLBACK');
    logError('Error in adminAdjustUserTier:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Admin: Update tier configuration (reward %, spend thresholds, benefits)
async function adminUpdateTier(tierName, updates, adminUserId = null) {
  try {
    const tier = await tierRepository.getTierByName(tierName);
    if (!tier) {
      throw new AppError(404, `Tier "${tierName}" not found`);
    }

    if (updates.ezt_reward_percentage !== undefined) {
      const pct = parseFloat(updates.ezt_reward_percentage);
      if (isNaN(pct) || pct < 0 || pct > 100) {
        throw new AppError(400, 'EZT reward percentage must be between 0 and 100');
      }
    }

    if (updates.min_annual_spend !== undefined) {
      const min = parseFloat(updates.min_annual_spend);
      if (isNaN(min) || min < 0) {
        throw new AppError(400, 'Minimum annual spend must be >= 0');
      }
    }

    if (updates.max_annual_spend !== undefined && updates.max_annual_spend !== null) {
      const max = parseFloat(updates.max_annual_spend);
      if (isNaN(max) || max < 0) {
        throw new AppError(400, 'Maximum annual spend must be >= 0');
      }
    }

    // Attach admin user ID for audit trail logging
    if (adminUserId) {
      updates._adminUserId = adminUserId;
    }

    const updated = await tierRepository.updateTierConfig(tierName, updates);
    log(`Tier "${tierName}" updated by admin${adminUserId ? ` (admin: ${adminUserId})` : ''}`);
    return updated;
  } catch (error) {
    logError('Error in adminUpdateTier:', error);
    throw error;
  }
}

module.exports = {
  getAllTiers,
  getUserTier,
  processBookingWithTier,
  getTierHistory,
  adminAdjustUserTier,
  adminUpdateTier
};

