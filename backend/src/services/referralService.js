const { getPool } = require('../config/db');
const { AppError } = require('../../utils/response');
const { log, logError } = require('../../utils/logger');
const tokenService = require('./tokenService');
const notificationService = require('./notificationService');
const crypto = require('crypto');

const pool = getPool();

/**
 * Referral Service
 * Handles referral code generation, tracking, and rewards
 */
class ReferralService {
  /**
   * Generate unique referral code
   */
  generateReferralCode(userId, firstName) {
    const prefix = firstName?.substring(0, 3).toUpperCase() || 'EZT';
    const random = crypto.randomBytes(3).toString('hex').toUpperCase();
    const checksum = userId.substring(0, 4).toUpperCase();
    return `${prefix}${random}${checksum}`;
  }

  /**
   * Create or get user's referral code
   */
  async getOrCreateReferralCode(userId) {
    try {
      // Check if user already has an active referral code
      const existingResult = await pool.query(
        `SELECT referral_code FROM referrals 
         WHERE referrer_id = $1 
         AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
         ORDER BY created_at DESC 
         LIMIT 1`,
        [userId]
      );

      if (existingResult.rows.length > 0) {
        return existingResult.rows[0].referral_code;
      }

      // Get user info
      const userResult = await pool.query(
        'SELECT first_name FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.rows.length === 0) {
        throw new AppError(404, 'User not found');
      }

      // Generate new code
      const firstName = userResult.rows[0].first_name;
      let referralCode;
      let isUnique = false;
      let attempts = 0;

      // Ensure code is unique
      while (!isUnique && attempts < 10) {
        referralCode = this.generateReferralCode(userId, firstName);
        const checkResult = await pool.query(
          'SELECT 1 FROM referrals WHERE referral_code = $1',
          [referralCode]
        );
        isUnique = checkResult.rows.length === 0;
        attempts++;
      }

      if (!isUnique) {
        throw new AppError(500, 'Failed to generate unique referral code');
      }

      // Get system settings for rewards
      const settingsResult = await pool.query(
        `SELECT setting_key, setting_value FROM system_settings 
         WHERE setting_key IN ('referral_ezt_reward', 'referral_discount')`
      );

      const settings = {};
      settingsResult.rows.forEach(row => {
        settings[row.setting_key] = parseFloat(row.setting_value);
      });

      const eztReward = settings.referral_ezt_reward || 100;
      const discountAmount = settings.referral_discount || 500;

      // Create referral entry
      await pool.query(
        `INSERT INTO referrals (
          referrer_id, referral_code, referrer_ezt_reward, referee_discount_amount
        ) VALUES ($1, $2, $3, $4)`,
        [userId, referralCode, eztReward, discountAmount]
      );

      log(`✅ Referral code created: ${referralCode} for user ${userId}`);
      return referralCode;
    } catch (error) {
      if (error instanceof AppError) throw error;
      logError('Error creating referral code:', error);
      throw new AppError(500, 'Failed to create referral code');
    }
  }

  /**
   * Validate and apply referral code during signup
   */
  async applyReferralCode(referralCode, newUserId) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Find referral
      const referralResult = await client.query(
        `SELECT * FROM referrals 
         WHERE referral_code = $1 
         AND status = 'pending'
         AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
         LIMIT 1`,
        [referralCode]
      );

      if (referralResult.rows.length === 0) {
        throw new AppError(404, 'Invalid or expired referral code');
      }

      const referral = referralResult.rows[0];

      // Prevent self-referral
      if (referral.referrer_id === newUserId) {
        throw new AppError(400, 'Cannot use your own referral code');
      }

      // Update referral with referee
      await client.query(
        `UPDATE referrals 
         SET referee_id = $1
         WHERE id = $2`,
        [newUserId, referral.id]
      );

      await client.query('COMMIT');

      log(`✅ Referral code ${referralCode} applied to new user ${newUserId}`);

      return {
        referralId: referral.id,
        referrerId: referral.referrer_id,
        discount: referral.referee_discount_amount,
        message: `You've got ₹${referral.referee_discount_amount} off your first booking!`
      };
    } catch (error) {
      await client.query('ROLLBACK');
      if (error instanceof AppError) throw error;
      logError('Error applying referral code:', error);
      throw new AppError(500, 'Failed to apply referral code');
    } finally {
      client.release();
    }
  }

  /**
   * Complete referral when referee makes first booking
   */
  async completeReferral(refereeId, bookingId) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Find pending referral for this referee
      const referralResult = await client.query(
        `SELECT * FROM referrals 
         WHERE referee_id = $1 
         AND status = 'pending'
         LIMIT 1`,
        [refereeId]
      );

      if (referralResult.rows.length === 0) {
        // No referral to complete
        await client.query('COMMIT');
        return null;
      }

      const referral = referralResult.rows[0];

      // Update referral status
      await client.query(
        `UPDATE referrals 
         SET status = 'completed',
             completed_at = CURRENT_TIMESTAMP,
             first_booking_id = $1
         WHERE id = $2`,
        [bookingId, referral.id]
      );

      // Award EZT to referrer
      if (referral.referrer_ezt_reward && referral.referrer_ezt_reward > 0) {
        await tokenService.awardTokens(
          referral.referrer_id,
          parseFloat(referral.referrer_ezt_reward),
          {
            source: 'referral_completed',
            referralId: referral.id,
            refereeId: refereeId,
            bookingId: bookingId
          },
          client
        );
      }

      await client.query('COMMIT');

      log(`✅ Referral completed: ${referral.referral_code}, rewarded ${referral.referrer_ezt_reward} EZT to referrer ${referral.referrer_id}`);

      // Send notification to referrer (async, non-blocking)
      notificationService.sendReferralCompleted(referral.referrer_id, {
        referralId: referral.id,
        reward: referral.referrer_ezt_reward
      }).catch(error => {
        logError('Failed to send referral notification:', error);
      });

      return {
        referralId: referral.id,
        referrerId: referral.referrer_id,
        reward: referral.referrer_ezt_reward
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logError('Error completing referral:', error);
      throw new AppError(500, 'Failed to complete referral');
    } finally {
      client.release();
    }
  }

  /**
   * Get user's referral statistics
   */
  async getUserReferralStats(userId) {
    try {
      const result = await pool.query(
        `SELECT 
          COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
          COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
          COUNT(*) FILTER (WHERE status = 'expired') as expired_count,
          SUM(CASE WHEN status = 'completed' THEN referrer_ezt_reward ELSE 0 END) as total_ezt_earned
         FROM referrals
         WHERE referrer_id = $1`,
        [userId]
      );

      const stats = result.rows[0];

      // Get referral code
      const codeResult = await pool.query(
        `SELECT referral_code FROM referrals 
         WHERE referrer_id = $1 
         ORDER BY created_at DESC 
         LIMIT 1`,
        [userId]
      );

      return {
        referralCode: codeResult.rows[0]?.referral_code || null,
        pending: parseInt(stats.pending_count || 0),
        completed: parseInt(stats.completed_count || 0),
        expired: parseInt(stats.expired_count || 0),
        totalEztEarned: parseFloat(stats.total_ezt_earned || 0)
      };
    } catch (error) {
      logError('Error fetching referral stats:', error);
      throw new AppError(500, 'Failed to fetch referral stats');
    }
  }

  /**
   * Get detailed referral history
   */
  async getReferralHistory(userId, limit = 20, offset = 0) {
    try {
      const result = await pool.query(
        `SELECT 
          r.id, r.referral_code, r.status, r.referrer_ezt_reward,
          r.referee_discount_amount, r.created_at, r.completed_at,
          u.first_name as referee_first_name,
          u.last_name as referee_last_name
         FROM referrals r
         LEFT JOIN users u ON r.referee_id = u.id
         WHERE r.referrer_id = $1
         ORDER BY r.created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      );

      return result.rows;
    } catch (error) {
      logError('Error fetching referral history:', error);
      throw new AppError(500, 'Failed to fetch referral history');
    }
  }

  /**
   * Get referral leaderboard
   */
  async getLeaderboard(limit = 10) {
    try {
      const result = await pool.query(
        `SELECT 
          u.id, u.first_name, u.last_name, u.profile_photo_url,
          COUNT(r.id) FILTER (WHERE r.status = 'completed') as successful_referrals,
          SUM(r.referrer_ezt_reward) FILTER (WHERE r.status = 'completed') as total_ezt_earned
         FROM users u
         INNER JOIN referrals r ON u.id = r.referrer_id
         GROUP BY u.id, u.first_name, u.last_name, u.profile_photo_url
         HAVING COUNT(r.id) FILTER (WHERE r.status = 'completed') > 0
         ORDER BY successful_referrals DESC, total_ezt_earned DESC
         LIMIT $1`,
        [limit]
      );

      return result.rows;
    } catch (error) {
      logError('Error fetching referral leaderboard:', error);
      throw new AppError(500, 'Failed to fetch leaderboard');
    }
  }

  /**
   * Expire old pending referrals (cron job)
   */
  async expireOldReferrals(daysOld = 90) {
    try {
      const result = await pool.query(
        `UPDATE referrals 
         SET status = 'expired'
         WHERE status = 'pending'
         AND created_at < CURRENT_TIMESTAMP - INTERVAL '${daysOld} days'
         RETURNING id`,
        []
      );

      log(`✅ Expired ${result.rowCount} old referrals`);
      return { expiredCount: result.rowCount };
    } catch (error) {
      logError('Error expiring referrals:', error);
      throw new AppError(500, 'Failed to expire referrals');
    }
  }
}

module.exports = new ReferralService();

