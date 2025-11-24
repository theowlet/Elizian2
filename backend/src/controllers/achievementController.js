const achievementService = require('../services/achievementService');
const { successResponse, errorResponse } = require('../../utils/response');

/**
 * Get all available achievements
 */
async function getAllAchievements(req, res) {
  try {
    const includeSecret = req.query.includeSecret === 'true';
    const achievements = await achievementService.getAllAchievements(includeSecret);

    return successResponse(res, { achievements }, 'Achievements retrieved successfully');
  } catch (error) {
    return errorResponse(res, error);
  }
}

/**
 * Get user's achievements
 */
async function getUserAchievements(req, res) {
  try {
    const userId = req.userId;
    const result = await achievementService.getUserAchievements(userId);

    return successResponse(res, result, 'User achievements retrieved successfully');
  } catch (error) {
    return errorResponse(res, error);
  }
}

/**
 * Check and unlock new achievements
 */
async function checkAchievements(req, res) {
  try {
    const userId = req.userId;
    const result = await achievementService.checkAndUnlock(userId, 'manual');

    return successResponse(res, result, 'Achievements checked successfully');
  } catch (error) {
    return errorResponse(res, error);
  }
}

/**
 * Get achievement leaderboard
 */
async function getLeaderboard(req, res) {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const leaderboard = await achievementService.getLeaderboard(limit);

    return successResponse(res, { leaderboard }, 'Leaderboard retrieved successfully');
  } catch (error) {
    return errorResponse(res, error);
  }
}

/**
 * Create achievement (admin only)
 */
async function createAchievement(req, res) {
  try {
    const achievementData = req.body;
    const achievement = await achievementService.createAchievement(achievementData);

    return successResponse(res, { achievement }, 'Achievement created successfully', 201);
  } catch (error) {
    return errorResponse(res, error);
  }
}

/**
 * Manually unlock achievement (admin only)
 */
async function unlockAchievementManually(req, res) {
  try {
    const { userId, achievementId } = req.body;
    const adminId = req.userId;

    const result = await achievementService.unlockManually(userId, achievementId, adminId);
    return successResponse(res, result, 'Achievement unlocked successfully');
  } catch (error) {
    return errorResponse(res, error);
  }
}

module.exports = {
  getAllAchievements,
  getUserAchievements,
  checkAchievements,
  getLeaderboard,
  createAchievement,
  unlockAchievementManually
};

