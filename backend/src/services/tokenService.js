const { getPool } = require('../config/db');
const { log, logError } = require('../utils/logger');

const pool = getPool();

// Get token earning percentage by tier name
const getTokenPercentage = (membershipTier) => {
  const percentages = {
    'Ather': 1,
    'Nova': 2,
    'Luminar': 3,
    'Valiant': 4,
    'Echelon': 5
  };
  return percentages[membershipTier] || 1;
};

// Award EZT tokens to user based on transaction (supports 5 decimal places)
// Formula: EZT earned = (amount_spent * tier_percentage) / 100 / 100
// Where 100 is the EZT value (₹100 = 1 EZT)
const awardTokens = async (userId, amountSpent, transactionId = null, description = '') => {
  try {
    // Get user's current tier
    const userResult = await pool.query(
      `SELECT u.current_tier_id, u.total_tokens_earned, u.available_tokens, t.name as tier_name, t.token_earning_percentage
       FROM users u
       LEFT JOIN tiers t ON u.current_tier_id = t.id
       WHERE u.id = $1`,
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      logError('❌ User not found for token award:', userId);
      return 0;
    }
    
    const user = userResult.rows[0];
    let tierName = user.tier_name || 'Ather';
    let tokenPercentage = parseFloat(user.token_earning_percentage) || 1.0;
    
    // If user has no tier, assign Ather (default)
    if (!user.current_tier_id) {
      const baseTier = await pool.query("SELECT id, name FROM tiers WHERE LOWER(name) IN ('ather', 'aether') ORDER BY name LIMIT 1");
      if (baseTier.rows.length > 0) {
        await pool.query('UPDATE users SET current_tier_id = $1 WHERE id = $2', [baseTier.rows[0].id, userId]);
        tierName = baseTier.rows[0].name || 'Ather';
        tokenPercentage = 1.0;
      }
    }
    
    // Calculate EZT earned: (amount_spent * tier_percentage) / 100 / 100
    // Example: ₹1000 spent at 2% tier = (1000 * 2) / 100 / 100 = 0.2 EZT
    const eztEarned = parseFloat((amountSpent * tokenPercentage) / 100 / 100).toFixed(5);
    const eztEarnedDecimal = parseFloat(eztEarned);
    
    if (eztEarnedDecimal > 0) {
      // Update user's token balance (supports 5 decimal places)
      await pool.query(
        `UPDATE users 
         SET available_tokens = available_tokens + $1,
             total_tokens_earned = total_tokens_earned + $1
         WHERE id = $2`,
        [eztEarnedDecimal, userId]
      );
      
      // Record in token ledger
      const balanceBefore = parseFloat(user.available_tokens || 0);
      const balanceAfter = balanceBefore + eztEarnedDecimal;
      
      await pool.query(
        `INSERT INTO token_ledger (user_id, transaction_id, amount, ledger_type, balance_before, balance_after, description)
         VALUES ($1, $2, $3, 'earned', $4, $5, $6)`,
        [userId, transactionId, eztEarnedDecimal, balanceBefore, balanceAfter, description || `Earned from purchase (${tierName} tier ${tokenPercentage}%)`]
      );
      
      // Update tier progress and check for tier upgrade
      await updateTierProgress(userId, amountSpent);
      
      log(`✅ Awarded ${eztEarned} EZT to user ${userId} (${tierName} tier, ${tokenPercentage}%)`);
    }
    
    return eztEarnedDecimal;
  } catch (error) {
    logError('❌ Error awarding tokens:', error);
    return 0;
  }
};

// Update tier progress and promote user if they reach next tier
const updateTierProgress = async (userId, amountSpent) => {
  try {
    // Get user's current tier and total spend
    const userResult = await pool.query(
      `SELECT u.current_tier_id, u.total_tokens_earned, t.level as current_level, t.min_spend_required as current_min_spend
       FROM users u
       LEFT JOIN tiers t ON u.current_tier_id = t.id
       WHERE u.id = $1`,
      [userId]
    );
    
    if (userResult.rows.length === 0) return;
    
    const user = userResult.rows[0];
    const currentLevel = user.current_level || 1;
    
    // Calculate total lifetime spend from transactions
    const spendResult = await pool.query(
      `SELECT COALESCE(SUM(bill_amount), 0) as total_spend
       FROM transactions
       WHERE user_id = $1 AND payment_status = 'completed'`,
      [userId]
    );
    
    const totalSpend = parseFloat(spendResult.rows[0].total_spend || 0);
    
    // Get all tiers ordered by level
    const tiersResult = await pool.query(
      'SELECT id, name, level, min_spend_required FROM tiers ORDER BY level DESC'
    );
    
    // Find the highest tier the user qualifies for
    let newTierId = user.current_tier_id;
    let newTierName = 'Ather';
    
    for (const tier of tiersResult.rows) {
      if (totalSpend >= parseFloat(tier.min_spend_required || 0)) {
        newTierId = tier.id;
        newTierName = tier.name;
        break;
      }
    }
    
    // If tier changed, update user and record promotion
    if (newTierId !== user.current_tier_id) {
      const oldTierResult = await pool.query('SELECT name FROM tiers WHERE id = $1', [user.current_tier_id]);
      const oldTierName = oldTierResult.rows[0]?.name || 'Ather';
      
      await pool.query(
        `UPDATE users SET current_tier_id = $1 WHERE id = $2`,
        [newTierId, userId]
      );
      
      // Update tier_progress table
      await pool.query(
        `INSERT INTO tier_progress (user_id, current_tier_id, previous_tier_id, total_spend, promoted_at)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
         ON CONFLICT (user_id) 
         DO UPDATE SET 
           previous_tier_id = tier_progress.current_tier_id,
           current_tier_id = $2,
           total_spend = $4,
           promoted_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP`,
        [userId, newTierId, user.current_tier_id, totalSpend]
      );
      
      log(`🎉 User ${userId} promoted from ${oldTierName} to ${newTierName} (Total spend: ₹${totalSpend})`);
    } else {
      // Update tier_progress with current spend
      await pool.query(
        `INSERT INTO tier_progress (user_id, current_tier_id, total_spend, updated_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
         ON CONFLICT (user_id) 
         DO UPDATE SET total_spend = $3, updated_at = CURRENT_TIMESTAMP`,
        [userId, newTierId, totalSpend]
      );
    }
  } catch (error) {
    logError('❌ Error updating tier progress:', error);
  }
};

// Redeem EZT tokens at checkout (₹100 per EZT, supports 5 decimal places)
const redeemTokens = async (userId, eztAmount, transactionId = null, description = '') => {
  try {
    // Get user's current token balance
    const userResult = await pool.query(
      'SELECT available_tokens, total_tokens_spent FROM users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      throw new Error('User not found');
    }
    
    const availableTokens = parseFloat(userResult.rows[0].available_tokens || 0);
    const eztToRedeem = parseFloat(eztAmount);
    
    if (eztToRedeem > availableTokens) {
      throw new Error(`Insufficient EZT balance. Available: ${availableTokens.toFixed(5)}, Required: ${eztToRedeem.toFixed(5)}`);
    }
    
    // Calculate discount amount (1 EZT = ₹100)
    const discountAmount = eztToRedeem * 100;
    
    // Update user's token balance
    const balanceBefore = availableTokens;
    const balanceAfter = availableTokens - eztToRedeem;
    
    await pool.query(
      `UPDATE users 
       SET available_tokens = available_tokens - $1,
           total_tokens_spent = total_tokens_spent + $1
       WHERE id = $2`,
      [eztToRedeem, userId]
    );
    
    // Record in token ledger
    await pool.query(
      `INSERT INTO token_ledger (user_id, transaction_id, amount, ledger_type, balance_before, balance_after, description)
       VALUES ($1, $2, $3, 'spent', $4, $5, $6)`,
      [userId, transactionId, eztToRedeem, balanceBefore, balanceAfter, description || `Redeemed for discount (₹${discountAmount})`]
    );
    
    log(`✅ Redeemed ${eztToRedeem.toFixed(5)} EZT from user ${userId} (₹${discountAmount} discount)`);
    
    return {
      eztRedeemed: eztToRedeem,
      discountAmount: discountAmount,
      balanceBefore: balanceBefore,
      balanceAfter: balanceAfter
    };
  } catch (error) {
    logError('❌ Error redeeming tokens:', error);
    throw error;
  }
};

module.exports = {
  getTokenPercentage,
  awardTokens,
  updateTierProgress,
  redeemTokens
};

