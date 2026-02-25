/**
 * Isolated namespace: /api/v1/reviews
 * List, submit, aggregate for reputation system. Same behaviour as /partners/:id/reviews; dedicated route.
 */
const express = require('express');
const authenticateToken = require('../../middleware/authenticateToken');
const { reviewSubmitRateLimiter } = require('../middleware/rateLimiter');
const reputationReviewService = require('../services/reputationReviewService');
const { successResponse, errorResponse } = require('../../utils/response');
const { logError } = require('../../utils/logger');

const router = express.Router();

router.get('/partners/:partnerId', async (req, res) => {
  try {
    const { partnerId } = req.params;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
    const offset = parseInt(req.query.offset, 10) || 0;
    const reviews = await reputationReviewService.listByPartner(partnerId, limit, offset);
    successResponse(res, 200, 'Reviews retrieved', reviews);
  } catch (err) {
    logError('Reviews list error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to list reviews');
  }
});

router.get('/partners/:partnerId/aggregate', async (req, res) => {
  try {
    const { partnerId } = req.params;
    const aggregate = await reputationReviewService.getAggregate(partnerId);
    successResponse(res, 200, 'Aggregate retrieved', aggregate);
  } catch (err) {
    logError('Reviews aggregate error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to get aggregate');
  }
});

router.post('/partners/:partnerId', reviewSubmitRateLimiter, authenticateToken, async (req, res) => {
  try {
    const { partnerId } = req.params;
    const userId = req.userId;
    if (!userId) return errorResponse(res, 401, 'Authentication required');
    const clientIp = reputationReviewService.getClientIp(req);
    const { rating, title, comment } = req.body;
    const review = await reputationReviewService.submitReview(partnerId, userId, { rating, title, comment }, { clientIp });
    successResponse(res, 201, 'Review submitted', review);
  } catch (err) {
    logError('Review submit error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to submit review');
  }
});

module.exports = router;
