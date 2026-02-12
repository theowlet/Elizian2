const prelaunchRepository = require('../repositories/prelaunchRepository');
const { successResponse, errorResponse } = require('../../utils/response');
const { logError } = require('../../utils/logger');

async function signup(req, res) {
  try {
    const userId = req.userId;
    if (!userId) return errorResponse(res, 401, 'Authentication required');
    const partnerId = req.params.id;
    const row = await prelaunchRepository.signup(partnerId, userId);
    const list = await prelaunchRepository.listByUser(userId);
    successResponse(res, 201, row ? 'Signed up for pre-launch' : 'Already signed up', { signup: row, signups: list });
  } catch (err) {
    logError('Prelaunch signup error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed');
  }
}

async function listMine(req, res) {
  try {
    const userId = req.userId;
    if (!userId) return errorResponse(res, 401, 'Authentication required');
    const list = await prelaunchRepository.listByUser(userId);
    successResponse(res, 200, 'Signups retrieved', list);
  } catch (err) {
    logError('List prelaunch signups error:', err);
    errorResponse(res, 500, err.message || 'Failed');
  }
}

async function listForPartner(req, res) {
  try {
    const partnerId = req.params.id;
    if (!req.partnerId || req.partnerId !== partnerId) return errorResponse(res, 403, 'Not authorized');
    const list = await prelaunchRepository.listByPartner(partnerId);
    successResponse(res, 200, 'Signups retrieved', list);
  } catch (err) {
    logError('List partner prelaunch error:', err);
    errorResponse(res, 500, err.message || 'Failed');
  }
}

async function check(req, res) {
  try {
    const userId = req.userId;
    if (!userId) return errorResponse(res, 401, 'Authentication required');
    const partnerId = req.params.id;
    const signedUp = await prelaunchRepository.isSignedUp(partnerId, userId);
    successResponse(res, 200, 'OK', { signed_up: signedUp });
  } catch (err) {
    logError('Check prelaunch error:', err);
    errorResponse(res, 500, err.message || 'Failed');
  }
}

module.exports = { signup, listMine, listForPartner, check };
