const tierCardService = require('../services/tierCardService');
const { successResponse, errorResponse } = require('../../utils/response');
const { logError } = require('../utils/logger');

// GET /api/v1/user/tier-card — Get user's EAZY PASS tier card data
async function getTierCard(req, res) {
  try {
    const cardData = await tierCardService.generateTierCardData(req.userId);
    successResponse(res, 200, 'Tier card retrieved successfully', cardData);
  } catch (error) {
    logError('Error getting tier card:', error);
    errorResponse(res, error.statusCode || 500, error.message || 'Failed to get tier card');
  }
}

// POST /api/v1/partner/verify-tier-card — Partner verifies a scanned QR token
async function verifyTierCard(req, res) {
  try {
    const { token } = req.body;
    if (!token) {
      return errorResponse(res, 400, 'token is required in request body');
    }

    // Pass scan context for audit trail
    const verification = await tierCardService.verifyTierCardToken(token, {
      scannedByUserId: req.userId || null,
      scannedByPartnerId: req.partnerId || null,
      ipAddress: req.ip || req.headers['x-forwarded-for'] || null,
    });

    successResponse(res, 200, 'Tier card verified successfully', verification);
  } catch (error) {
    logError('Error verifying tier card:', error);
    errorResponse(res, error.statusCode || 500, error.message || 'Failed to verify tier card');
  }
}

// GET /api/v1/admin/pass/:passNumber/scans — Admin: get scan history for a pass
async function getPassScanHistory(req, res) {
  try {
    const { passNumber } = req.params;
    if (!passNumber) {
      return errorResponse(res, 400, 'passNumber is required');
    }
    const history = await tierCardService.getScanHistory(passNumber, {
      limit: parseInt(req.query.limit) || 50,
      offset: parseInt(req.query.offset) || 0,
    });
    successResponse(res, 200, 'Scan history retrieved', history);
  } catch (error) {
    logError('Error getting scan history:', error);
    errorResponse(res, error.statusCode || 500, error.message || 'Failed to get scan history');
  }
}

// GET /api/v1/admin/pass/:passNumber — Admin: lookup pass by number
async function lookupPass(req, res) {
  try {
    const { passNumber } = req.params;
    if (!passNumber) {
      return errorResponse(res, 400, 'passNumber is required');
    }
    const pass = await tierCardService.findPassByNumber(passNumber);
    if (!pass) {
      return errorResponse(res, 404, 'Pass not found');
    }
    successResponse(res, 200, 'Pass found', pass);
  } catch (error) {
    logError('Error looking up pass:', error);
    errorResponse(res, error.statusCode || 500, error.message || 'Failed to lookup pass');
  }
}

module.exports = { getTierCard, verifyTierCard, getPassScanHistory, lookupPass };
