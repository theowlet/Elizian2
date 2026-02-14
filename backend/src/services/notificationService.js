const { getPool } = require('../config/db');
const { AppError } = require('../../utils/response');
const { log, logError } = require('../../utils/logger');
const pushService = require('./pushNotificationService');

const pool = getPool();

/**
 * Notification Service
 * Handles in-app notifications, push notifications, email, and SMS
 */
class NotificationService {
  /**
   * Create a new notification
   */
  async create(notificationData) {
    try {
      const {
        userId,
        type,
        title,
        message,
        actionUrl = null,
        actionLabel = null,
        priority = 'normal',
        metadata = {},
        sentViaEmail = false,
        sentViaSms = false,
        sentViaPush = false,
        sentViaInApp = true
      } = notificationData;

      const result = await pool.query(
        `INSERT INTO notifications (
          user_id, notification_type, title, message,
          action_url, action_label, priority, metadata,
          sent_via_email, sent_via_sms, sent_via_push, sent_via_in_app
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *`,
        [
          userId, type, title, message,
          actionUrl, actionLabel, priority, JSON.stringify(metadata),
          sentViaEmail, sentViaSms, sentViaPush, sentViaInApp
        ]
      );

      log(`✅ Notification created for user ${userId}: ${type}`);

      // Send push notification asynchronously (fire-and-forget)
      if (pushService.isPushConfigured()) {
        pushService.sendToUser(userId, {
          title: title || 'Elizian',
          body: message || '',
          url: actionUrl || '/notifications',
          tag: type || 'general',
        }).catch(err => logError('Push send error (non-blocking):', err));
      }

      return result.rows[0];
    } catch (error) {
      logError('Error creating notification:', error);
      throw new AppError(500, 'Failed to create notification');
    }
  }

  /**
   * Create multiple notifications (bulk)
   */
  async createBulk(userIds, notificationData) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      const {
        type, title, message, actionUrl = null,
        actionLabel = null, priority = 'normal', metadata = {}
      } = notificationData;

      const insertValues = userIds.map((userId, index) => {
        const baseIndex = index * 8;
        return `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, 
                 $${baseIndex + 5}, $${baseIndex + 6}, $${baseIndex + 7}, $${baseIndex + 8})`;
      }).join(',');

      const params = userIds.flatMap(userId => [
        userId, type, title, message,
        actionUrl, actionLabel, priority, JSON.stringify(metadata)
      ]);

      const result = await client.query(
        `INSERT INTO notifications (
          user_id, notification_type, title, message,
          action_url, action_label, priority, metadata
        ) VALUES ${insertValues}
        RETURNING *`,
        params
      );

      await client.query('COMMIT');
      log(`✅ Bulk notifications created for ${userIds.length} users`);
      return result.rows;
    } catch (error) {
      await client.query('ROLLBACK');
      logError('Error creating bulk notifications:', error);
      throw new AppError(500, 'Failed to create bulk notifications');
    } finally {
      client.release();
    }
  }

  /**
   * Get user notifications
   */
  async getUserNotifications(userId, options = {}) {
    try {
      const {
        limit = 20,
        offset = 0,
        unreadOnly = false,
        type = null
      } = options;

      let query = `
        SELECT * FROM notifications
        WHERE user_id = $1
      `;
      const params = [userId];
      let paramIndex = 2;

      if (unreadOnly) {
        query += ` AND is_read = false`;
      }

      if (type) {
        query += ` AND notification_type = $${paramIndex}`;
        params.push(type);
        paramIndex++;
      }

      query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit, offset);

      const result = await pool.query(query, params);

      // Get unread count
      const countResult = await pool.query(
        'SELECT COUNT(*) as unread_count FROM notifications WHERE user_id = $1 AND is_read = false',
        [userId]
      );

      return {
        notifications: result.rows,
        unreadCount: parseInt(countResult.rows[0].unread_count),
        total: result.rowCount
      };
    } catch (error) {
      logError('Error fetching notifications:', error);
      throw new AppError(500, 'Failed to fetch notifications');
    }
  }

  /**
   * Mark notification(s) as read
   */
  async markAsRead(notificationIds, userId) {
    try {
      const result = await pool.query(
        `UPDATE notifications 
         SET is_read = true, read_at = CURRENT_TIMESTAMP
         WHERE id = ANY($1) AND user_id = $2
         RETURNING *`,
        [notificationIds, userId]
      );

      log(`✅ Marked ${result.rowCount} notifications as read for user ${userId}`);
      return result.rows;
    } catch (error) {
      logError('Error marking notifications as read:', error);
      throw new AppError(500, 'Failed to mark notifications as read');
    }
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId) {
    try {
      const result = await pool.query(
        `UPDATE notifications 
         SET is_read = true, read_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND is_read = false
         RETURNING id`,
        [userId]
      );

      log(`✅ Marked all ${result.rowCount} notifications as read for user ${userId}`);
      return { markedCount: result.rowCount };
    } catch (error) {
      logError('Error marking all notifications as read:', error);
      throw new AppError(500, 'Failed to mark all notifications as read');
    }
  }

  /**
   * Delete notification
   */
  async deleteNotification(notificationId, userId) {
    try {
      const result = await pool.query(
        'DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id',
        [notificationId, userId]
      );

      if (result.rowCount === 0) {
        throw new AppError(404, 'Notification not found');
      }

      log(`✅ Deleted notification ${notificationId} for user ${userId}`);
      return { deleted: true };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logError('Error deleting notification:', error);
      throw new AppError(500, 'Failed to delete notification');
    }
  }

  /**
   * Delete all read notifications for a user
   */
  async deleteAllRead(userId) {
    try {
      const result = await pool.query(
        'DELETE FROM notifications WHERE user_id = $1 AND is_read = true RETURNING id',
        [userId]
      );

      log(`✅ Deleted ${result.rowCount} read notifications for user ${userId}`);
      return { deletedCount: result.rowCount };
    } catch (error) {
      logError('Error deleting read notifications:', error);
      throw new AppError(500, 'Failed to delete read notifications');
    }
  }

  /**
   * Get unread count for a user
   */
  async getUnreadCount(userId) {
    try {
      const result = await pool.query(
        'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = false',
        [userId]
      );

      return parseInt(result.rows[0].count);
    } catch (error) {
      logError('Error fetching unread count:', error);
      throw new AppError(500, 'Failed to fetch unread count');
    }
  }

  // ========== NOTIFICATION TEMPLATES ==========

  /**
   * Send booking confirmation notification
   */
  async sendBookingConfirmation(userId, bookingDetails) {
    return await this.create({
      userId,
      type: 'booking_confirmation',
      title: 'Booking Confirmed!',
      message: `Your booking for ${bookingDetails.dealTitle} has been confirmed.`,
      actionUrl: `/bookings/${bookingDetails.bookingId}`,
      actionLabel: 'View Booking',
      priority: 'high',
      metadata: {
        bookingId: bookingDetails.bookingId,
        dealId: bookingDetails.dealId,
        amount: bookingDetails.amount
      }
    });
  }

  /**
   * Send tier upgrade notification
   */
  async sendTierUpgrade(userId, tierDetails) {
    return await this.create({
      userId,
      type: 'tier_upgrade',
      title: `Congratulations! You've reached ${tierDetails.newTier}!`,
      message: `You've unlocked ${tierDetails.rewardPercentage}% EZT rewards and exclusive benefits!`,
      actionUrl: '/profile/tier',
      actionLabel: 'View Benefits',
      priority: 'high',
      metadata: {
        previousTier: tierDetails.previousTier,
        newTier: tierDetails.newTier,
        bonusEzt: tierDetails.bonusEzt
      }
    });
  }

  /**
   * Send achievement unlocked notification
   */
  async sendAchievementUnlocked(userId, achievementDetails) {
    return await this.create({
      userId,
      type: 'achievement_unlocked',
      title: `Achievement Unlocked: ${achievementDetails.title}!`,
      message: achievementDetails.description || `You've earned ${achievementDetails.eztReward} EZT!`,
      actionUrl: '/profile/achievements',
      actionLabel: 'View Achievements',
      priority: 'normal',
      metadata: {
        achievementId: achievementDetails.achievementId,
        eztReward: achievementDetails.eztReward
      }
    });
  }

  /**
   * Send referral completed notification
   */
  async sendReferralCompleted(userId, referralDetails) {
    return await this.create({
      userId,
      type: 'referral_completed',
      title: 'Referral Successful!',
      message: `Your friend completed their first booking! You've earned ${referralDetails.reward} EZT.`,
      actionUrl: '/profile/referrals',
      actionLabel: 'View Referrals',
      priority: 'normal',
      metadata: {
        referralId: referralDetails.referralId,
        reward: referralDetails.reward
      }
    });
  }

  /**
   * Send deal alert notification
   */
  async sendDealAlert(userId, dealDetails) {
    return await this.create({
      userId,
      type: 'deal_alert',
      title: `New Deal: ${dealDetails.title}`,
      message: dealDetails.description || 'Check out this exclusive deal!',
      actionUrl: `/deals/${dealDetails.dealId}`,
      actionLabel: 'View Deal',
      priority: 'low',
      metadata: {
        dealId: dealDetails.dealId,
        discount: dealDetails.discount
      }
    });
  }

  /**
   * Send booking reminder notification
   */
  async sendBookingReminder(userId, bookingDetails) {
    return await this.create({
      userId,
      type: 'booking_reminder',
      title: 'Upcoming Booking Reminder',
      message: `Don't forget! Your booking for ${bookingDetails.dealTitle} is on ${bookingDetails.date}.`,
      actionUrl: `/bookings/${bookingDetails.bookingId}`,
      actionLabel: 'View Details',
      priority: 'normal',
      metadata: {
        bookingId: bookingDetails.bookingId,
        date: bookingDetails.date
      }
    });
  }

  /**
   * Send voucher received notification
   */
  async sendVoucherReceived(userId, voucherDetails) {
    return await this.create({
      userId,
      type: 'voucher_received',
      title: 'New Voucher Received!',
      message: `You've received a voucher worth ₹${voucherDetails.value}. Use code: ${voucherDetails.code}`,
      actionUrl: `/vouchers/${voucherDetails.voucherId}`,
      actionLabel: 'View Voucher',
      priority: 'high',
      metadata: {
        voucherId: voucherDetails.voucherId,
        code: voucherDetails.code,
        value: voucherDetails.value
      }
    });
  }
}

module.exports = new NotificationService();

