const { successResponse, errorResponse } = require('../../utils/response');
const staffRepository = require('../repositories/staffRepository');
const tokenService = require('../services/tokenService');
const { logError } = require('../../utils/logger');

const DEFAULT_STAFF_CHECK_IN_EZT = 10;

function requirePartner(req, res, partnerId) {
  if (!req.partnerId) return errorResponse(res, 401, 'Partner authentication required');
  if (req.partnerId !== partnerId) return errorResponse(res, 403, 'Not authorized');
  return null;
}

async function list(req, res) {
  try {
    const { id: partnerId } = req.params;
    const err = requirePartner(req, res, partnerId);
    if (err) return;
    const staff = await staffRepository.listByPartner(partnerId);
    successResponse(res, 200, 'Staff list retrieved', staff);
  } catch (e) {
    logError('Staff list error:', e);
    errorResponse(res, 500, e.message || 'Failed to list staff');
  }
}

async function addStaff(req, res) {
  try {
    const { id: partnerId } = req.params;
    const err = requirePartner(req, res, partnerId);
    if (err) return;
    const { user_id: userId, email } = req.body || {};
    let targetUserId = userId;
    if (!targetUserId && email) {
      const user = await staffRepository.findUserByEmail(email);
      if (!user) return errorResponse(res, 404, 'User not found with this email');
      targetUserId = user.id;
    }
    if (!targetUserId) return errorResponse(res, 400, 'Provide user_id or email');
    const row = await staffRepository.add(partnerId, targetUserId);
    successResponse(res, 201, 'Staff added', row);
  } catch (e) {
    logError('Add staff error:', e);
    errorResponse(res, 500, e.message || 'Failed to add staff');
  }
}

async function removeStaff(req, res) {
  try {
    const { id: partnerId, userId } = req.params;
    const err = requirePartner(req, res, partnerId);
    if (err) return;
    const removed = await staffRepository.remove(partnerId, userId);
    if (!removed) return errorResponse(res, 404, 'Staff member not found');
    successResponse(res, 200, 'Staff removed');
  } catch (e) {
    logError('Remove staff error:', e);
    errorResponse(res, 500, e.message || 'Failed to remove staff');
  }
}

async function checkIn(req, res) {
  try {
    const { id: partnerId } = req.params;
    const err = requirePartner(req, res, partnerId);
    if (err) return;
    const { user_id: userId, ezt_earned: eztEarnedParam, notes } = req.body || {};
    if (!userId) return errorResponse(res, 400, 'user_id required');
    const isStaff = await staffRepository.isStaff(partnerId, userId);
    if (!isStaff) return errorResponse(res, 403, 'User is not staff for this partner');
    const eztEarned = parseFloat(eztEarnedParam) || DEFAULT_STAFF_CHECK_IN_EZT;
    const credited = await tokenService.creditFixed(
      userId,
      eztEarned,
      `Staff check-in at venue (${partnerId})`
    );
    const record = await staffRepository.recordCheckIn(partnerId, userId, credited, notes);
    successResponse(res, 201, 'Check-in recorded', { check_in: record, ezt_earned: credited });
  } catch (e) {
    logError('Staff check-in error:', e);
    errorResponse(res, 500, e.message || 'Failed to record check-in');
  }
}

async function listCheckIns(req, res) {
  try {
    const { id: partnerId } = req.params;
    const err = requirePartner(req, res, partnerId);
    if (err) return;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const offset = parseInt(req.query.offset, 10) || 0;
    const rows = await staffRepository.listCheckIns(partnerId, limit, offset);
    successResponse(res, 200, 'Check-ins retrieved', rows);
  } catch (e) {
    logError('Staff check-ins list error:', e);
    errorResponse(res, 500, e.message || 'Failed to list check-ins');
  }
}

module.exports = {
  list,
  addStaff,
  removeStaff,
  checkIn,
  listCheckIns,
};
