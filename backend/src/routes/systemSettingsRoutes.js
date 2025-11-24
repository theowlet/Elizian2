const express = require('express');
const router = express.Router();
const systemSettingsController = require('../controllers/systemSettingsController');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

/**
 * @route   GET /api/v1/settings/public
 * @desc    Get public settings
 * @access  Public
 */
router.get('/public', systemSettingsController.getPublicSettings);

/**
 * @route   GET /api/v1/settings
 * @desc    Get all settings (admin only)
 * @access  Private/Admin
 */
router.get('/', authenticateToken, authorizeRole('admin'), systemSettingsController.getAllSettings);

/**
 * @route   GET /api/v1/settings/:key
 * @desc    Get specific setting (admin only)
 * @access  Private/Admin
 */
router.get('/:key', authenticateToken, authorizeRole('admin'), systemSettingsController.getSetting);

/**
 * @route   PUT /api/v1/settings/:key
 * @desc    Update setting (admin only)
 * @access  Private/Admin
 */
router.put('/:key', authenticateToken, authorizeRole('admin'), systemSettingsController.updateSetting);

/**
 * @route   POST /api/v1/settings
 * @desc    Create setting (admin only)
 * @access  Private/Admin
 */
router.post('/', authenticateToken, authorizeRole('admin'), systemSettingsController.createSetting);

/**
 * @route   DELETE /api/v1/settings/:key
 * @desc    Delete setting (admin only)
 * @access  Private/Admin
 */
router.delete('/:key', authenticateToken, authorizeRole('admin'), systemSettingsController.deleteSetting);

/**
 * @route   POST /api/v1/settings/cache/clear
 * @desc    Clear settings cache (admin only)
 * @access  Private/Admin
 */
router.post('/cache/clear', authenticateToken, authorizeRole('admin'), systemSettingsController.clearCache);

module.exports = router;

