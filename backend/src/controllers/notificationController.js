const notificationService = require('../services/notificationService');
const { successResponse, errorResponse } = require('../../utils/response');

/**
 * Get user's notifications
 */
async function getNotifications(req, res) {
  try {
    const userId = req.userId;
    const { limit, offset, unreadOnly, type } = req.query;

    const result = await notificationService.getUserNotifications(userId, {
      limit: parseInt(limit) || 20,
      offset: parseInt(offset) || 0,
      unreadOnly: unreadOnly === 'true',
      type: type || null
    });

    return successResponse(res, result, 'Notifications retrieved successfully');
  } catch (error) {
    return errorResponse(res, error);
  }
}

/**
 * Get unread notification count
 */
async function getUnreadCount(req, res) {
  try {
    const userId = req.userId;
    const count = await notificationService.getUnreadCount(userId);

    return successResponse(res, { count }, 'Unread count retrieved');
  } catch (error) {
    return errorResponse(res, error);
  }
}

/**
 * Mark notifications as read
 */
async function markAsRead(req, res) {
  try {
    const userId = req.userId;
    const { notificationIds } = req.body;

    if (!notificationIds || !Array.isArray(notificationIds)) {
      return errorResponse(res, new Error('notificationIds array is required'), 400);
    }

    const result = await notificationService.markAsRead(notificationIds, userId);
    return successResponse(res, result, 'Notifications marked as read');
  } catch (error) {
    return errorResponse(res, error);
  }
}

/**
 * Mark all notifications as read
 */
async function markAllAsRead(req, res) {
  try {
    const userId = req.userId;
    const result = await notificationService.markAllAsRead(userId);

    return successResponse(res, result, 'All notifications marked as read');
  } catch (error) {
    return errorResponse(res, error);
  }
}

/**
 * Delete notification
 */
async function deleteNotification(req, res) {
  try {
    const userId = req.userId;
    const { id } = req.params;

    const result = await notificationService.deleteNotification(id, userId);
    return successResponse(res, result, 'Notification deleted');
  } catch (error) {
    return errorResponse(res, error);
  }
}

/**
 * Delete all read notifications
 */
async function deleteAllRead(req, res) {
  try {
    const userId = req.userId;
    const result = await notificationService.deleteAllRead(userId);

    return successResponse(res, result, 'Read notifications deleted');
  } catch (error) {
    return errorResponse(res, error);
  }
}

module.exports = {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteAllRead
};

