const reviewRepository = require('../repositories/reviewRepository');
const partnerRepository = require('../repositories/partnerRepository');
const { AppError } = require('../../utils/response');

async function submitReview(partnerId, userId, { rating, title, comment, booking_id }) {
  if (!rating || rating < 1 || rating > 5) {
    throw new AppError(400, 'Rating must be between 1 and 5');
  }
  const partner = await partnerRepository.getPartnerById(partnerId);
  if (!partner) {
    throw new AppError(404, 'Venue not found');
  }
  let verifiedBookingId = booking_id || null;
  if (!verifiedBookingId) {
    const found = await reviewRepository.findRedeemedBookingForUserPartner(userId, partnerId);
    if (found) verifiedBookingId = found;
  }
  const row = await reviewRepository.create(partnerId, userId, {
    rating: Number(rating),
    title: title || null,
    comment: comment || null,
    booking_id: verifiedBookingId,
  });
  return row;
}

async function listByPartner(partnerId, limit = 20, offset = 0) {
  return await reviewRepository.listByPartner(partnerId, limit, offset);
}

async function getAggregate(partnerId) {
  return await reviewRepository.getAggregate(partnerId);
}

module.exports = {
  submitReview,
  listByPartner,
  getAggregate,
};
