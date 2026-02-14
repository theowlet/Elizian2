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

    return successResponse(res, 200, 'Notifications retrieved successfully', result);
  } catch (error) {
    if (error.code === '42P01') {
      return successResponse(res, 200, 'Notifications retrieved successfully', { notifications: [], unreadCount: 0, total: 0 });
    }
    return errorResponse(res, error.statusCode || 500, error.message || 'Failed to get notifications');
  }
}

/**
 * Get unread notification count
 */
async function getUnreadCount(req, res) {
  try {
    const userId = req.userId;
    const count = await notificationService.getUnreadCount(userId);

    return successResponse(res, 200, 'Unread count retrieved', { count });
  } catch (error) {
    if (error.code === '42P01') {
      return successResponse(res, 200, 'Unread count retrieved', { count: 0 });
    }
    return errorResponse(res, error.statusCode || 500, error.message || 'Failed to get unread count');
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
      return errorResponse(res, 400, 'notificationIds array is required');
    }

    const result = await notificationService.markAsRead(notificationIds, userId);
    return successResponse(res, 200, 'Notifications marked as read', result);
  } catch (error) {
    return errorResponse(res, error.statusCode || 500, error.message || 'Failed to mark as read');
  }
}

/**
 * Mark all notifications as read
 */
async function markAllAsRead(req, res) {
  try {
    const userId = req.userId;
    const result = await notificationService.markAllAsRead(userId);
    return successResponse(res, 200, 'All notifications marked as read', result);
  } catch (error) {
    return errorResponse(res, error.statusCode || 500, error.message || 'Failed to mark all as read');
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
    return successResponse(res, 200, 'Notification deleted', result);
  } catch (error) {
    return errorResponse(res, error.statusCode || 500, error.message || 'Failed to delete notification');
  }
}

/**
 * Delete all read notifications
 */
async function deleteAllRead(req, res) {
  try {
    const userId = req.userId;
    const result = await notificationService.deleteAllRead(userId);
    return successResponse(res, 200, 'Read notifications deleted', result);
  } catch (error) {
    return errorResponse(res, error.statusCode || 500, error.message || 'Failed to delete read notifications');
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

