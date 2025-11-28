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

module.exports = router;

