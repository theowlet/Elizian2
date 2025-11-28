const { getPool } = require('../config/db');
const { AppError } = require('../../utils/response');
const { log, logError } = require('../../utils/logger');
const tokenService = require('./tokenService');
const notificationService = require('./notificationService');

const pool = getPool();

/**
 * Achievement Service
 * Handles achievement tracking, unlocking, and rewards
 */
class AchievementService {
  /**
   * Get all available achievements
   */
  async getAllAchievements(includeSecret = false) {
    try {
      const query = includeSecret
        ? 'SELECT * FROM achievements WHERE is_active = true ORDER BY ezt_reward ASC'
        : 'SELECT * FROM achievements WHERE is_active = true AND is_secret = false ORDER BY ezt_reward ASC';

      const result = await pool.query(query);
      return result.rows;
    } catch (error) {
      logError('Error fetching achievements:', error);
      throw new AppError(500, 'Failed to fetch achievements');
    }
  }

  /**
   * Get user's achievements (unlocked + progress)
   */
  async getUserAchievements(userId) {
    try {
      // Get unlocked achievements
      const unlockedResult = await pool.query(
        `SELECT 
          a.id, a.achievement_code, a.title, a.description,
          a.icon, a.badge_image_url, a.achievement_type,
          a.ezt_reward, a.loyalty_points,
          ua.unlocked_at, ua.progress
         FROM achievements a
         INNER JOIN user_achievements ua ON a.id = ua.achievement_id
         WHERE ua.user_id = $1
         ORDER BY ua.unlocked_at DESC`,
        [userId]
      );

      // Get all available achievements
      const allAchievements = await this.getAllAchievements(false);

      // Get user stats for progress calculation
      const stats = await this.getUserStats(userId);

      // Calculate progress for locked achievements
      const achievements = allAchievements.map(achievement => {
        const unlocked = unlockedResult.rows.find(ua => ua.id === achievement.id);
        
        if (unlocked) {
          return {
            ...unlocked,
            unlocked: true,
            progress: 100
          };
        }

        // Calculate progress for locked achievements
        const progress = this.calculateProgress(achievement, stats);
        return {
          ...achievement,
          unlocked: false,
          progress,
          unlocked_at: null
        };
      });

      return {
        total: achievements.length,
        unlocked: unlockedResult.rows.length,
        locked: achievements.length - unlockedResult.rows.length,
        achievements
      };
    } catch (error) {
      logError('Error fetching user achievements:', error);
      throw new AppError(500, 'Failed to fetch user achievements');
    }
  }

  /**
   * Get user statistics for achievement progress
   */
  async getUserStats(userId) {
    try {
      const [bookingsResult, reviewsResult, referralsResult, tierResult, spendingResult] = await Promise.all([
        // Bookings count
        pool.query(
          'SELECT COUNT(*) as count FROM bookings WHERE user_id = $1 AND status = $2',
          [userId, 'completed']
        ),
        // Reviews count (assuming reviews table exists)
        pool.query(
          'SELECT COUNT(*) as count FROM reviews WHERE user_id = $1',
          [userId]
        ).catch(() => ({ rows: [{ count: 0 }] })),
        // Referrals count
        pool.query(
          'SELECT COUNT(*) as count FROM referrals WHERE referrer_id = $1 AND status = $2',
          [userId, 'completed']
        ).catch(() => ({ rows: [{ count: 0 }] })),
        // Current tier
        pool.query(
          'SELECT tier FROM users WHERE id = $1',
          [userId]
        ),
        // Total spending
        pool.query(
          'SELECT total_spend FROM users WHERE id = $1',
          [userId]
        )
      ]);

      return {
        bookings: parseInt(bookingsResult.rows[0].count),
        reviews: parseInt(reviewsResult.rows[0].count),
        referrals: parseInt(referralsResult.rows[0].count),
        tier: tierResult.rows[0]?.tier || 'Aether',
        totalSpend: parseFloat(spendingResult.rows[0]?.total_spend || 0)
      };
    } catch (error) {
      logError('Error fetching user stats:', error);
      return {
        bookings: 0,
        reviews: 0,
        referrals: 0,
        tier: 'Aether',
        totalSpend: 0
      };
    }
  }

  /**
   * Calculate progress percentage for an achievement
   */
  calculateProgress(achievement, stats) {
    const criteria = achievement.criteria;

    switch (achievement.achievement_type) {
      case 'booking_count':
        const required = criteria.bookings || 0;
        return Math.min(100, Math.round((stats.bookings / required) * 100));

      case 'spending_threshold':
        const amount = criteria.amount || 0;
        return Math.min(100, Math.round((stats.totalSpend / amount) * 100));

      case 'tier_reached':
        const tierOrder = { Aether: 1, Nova: 2, Luminar: 3, Valiant: 4, Echelon: 5 };
        const requiredTier = tierOrder[criteria.tier] || 1;
        const currentTier = tierOrder[stats.tier] || 1;
        return currentTier >= requiredTier ? 100 : Math.round((currentTier / requiredTier) * 100);

      case 'review_count':
        const reviewsRequired = criteria.reviews || 0;
        return Math.min(100, Math.round((stats.reviews / reviewsRequired) * 100));

      case 'referral_count':
        const referralsRequired = criteria.referrals || 0;
        return Math.min(100, Math.round((stats.referrals / referralsRequired) * 100));

      case 'streak':
      case 'special':
        return 0; // These require custom logic

      default:
        return 0;
    }
  }

  /**
   * Check and unlock achievements for a user
   */
  async checkAndUnlock(userId, triggerType = 'manual') {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Get user stats
      const stats = await this.getUserStats(userId);

      // Get all active achievements not yet unlocked
      const result = await client.query(
        `SELECT a.* FROM achievements a
         WHERE a.is_active = true
         AND NOT EXISTS (
           SELECT 1 FROM user_achievements ua 
           WHERE ua.user_id = $1 AND ua.achievement_id = a.id
         )`,
        [userId]
      );

      const newlyUnlocked = [];

      for (const achievement of result.rows) {
        const progress = this.calculateProgress(achievement, stats);
        
        if (progress >= 100) {
          // Unlock achievement
          await client.query(
            `INSERT INTO user_achievements (user_id, achievement_id, progress)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id, achievement_id) DO NOTHING`,
            [userId, achievement.id, JSON.stringify({ trigger: triggerType, stats })]
          );

          // Award EZT tokens
          if (achievement.ezt_reward && achievement.ezt_reward > 0) {
            await tokenService.awardTokens(
              userId,
              parseFloat(achievement.ezt_reward),
              {
                source: 'achievement_unlocked',
                achievementId: achievement.id,
                achievementCode: achievement.achievement_code
              },
              client
            );
          }

          // TODO: Award loyalty points if system exists

          newlyUnlocked.push({
            id: achievement.id,
            code: achievement.achievement_code,
            title: achievement.title,
            description: achievement.description,
            icon: achievement.icon,
            eztReward: achievement.ezt_reward,
            loyaltyPoints: achievement.loyalty_points
          });

          log(`🏆 Achievement unlocked: ${achievement.title} for user ${userId}`);
        }
      }

      await client.query('COMMIT');

      // Send notifications (async, non-blocking)
      for (const achievement of newlyUnlocked) {
        notificationService.sendAchievementUnlocked(userId, {
          achievementId: achievement.id,
          title: achievement.title,
          description: achievement.description,
          eztReward: achievement.eztReward
        }).catch(error => {
          logError('Failed to send achievement notification:', error);
        });
      }

      return {
        newlyUnlocked,
        count: newlyUnlocked.length
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logError('Error checking achievements:', error);
      throw new AppError(500, 'Failed to check achievements');
    } finally {
      client.release();
    }
  }

  /**
   * Manually unlock an achievement (admin only)
   */
  async unlockManually(userId, achievementId, adminId) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Get achievement details
      const achievementResult = await client.query(
        'SELECT * FROM achievements WHERE id = $1',
        [achievementId]
      );

      if (achievementResult.rows.length === 0) {
        throw new AppError(404, 'Achievement not found');
      }

      const achievement = achievementResult.rows[0];

      // Check if already unlocked
      const existingResult = await client.query(
        'SELECT 1 FROM user_achievements WHERE user_id = $1 AND achievement_id = $2',
        [userId, achievementId]
      );

      if (existingResult.rows.length > 0) {
        throw new AppError(400, 'Achievement already unlocked');
      }

      // Unlock achievement
      await client.query(
        `INSERT INTO user_achievements (user_id, achievement_id, progress)
         VALUES ($1, $2, $3)`,
        [userId, achievementId, JSON.stringify({ manual: true, unlockedBy: adminId })]
      );

      // Award rewards
      if (achievement.ezt_reward && achievement.ezt_reward > 0) {
        await tokenService.awardTokens(
          userId,
          parseFloat(achievement.ezt_reward),
          {
            source: 'achievement_manual_unlock',
            achievementId: achievement.id,
            unlockedBy: adminId
          },
          client
        );
      }

      await client.query('COMMIT');

      log(`🏆 Achievement manually unlocked: ${achievement.title} for user ${userId} by admin ${adminId}`);

      // Send notification
      notificationService.sendAchievementUnlocked(userId, {
        achievementId: achievement.id,
        title: achievement.title,
        description: achievement.description,
        eztReward: achievement.ezt_reward
      }).catch(error => {
        logError('Failed to send achievement notification:', error);
      });

      return {
        achievement: achievement.title,
        eztRewarded: achievement.ezt_reward
      };
    } catch (error) {
      await client.query('ROLLBACK');
      if (error instanceof AppError) throw error;
      logError('Error unlocking achievement manually:', error);
      throw new AppError(500, 'Failed to unlock achievement');
    } finally {
      client.release();
    }
  }

  /**
   * Create a new achievement (admin only)
   */
  async createAchievement(achievementData) {
    try {
      const {
        code, title, description, icon, badgeImageUrl,
        achievementType, criteria, eztReward, loyaltyPoints,
        isSecret = false
      } = achievementData;

      const result = await pool.query(
        `INSERT INTO achievements (
          achievement_code, title, description, icon, badge_image_url,
          achievement_type, criteria, ezt_reward, loyalty_points, is_secret
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`,
        [
          code, title, description, icon, badgeImageUrl,
          achievementType, JSON.stringify(criteria), eztReward, loyaltyPoints, isSecret
        ]
      );

      log(`✅ Achievement created: ${title}`);
      return result.rows[0];
    } catch (error) {
      if (error.constraint === 'achievements_achievement_code_key') {
        throw new AppError(400, 'Achievement code already exists');
      }
      logError('Error creating achievement:', error);
      throw new AppError(500, 'Failed to create achievement');
    }
  }

  /**
   * Get achievement leaderboard
   */
  async getLeaderboard(limit = 10) {
    try {
      const result = await pool.query(
        `SELECT 
          u.id, u.first_name, u.last_name, u.profile_photo_url,
          COUNT(ua.achievement_id) as achievement_count,
          SUM(a.ezt_reward) as total_ezt_earned
         FROM users u
         INNER JOIN user_achievements ua ON u.id = ua.user_id
         INNER JOIN achievements a ON ua.achievement_id = a.id
         GROUP BY u.id, u.first_name, u.last_name, u.profile_photo_url
         ORDER BY achievement_count DESC, total_ezt_earned DESC
         LIMIT $1`,
        [limit]
      );

      return result.rows;
    } catch (error) {
      logError('Error fetching achievement leaderboard:', error);
      throw new AppError(500, 'Failed to fetch leaderboard');
    }
  }
}

module.exports = new AchievementService();

