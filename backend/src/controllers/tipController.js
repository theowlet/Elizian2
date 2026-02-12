const tipService = require('../services/tipService');
const { successResponse, errorResponse } = require('../../utils/response');
const { logError } = require('../../utils/logger');

async function createTip(req, res) {
  try {
    const userId = req.userId;
    if (!userId) {
      return errorResponse(res, 401, 'Authentication required');
    }
    const { id: partnerId } = req.params;
    const { amount_decimal, currency, payment_method, notes, booking_id } = req.body;
    const tip = await tipService.createTip(userId, partnerId, {
      amount_decimal,
      currency,
      payment_method,
      notes,
      booking_id,
    });
    successResponse(res, 201, 'Tip sent successfully', tip);
  } catch (err) {
    logError('Create tip error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to send tip');
  }
}

async function listForPartner(req, res) {
  try {
    const { id: partnerId } = req.params;
    if (req.partnerId !== partnerId) {
      return errorResponse(res, 403, 'Only the venue can view its tips');
    }
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const offset = parseInt(req.query.offset, 10) || 0;
    const tips = await tipService.listByPartner(partnerId, limit, offset);
    successResponse(res, 200, 'Tips retrieved successfully', tips);
  } catch (err) {
    logError('List tips error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to list tips');
  }
}

module.exports = {
  createTip,
  listForPartner,
};
