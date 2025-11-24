const express = require('express');
const router = express.Router();
const accountDeletionController = require('../controllers/accountDeletionController');
const authenticateToken = require('../../middleware/auth');

// All routes require authentication
router.use(authenticateToken);

/**
 * @route   POST /api/v1/account/delete
 * @desc    Request account deletion (30-day grace period)
 * @access  Private
 */
router.post('/delete', accountDeletionController.requestDeletion);

/**
 * @route   POST /api/v1/account/delete/cancel
 * @desc    Cancel pending account deletion
 * @access  Private
 */
router.post('/delete/cancel', accountDeletionController.cancelDeletion);

/**
 * @route   GET /api/v1/account/delete/status
 * @desc    Get account deletion status
 * @access  Private
 */
router.get('/delete/status', accountDeletionController.getDeletionStatus);

/**
 * @route   DELETE /api/v1/account/delete/immediate
 * @desc    Immediately delete account (bypass grace period)
 * @access  Private (Admin only in production)
 */
router.delete('/delete/immediate', accountDeletionController.immediateDelete);

module.exports = router;

