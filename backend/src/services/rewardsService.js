const { getPool } = require('../config/db');
const tierService = require('./tierService');
const { log, logError } = require('../../utils/logger');

const pool = getPool();

/**
 * Get complete rewards summary for a user
 */
async function getUserRewardsSummary(userId) {
  try {
    // Get user's current balances and tier info
    const userResult = await pool.query(
      `SELECT 
        u.id,
        u.available_tokens,
        u.total_tokens_earned,
        u.total_tokens_spent,
        u.current_tier_id,
        t.name as tier_name,
        t.token_earning_percentage,
        t.level as tier_level
      FROM users u
      LEFT JOIN tiers t ON u.current_tier_id = t.id
      WHERE u.id = $1`,
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      throw new Error('User not found');
    }
    
    const user = userResult.rows[0];
    
    // Get loyalty points balance
    const loyaltyResult = await pool.query(
      `SELECT balance_after 
       FROM loyalty_activity 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [userId]
    );
    const loyaltyBalance = parseFloat(loyaltyResult.rows[0]?.balance_after || 0);
    
    // Get total loyalty points earned/redeemed (transaction_type may not exist in all schemas)
    let loyaltyStats = { total_earned: 0, total_redeemed: 0 };
    try {
      const loyaltyStatsResult = await pool.query(
        `SELECT 
          COALESCE(SUM(points_earned), 0) as total_earned,
          COALESCE(SUM(CASE WHEN transaction_type = 'redeemed' THEN points_earned ELSE 0 END), 0) as total_redeemed
         FROM loyalty_points
         WHERE user_id = $1`,
        [userId]
      );
      if (loyaltyStatsResult.rows[0]) loyaltyStats = loyaltyStatsResult.rows[0];
    } catch (_) {
      try {
        const simple = await pool.query(
          `SELECT COALESCE(SUM(points_earned), 0) as total_earned FROM loyalty_points WHERE user_id = $1`,
          [userId]
        );
        if (simple.rows[0]) loyaltyStats.total_earned = parseFloat(simple.rows[0].total_earned || 0);
      } catch (__) {}
    }
    
    // Get recent EZT transactions (last 10)
    const eztTransactions = await pool.query(
      `SELECT 
        id,
        transaction_id,
        amount,
        ledger_type,
        balance_before,
        balance_after,
        description,
        created_at
       FROM token_ledger
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [userId]
    );
    
    // Get recent loyalty transactions (last 10); transaction_type may not exist in loyalty_activity
    const loyaltyTransactions = await pool.query(
      `SELECT 
        id,
        points_earned,
        points_spent,
        balance_after,
        description,
        created_at
       FROM loyalty_activity
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [userId]
    );
    
    // Get tier history (column may be upgraded_at or changed_at depending on migration)
    let tierHistory = { rows: [] };
    try {
      tierHistory = await pool.query(
        `SELECT id, from_tier_name, to_tier_name, tier_level_change, annual_spend_at_change, reason,
                COALESCE(upgraded_at, changed_at) AS upgraded_at
         FROM user_tier_history WHERE user_id = $1 ORDER BY COALESCE(upgraded_at, changed_at) DESC`,
        [userId]
      );
    } catch (e) {
      if (e.code === '42703') {
        tierHistory = await pool.query(
          `SELECT id, from_tier_name, to_tier_name, tier_level_change, annual_spend_at_change, reason,
                  changed_at AS upgraded_at
           FROM user_tier_history WHERE user_id = $1 ORDER BY changed_at DESC`,
          [userId]
        );
      } else throw e;
    }
    
    // Get tier progress info
    const tierInfo = await tierService.getUserTier(userId);
    
    // EZ Club (cross-network tier) - optional columns
    let ezClub = { member: false, networkCheckIns: 0, qualifiedAt: null };
    try {
      const ezResult = await pool.query(
        'SELECT ez_club_member, ez_club_network_check_ins, ez_club_qualified_at FROM users WHERE id = $1',
        [userId]
      );
      if (ezResult.rows[0]) {
        const r = ezResult.rows[0];
        ezClub = {
          member: !!r.ez_club_member,
          networkCheckIns: parseInt(r.ez_club_network_check_ins || 0, 10),
          qualifiedAt: r.ez_club_qualified_at || null,
        };
      }
    } catch (_) {
      // Columns may not exist before migration
    }
    
    return {
      ezClub,
      ezt: {
        balance: parseFloat(user.available_tokens || 0),
        totalEarned: parseFloat(user.total_tokens_earned || 0),
        totalSpent: parseFloat(user.total_tokens_spent || 0),
        recentTransactions: eztTransactions.rows.map(tx => ({
          id: tx.id,
          type: tx.ledger_type,
          amount: parseFloat(tx.amount),
          balanceBefore: parseFloat(tx.balance_before || 0),
          balanceAfter: parseFloat(tx.balance_after || 0),
          description: tx.description,
          createdAt: tx.created_at
        }))
      },
      loyaltyPoints: {
        balance: loyaltyBalance,
        totalEarned: parseFloat(loyaltyStats.total_earned || 0),
        totalRedeemed: parseFloat(loyaltyStats.total_redeemed || 0),
        recentTransactions: loyaltyTransactions.rows.map(tx => ({
          id: tx.id,
          type: (tx.points_earned > 0 ? 'earned' : 'redeemed'),
          pointsEarned: parseInt(tx.points_earned || 0),
          pointsSpent: parseInt(tx.points_spent || 0),
          balanceAfter: parseInt(tx.balance_after || 0),
          description: tx.description,
          createdAt: tx.created_at
        }))
      },
      tier: {
        current: user.tier_name || 'Ather',
        level: user.tier_level || 1,
        earnRate: parseFloat(user.token_earning_percentage || 1.0),
        progress: tierInfo.progress,
        spending: tierInfo.spending,
        history: tierHistory.rows.map(h => ({
          id: h.id,
          fromTier: h.from_tier_name,
          toTier: h.to_tier_name,
          levelChange: h.tier_level_change,
          spendAtUpgrade: parseFloat(h.annual_spend_at_change || 0),
          reason: h.reason,
          upgradedAt: h.upgraded_at
        }))
      }
    };
  } catch (error) {
    logError('Error getting user rewards summary:', error);
    throw error;
  }
}

/**
 * Get EZT transaction history with pagination
 */
async function getEZTTransactions(userId, { limit = 20, offset = 0 } = {}) {
  try {
    const transactionsResult = await pool.query(
      `SELECT 
        id,
        transaction_id,
        amount,
        ledger_type,
        balance_before,
        balance_after,
        description,
        created_at
       FROM token_ledger
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    
    const countResult = await pool.query(
      'SELECT COUNT(*) as total FROM token_ledger WHERE user_id = $1',
      [userId]
    );
    
    return {
      transactions: transactionsResult.rows.map(tx => ({
        id: tx.id,
        type: tx.ledger_type,
        amount: parseFloat(tx.amount),
        balanceBefore: parseFloat(tx.balance_before || 0),
        balanceAfter: parseFloat(tx.balance_after || 0),
        description: tx.description,
        createdAt: tx.created_at
      })),
      total: parseInt(countResult.rows[0].total)
    };
  } catch (error) {
    logError('Error getting EZT transactions:', error);
    throw error;
  }
}

/**
 * Get loyalty points transaction history with pagination
 */
async function getLoyaltyTransactions(userId, { limit = 20, offset = 0 } = {}) {
  try {
    const transactionsResult = await pool.query(
      `SELECT 
        id,
        points_earned,
        points_spent,
        balance_after,
        description,
        created_at
       FROM loyalty_activity
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    
    const countResult = await pool.query(
      'SELECT COUNT(*) as total FROM loyalty_activity WHERE user_id = $1',
      [userId]
    );
    
    return {
      transactions: transactionsResult.rows.map(tx => ({
        id: tx.id,
        type: (tx.points_earned > 0 ? 'earned' : 'redeemed'),
        pointsEarned: parseInt(tx.points_earned || 0),
        pointsSpent: parseInt(tx.points_spent || 0),
        balanceAfter: parseInt(tx.balance_after || 0),
        description: tx.description,
        createdAt: tx.created_at
      })),
      total: parseInt(countResult.rows[0].total)
    };
  } catch (error) {
    logError('Error getting loyalty transactions:', error);
    throw error;
  }
}

/**
 * Get tier upgrade history
 */
async function getTierHistory(userId) {
  try {
    const result = await pool.query(
      `SELECT 
        id,
        from_tier_name,
        to_tier_name,
        tier_level_change,
        annual_spend_at_change,
        reason,
        COALESCE(upgraded_at, changed_at) AS upgraded_at
       FROM user_tier_history
       WHERE user_id = $1
       ORDER BY COALESCE(upgraded_at, changed_at) DESC`,
      [userId]
    );
    
    return result.rows.map(h => ({
      id: h.id,
      fromTier: h.from_tier_name,
      toTier: h.to_tier_name,
      levelChange: h.tier_level_change,
      spendAtUpgrade: parseFloat(h.annual_spend_at_change || 0),
      reason: h.reason,
      upgradedAt: h.upgraded_at
    }));
  } catch (error) {
    logError('Error getting tier history:', error);
    throw error;
  }
}

/**
 * Manually credit EZT or loyalty points (admin only)
 */
async function manualCredit(userId, type, amount, reason, adminUserId) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Verify user exists
    const userResult = await client.query('SELECT id, available_tokens FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      throw new Error('User not found');
    }
    
    const user = userResult.rows[0];
    
    if (type === 'ezt') {
      const eztAmount = parseFloat(amount);
      const balanceBefore = parseFloat(user.available_tokens || 0);
      const balanceAfter = balanceBefore + eztAmount;
      
      // Update user balance
      await client.query(
        `UPDATE users 
         SET available_tokens = available_tokens + $1,
             total_tokens_earned = total_tokens_earned + $1
         WHERE id = $2`,
        [eztAmount, userId]
      );
      
      // Record in token ledger
      await client.query(
        `INSERT INTO token_ledger (user_id, amount, ledger_type, balance_before, balance_after, description)
         VALUES ($1, $2, 'bonus', $3, $4, $5)`,
        [userId, eztAmount, balanceBefore, balanceAfter, reason]
      );
      
      await client.query('COMMIT');
      
      log(`Admin ${adminUserId} manually credited ${eztAmount} EZT to user ${userId}`);
      
      return {
        type: 'ezt',
        amount: eztAmount,
        balanceBefore,
        balanceAfter,
        reason
      };
      
    } else if (type === 'loyalty') {
      const pointsAmount = parseInt(amount);
      
      // Get current loyalty balance
      const currentBalanceResult = await client.query(
        `SELECT balance_after 
         FROM loyalty_activity 
         WHERE user_id = $1 
         ORDER BY created_at DESC 
         LIMIT 1`,
        [userId]
      );
      const balanceBefore = parseInt(currentBalanceResult.rows[0]?.balance_after || 0);
      const balanceAfter = balanceBefore + pointsAmount;
      
      // Record in loyalty_activity
      await client.query(
        `INSERT INTO loyalty_activity (
          user_id, source, description, points_earned, points_spent,
          balance_after, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          userId,
          'admin_adjustment',
          reason,
          pointsAmount,
          0,
          balanceAfter,
          JSON.stringify({ admin_id: adminUserId })
        ]
      );
      
      // Record in loyalty_points
      await client.query(
        `INSERT INTO loyalty_points (user_id, points_earned, points_balance, transaction_type, description)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, pointsAmount, balanceAfter, 'adjusted', reason]
      );
      
      await client.query('COMMIT');
      
      log(`Admin ${adminUserId} manually credited ${pointsAmount} loyalty points to user ${userId}`);
      
      return {
        type: 'loyalty',
        amount: pointsAmount,
        balanceBefore,
        balanceAfter,
        reason
      };
    }
    
    throw new Error('Invalid type');
  } catch (error) {
    await client.query('ROLLBACK');
    logError('Error manually crediting rewards:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  getUserRewardsSummary,
  getEZTTransactions,
  getLoyaltyTransactions,
  getTierHistory,
  manualCredit
};

