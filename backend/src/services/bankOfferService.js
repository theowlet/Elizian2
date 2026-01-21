const bankOfferRepository = require('../repositories/bankOfferRepository');
const { AppError } = require('../../utils/response');
const { logError } = require('../../utils/logger');

// Get all active bank offers
async function getAllBankOffers() {
  try {
    return await bankOfferRepository.getAllActiveBankOffers();
  } catch (error) {
    logError('Error in getAllBankOffers service:', error);
    throw error;
  }
}

// Get applicable bank offers for a booking
async function getApplicableOffers(orderAmount, userId = null, partnerId = null, categoryId = null) {
  try {
    const offers = await bankOfferRepository.getApplicableBankOffers(
      orderAmount,
      userId,
      partnerId,
      categoryId
    );

    // Group by bank
    const groupedOffers = {};
    offers.forEach(offer => {
      if (!groupedOffers[offer.bank_offer_id]) {
        groupedOffers[offer.bank_offer_id] = {
          bankId: offer.bank_offer_id,
          bankName: offer.bank_name,
          bankCode: offer.bank_code,
          logoUrl: offer.logo_url,
          offers: []
        };
      }
      groupedOffers[offer.bank_offer_id].offers.push({
        ruleId: offer.rule_id,
        type: offer.offer_type,
        value: parseFloat(offer.offer_value),
        maxDiscount: offer.max_discount ? parseFloat(offer.max_discount) : null,
        minOrder: parseFloat(offer.min_order_amount),
        description: offer.description
      });
    });

    return Object.values(groupedOffers);
  } catch (error) {
    logError('Error in getApplicableOffers service:', error);
    throw error;
  }
}

// Calculate discount for a specific bank offer rule
async function calculateDiscount(ruleId, orderAmount) {
  try {
    return await bankOfferRepository.calculateBankOfferDiscount(ruleId, orderAmount);
  } catch (error) {
    logError('Error in calculateDiscount service:', error);
    throw error;
  }
}

// Apply bank offer to booking
async function applyBankOffer(bookingId, bankOfferId, ruleId, userId, orderAmount, client) {
  try {
    const discountResult = await calculateDiscount(ruleId, orderAmount);
    
    if (discountResult.error) {
      throw new AppError(400, discountResult.error);
    }

    await bankOfferRepository.recordBankOfferUsage(
      bookingId,
      bankOfferId,
      ruleId,
      userId,
      orderAmount,
      discountResult.discount,
      client
    );

    return {
      discount: discountResult.discount,
      offerType: discountResult.offerType,
      finalAmount: orderAmount - discountResult.discount
    };
  } catch (error) {
    logError('Error in applyBankOffer service:', error);
    throw error;
  }
}

// Admin: Create/Update bank offer
async function upsertBankOffer(bankData) {
  try {
    return await bankOfferRepository.upsertBankOffer(bankData);
  } catch (error) {
    logError('Error in upsertBankOffer service:', error);
    throw error;
  }
}

// Admin: Create/Update bank offer rule
async function upsertBankOfferRule(ruleData) {
  try {
    return await bankOfferRepository.upsertBankOfferRule(ruleData);
  } catch (error) {
    logError('Error in upsertBankOfferRule service:', error);
    throw error;
  }
}

module.exports = {
  getAllBankOffers,
  getApplicableOffers,
  calculateDiscount,
  applyBankOffer,
  upsertBankOffer,
  upsertBankOfferRule
};

