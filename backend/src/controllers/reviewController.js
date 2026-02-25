const reputationReviewService = require('../services/reputationReviewService');
const { successResponse, errorResponse } = require('../../utils/response');
const { logError } = require('../../utils/logger');

async function listReviews(req, res) {
  try {
    const { id: partnerId } = req.params;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
    const offset = parseInt(req.query.offset, 10) || 0;
    const reviews = await reputationReviewService.listByPartner(partnerId, limit, offset);
    successResponse(res, 200, 'Reviews retrieved successfully', reviews);
  } catch (err) {
    logError('List reviews error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to list reviews');
  }
}

async function submitReview(req, res) {
  try {
    const { id: partnerId } = req.params;
    const userId = req.userId;
    if (!userId) {
      return errorResponse(res, 401, 'Authentication required');
    }
    const clientIp = reputationReviewService.getClientIp(req);
    const { rating, title, comment, booking_id } = req.body;
    const review = await reputationReviewService.submitReview(partnerId, userId, {
      rating,
      title,
      comment,
      booking_id,
    }, { clientIp });
    successResponse(res, 201, 'Review submitted successfully', review);
  } catch (err) {
    logError('Submit review error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to submit review');
  }
}

async function requestDispute(req, res) {
  try {
    const { id: partnerId, reviewId } = req.params;
    const { reason } = req.body || {};
    const updated = await reputationReviewService.requestDispute(reviewId, partnerId, reason);
    if (!updated) return errorResponse(res, 404, 'Review not found or not for this venue');
    successResponse(res, 200, 'Dispute requested', updated);
  } catch (err) {
    logError('Request dispute error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to request dispute');
  }
}

async function getModerationReason(req, res) {
  try {
    const { id: partnerId, reviewId } = req.params;
    const data = await reputationReviewService.getModerationReasonForPartner(reviewId, partnerId);
    if (!data) return errorResponse(res, 404, 'Review not found or not for this venue');
    successResponse(res, 200, 'Moderation reason', data);
  } catch (err) {
    logError('Get moderation reason error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to get moderation reason');
  }
}

module.exports = {
  listReviews,
  submitReview,
  requestDispute,
  getModerationReason,
};
