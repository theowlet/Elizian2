const reviewService = require('../services/reviewService');
const { successResponse, errorResponse } = require('../../utils/response');
const { logError } = require('../../utils/logger');

async function listReviews(req, res) {
  try {
    const { id: partnerId } = req.params;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
    const offset = parseInt(req.query.offset, 10) || 0;
    const reviews = await reviewService.listByPartner(partnerId, limit, offset);
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
    const { rating, title, comment, booking_id } = req.body;
    const review = await reviewService.submitReview(partnerId, userId, {
      rating,
      title,
      comment,
      booking_id,
    });
    successResponse(res, 201, 'Review submitted successfully', review);
  } catch (err) {
    logError('Submit review error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to submit review');
  }
}

module.exports = {
  listReviews,
  submitReview,
};
