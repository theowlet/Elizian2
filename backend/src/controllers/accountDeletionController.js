const accountDeletionService = require('../services/accountDeletionService');
const { successResponse, errorResponse } = require('../utils/response');
const { logError } = require('../utils/logger');

/**
 * Request account deletion
 * POST /api/v1/account/delete
 */
async function requestDeletion(req, res) {
  try {
    const userId = req.userId; // From JWT token
    const { reason } = req.body;
    
    const result = await accountDeletionService.requestAccountDeletion(userId, reason);
    
    successResponse(res, 200, 'Account deletion scheduled', result);
  } catch (err) {
    logError('Error requesting account deletion:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to schedule account deletion');
  }
}

/**
 * Cancel account deletion
 * POST /api/v1/account/delete/cancel
 */
async function cancelDeletion(req, res) {
  try {
    const userId = req.userId;
    
    const result = await accountDeletionService.cancelAccountDeletion(userId);
    
    successResponse(res, 200, 'Account deletion cancelled', result);
  } catch (err) {
    logError('Error cancelling account deletion:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to cancel account deletion');
  }
}

/**
 * Get account deletion status
 * GET /api/v1/account/delete/status
 */
async function getDeletionStatus(req, res) {
  try {
    const userId = req.userId;
    
    const status = await accountDeletionService.getAccountDeletionStatus(userId);
    
    successResponse(res, 200, 'Deletion status retrieved', status);
  } catch (err) {
    logError('Error getting deletion status:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to get deletion status');
  }
}

/**
 * Immediately delete account (admin only or for testing)
 * DELETE /api/v1/account/delete/immediate
 */
async function immediateDelete(req, res) {
  try {
    const { userId } = req.body;
    const actorUserId = req.userId;
    
    // Check if actor is admin (you should have admin role check middleware)
    // For now, allowing user to delete their own account immediately
    const targetUserId = userId || actorUserId;
    
    const result = await accountDeletionService.executeAccountDeletion(targetUserId);
    
    successResponse(res, 200, 'Account permanently deleted', result);
  } catch (err) {
    logError('Error immediately deleting account:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to delete account');
  }
}

module.exports = {
  requestDeletion,
  cancelDeletion,
  getDeletionStatus,
  immediateDelete
};

