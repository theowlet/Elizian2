const tipRepository = require('../repositories/tipRepository');
const partnerRepository = require('../repositories/partnerRepository');
const { AppError } = require('../../utils/response');

async function createTip(userId, partnerId, { amount_decimal, currency, payment_method, notes, booking_id }) {
  const amount = parseFloat(amount_decimal);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AppError(400, 'Tip amount must be a positive number');
  }
  const partner = await partnerRepository.getPartnerById(partnerId);
  if (!partner) {
    throw new AppError(404, 'Venue not found');
  }
  return await tipRepository.create({
    from_user_id: userId,
    partner_id: partnerId,
    booking_id: booking_id || null,
    amount_decimal: amount,
    currency: currency || 'INR',
    payment_method: payment_method || 'ezt',
    notes: notes || null,
  });
}

async function listByPartner(partnerId, limit, offset) {
  return await tipRepository.listByPartner(partnerId, limit, offset);
}

async function listByUser(userId, limit) {
  return await tipRepository.listByUser(userId, limit);
}

module.exports = {
  createTip,
  listByPartner,
  listByUser,
};
