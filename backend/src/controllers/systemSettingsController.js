const systemSettingsService = require('../services/systemSettingsService');
const { successResponse, errorResponse } = require('../../utils/response');

/**
 * Get all system settings (admin only)
 */
async function getAllSettings(req, res) {
  try {
    const includePrivate = req.query.includePrivate === 'true';
    const settings = await systemSettingsService.getAllSettings(includePrivate);

    return successResponse(res, { settings }, 'Settings retrieved successfully');
  } catch (error) {
    return errorResponse(res, error);
  }
}

/**
 * Get public settings (no auth required)
 */
async function getPublicSettings(req, res) {
  try {
    const settings = await systemSettingsService.getPublicSettings();
    return successResponse(res, settings, 'Public settings retrieved successfully');
  } catch (error) {
    return errorResponse(res, error);
  }
}

/**
 * Get specific setting (admin only)
 */
async function getSetting(req, res) {
  try {
    const { key } = req.params;
    const value = await systemSettingsService.getSetting(key, false); // Don't use cache

    if (value === null) {
      return errorResponse(res, new Error('Setting not found'), 404);
    }

    return successResponse(res, { key, value }, 'Setting retrieved successfully');
  } catch (error) {
    return errorResponse(res, error);
  }
}

/**
 * Update setting (admin only)
 */
async function updateSetting(req, res) {
  try {
    const { key } = req.params;
    const { value } = req.body;
    const updatedBy = req.userId;

    const setting = await systemSettingsService.updateSetting(key, value, updatedBy);
    return successResponse(res, { setting }, 'Setting updated successfully');
  } catch (error) {
    return errorResponse(res, error);
  }
}

/**
 * Create setting (admin only)
 */
async function createSetting(req, res) {
  try {
    const settingData = req.body;
    const setting = await systemSettingsService.createSetting(settingData);

    return successResponse(res, { setting }, 'Setting created successfully', 201);
  } catch (error) {
    return errorResponse(res, error);
  }
}

/**
 * Delete setting (admin only)
 */
async function deleteSetting(req, res) {
  try {
    const { key } = req.params;
    const result = await systemSettingsService.deleteSetting(key);

    return successResponse(res, result, 'Setting deleted successfully');
  } catch (error) {
    return errorResponse(res, error);
  }
}

/**
 * Clear settings cache (admin only)
 */
async function clearCache(req, res) {
  try {
    systemSettingsService.clearCache();
    return successResponse(res, { cleared: true }, 'Settings cache cleared successfully');
  } catch (error) {
    return errorResponse(res, error);
  }
}

module.exports = {
  getAllSettings,
  getPublicSettings,
  getSetting,
  updateSetting,
  createSetting,
  deleteSetting,
  clearCache
};

