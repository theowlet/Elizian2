const { getPool } = require('../src/config/db');
const { log, logError } = require('../utils/logger');

async function grantSignupBonus(userId, bonusTokens = 100) {
  const pool = getPool();
  try {
    const bonus = parseFloat(bonusTokens);
    if (!bonus || bonus <= 0) {
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const balanceResult = await client.query(
        'SELECT available_tokens FROM users WHERE id = $1 FOR UPDATE',
        [userId]
      );

      if (balanceResult.rowCount === 0) {
        await client.query('ROLLBACK');
        logError('⚠️ Signup bonus skipped, user not found:', userId);
        client.release();
        return;
      }

      const balanceBefore = parseFloat(balanceResult.rows[0].available_tokens ?? 0);
      const balanceAfter = balanceBefore + bonus;

      await client.query(
        `UPDATE users 
           SET available_tokens = COALESCE(available_tokens, 0) + $1,
               total_tokens_earned = COALESCE(total_tokens_earned, 0) + $1,
               signup_bonus_credited = true
         WHERE id = $2`,
        [bonus, userId]
      );

      await client.query(
        `INSERT INTO token_ledger (user_id, transaction_id, amount, ledger_type, balance_before, balance_after, description)
         VALUES ($1, NULL, $2, 'airdrop', $3, $4, $5)`,
        [
          userId,
          bonus,
          balanceBefore,
          balanceAfter,
          'Signup bonus credited (will sync with blockchain airdrop)'
        ]
      );

      await client.query('COMMIT');

      log(`🎁 Credited signup bonus of ${bonus.toFixed(2)} EZT to user ${userId}`);
    } catch (txError) {
      await client.query('ROLLBACK');
      throw txError;
    } finally {
      client.release();
    }
  } catch (error) {
    logError('❌ Signup bonus credit error:', error);
  }
}

module.exports = {
  grantSignupBonus
};

