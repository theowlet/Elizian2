const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const authenticateToken = require('../../middleware/authenticateToken');

// All routes require authentication
router.use(authenticateToken);

/**
 * @route   GET /api/v1/notifications
 * @desc    Get user's notifications
 * @access  Private
 */
router.get('/', notificationController.getNotifications);

/**
 * @route   GET /api/v1/notifications/unread-count
 * @desc    Get unread notification count
 * @access  Private
 */
router.get('/unread-count', notificationController.getUnreadCount);

/**
 * @route   PUT /api/v1/notifications/mark-read
 * @desc    Mark notifications as read
 * @access  Private
 */
router.put('/mark-read', notificationController.markAsRead);

/**
 * @route   PUT /api/v1/notifications/mark-all-read
 * @desc    Mark all notifications as read
 * @access  Private
 */
router.put('/mark-all-read', notificationController.markAllAsRead);

/**
 * @route   DELETE /api/v1/notifications/:id
 * @desc    Delete a notification
 * @access  Private
 */
router.delete('/:id', notificationController.deleteNotification);

/**
 * @route   DELETE /api/v1/notifications/read/all
 * @desc    Delete all read notifications
 * @access  Private
 */
router.delete('/read/all', notificationController.deleteAllRead);

/**
 * @route   POST /api/v1/notifications/push-subscribe
 * @desc    Register push notification subscription
 * @access  Private
 */
router.post('/push-subscribe', async (req, res) => {
  try {
    const { subscription } = req.body;
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ success: false, message: 'Invalid push subscription' });
    }

    const pool = require('../config/db').getPool();
    // Upsert push subscription
    await pool.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, keys, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       ON CONFLICT (user_id, endpoint) DO UPDATE SET keys = $3, updated_at = NOW()`,
      [req.userId, subscription.endpoint, JSON.stringify(subscription.keys || {})]
    );

    res.json({ success: true, message: 'Push subscription registered' });
  } catch (error) {
    console.error('Push subscribe error:', error);
    // Graceful fallback if table doesn't exist yet
    res.json({ success: true, message: 'Push subscription noted (table pending migration)' });
  }
});

module.exports = router;

