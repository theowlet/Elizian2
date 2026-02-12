const offerRepository = require('../repositories/offerRepository');
const partnerRepository = require('../repositories/partnerRepository');
const menuRepository = require('../repositories/menuRepository');
const settingsRepository = require('../repositories/settingsRepository');
const { AppError } = require('../../utils/response');
const { logError, log } = require('../../utils/logger');
const { handleImageUpload, deleteOldImage } = require('../utils/imageUpload');
const { emitRealtimeEvent, REALTIME_EVENTS } = require('../utils/realtimeEmitter');
const {
  deriveDiscountValues,
  normalizeApplicableDays,
  determineScheduleStatus,
  toRelativeImagePath
} = require('../utils/dealRules');
const { normalizeOffers } = require('../utils/responseNormalizer');

const OFFER_STATUS = {
  DRAFT: 'draft',
  PENDING: 'pending_approval',
  ACTIVE: 'active',
  PAUSED: 'paused',
  REJECTED: 'rejected',
  EXPIRED: 'expired'
};

function handleOfferImageUpload(image_base64, image_filename) {
  return handleImageUpload(image_base64, image_filename, 'offers', 'offer');
}

async function shouldRequireDealApproval() {
  try {
    const setting = await settingsRepository.getSystemSetting('deal_approval_required');
    if (setting === null || setting === undefined) {
      return true;
    }
    return !['false', '0', 'no', 'off'].includes(String(setting).toLowerCase());
  } catch (err) {
    logError('Failed to read deal approval setting:', err);
    return true;
  }
}

function sanitizeImageUrl(imageUrl) {
  if (!imageUrl) return null;
  if (imageUrl.startsWith('/uploads/')) return imageUrl;
  return toRelativeImagePath(imageUrl);
}

async function listOffersByPartner(partnerId) {
  try {
    const partner = await partnerRepository.getPartnerById(partnerId);
    if (!partner) {
      throw new AppError(404, 'Partner not found');
    }
    return await offerRepository.listOffersByPartner(partnerId);
  } catch (error) {
    if (error instanceof AppError) throw error;
    logError('List offers by partner error:', error);
    throw new AppError(500, `Failed to list offers: ${error.message}`);
  }
}

async function createOffer(partnerId, offerData) {
  try {
    const partner = await partnerRepository.getPartnerById(partnerId);
    if (!partner) {
      throw new AppError(404, 'Partner not found');
    }

    const { title, start_date, end_date } = offerData;
    if (!title || !start_date || !end_date) {
      throw new AppError(400, 'Title, start date, and end date are required');
    }

    const startDate = new Date(start_date);
    const endDate = new Date(end_date);
    const now = new Date();

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new AppError(400, 'Invalid date format');
    }

    // Allow slight clock skew by permitting start times up to 5 minutes in the past
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    if (startDate < fiveMinutesAgo) {
      throw new AppError(400, 'Start date must be within 5 minutes of current time or in the future');
    }

    if (endDate <= startDate) {
      throw new AppError(400, 'End date must be after start date');
    }

    const scheduleStatus = determineScheduleStatus(startDate, endDate);
    if (scheduleStatus === 'expired') {
      throw new AppError(400, 'End date cannot be in the past');
    }

    const approvalRequired = await shouldRequireDealApproval();

    let finalImageUrl = offerData.image_url ? sanitizeImageUrl(offerData.image_url) : null;
    log(`📸 Offer image check: has image_url=${!!finalImageUrl}, has image_base64=${!!offerData.image_base64}`);

    if (!finalImageUrl && offerData.image_base64) {
      log('📤 Processing offer image upload...');
      try {
        finalImageUrl = await handleOfferImageUpload(offerData.image_base64, offerData.image_filename);
        log(`✅ Offer image uploaded successfully: ${finalImageUrl}`);
      } catch (imageErr) {
        logError('❌ Offer image upload failed:', imageErr);
        throw imageErr;
      }
    }

    log(`💾 Final image_url for offer: ${finalImageUrl || 'NULL'}`);

    let finalMenuItemId = offerData.menu_item_id || null;
    let finalServiceType = offerData.service_type;
    let finalOriginalPrice = offerData.original_price;

    if (finalMenuItemId) {
      try {
        const menuItem = await menuRepository.getMenuItemById(partnerId, finalMenuItemId);
        if (menuItem) {
          finalOriginalPrice = parseFloat(menuItem.price) || finalOriginalPrice;
          if (!finalServiceType && menuItem.service_type) {
            finalServiceType = menuItem.service_type;
          }
          log(`✅ Linked offer to menu item: ${menuItem.name}`);
        } else {
          log(`⚠️ Menu item ${finalMenuItemId} not found, creating standalone offer`);
          finalMenuItemId = null;
        }
      } catch (menuErr) {
        logError('Error fetching menu item:', menuErr);
        finalMenuItemId = null;
      }
    }

    const discountValues = deriveDiscountValues({
      original_price: finalOriginalPrice || offerData.original_price,
      discount_percentage: offerData.discount_percentage,
      discount_amount: offerData.discount_amount,
      discounted_price: offerData.discounted_price
    });

    const normalizedDays = normalizeApplicableDays(offerData.applicable_days);
    const desiredStatus = approvalRequired ? OFFER_STATUS.PENDING : OFFER_STATUS.ACTIVE;
    const trendingRequest = !!offerData.request_trending;

    const offer = await offerRepository.createOffer(partnerId, {
      ...offerData,
      applicable_days: normalizedDays,
      image_url: finalImageUrl,
      menu_item_id: finalMenuItemId,
      service_type: finalServiceType,
      original_price: discountValues.original_price,
      discounted_price: discountValues.discounted_price,
      discount_percentage: discountValues.discount_percentage,
      discount_amount: discountValues.discount_amount,
      savings: discountValues.savings,
      ezt_equivalent: discountValues.ezt_equivalent,
      featured_request_pending: trendingRequest,
      is_trending: false,
      forced_by_admin: false,
      status: scheduleStatus === 'expired' ? OFFER_STATUS.EXPIRED : desiredStatus
    });

    emitRealtimeEvent(REALTIME_EVENTS.DEAL_UPDATED, {
      action: 'created',
      offerId: offer.id,
      partnerId: offer.partner_id || partnerId,
      serviceType: offer.service_type,
      status: offer.status,
      isTrending: Boolean(offer.is_trending),
      title: offer.title,
      startDate: offer.start_date,
      endDate: offer.end_date,
      timestamp: new Date().toISOString()
    });

    return offer;
  } catch (error) {
    if (error instanceof AppError) throw error;
    logError('Create offer error:', error);
    throw new AppError(500, `Failed to create offer: ${error.message}`);
  }
}

async function updateOffer(partnerId, offerId, updates) {
  try {
    const partner = await partnerRepository.getPartnerById(partnerId);
    if (!partner) {
      throw new AppError(404, 'Partner not found');
    }

    const existingOffer = await offerRepository.getOfferForUpdate(partnerId, offerId);
    if (!existingOffer) {
      throw new AppError(404, 'Offer not found');
    }

    const newStart = updates.start_date ? new Date(updates.start_date) : null;
    const newEnd = updates.end_date ? new Date(updates.end_date) : null;
    const now = new Date();

    if (newStart && isNaN(newStart.getTime())) {
      throw new AppError(400, 'Invalid start date');
    }
    if (newEnd && isNaN(newEnd.getTime())) {
      throw new AppError(400, 'Invalid end date');
    }
    if (newStart) {
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
      if (newStart < fiveMinutesAgo) {
        throw new AppError(400, 'Start date must be within 5 minutes of current time or in the future');
      }
    }
    if (newStart && newEnd && newEnd <= newStart) {
      throw new AppError(400, 'End date must be after start date');
    }
    if (!newStart && newEnd) {
      const existingStart = new Date(existingOffer.start_date);
      if (newEnd <= existingStart) {
        throw new AppError(400, 'End date must be after start date');
      }
    }

    let finalImageUrl = updates.image_url;
    if (updates.image_base64) {
      if (existingOffer.image_url) {
        deleteOldImage(existingOffer.image_url);
      }
      finalImageUrl = await handleOfferImageUpload(updates.image_base64, updates.image_filename);
    } else if (finalImageUrl) {
      finalImageUrl = sanitizeImageUrl(finalImageUrl);
    }

    const payload = { ...updates, image_url: finalImageUrl };

    delete payload.status;
    delete payload.is_trending;
    delete payload.is_promoted; // Backward compatibility
    delete payload.forced_by_admin;
    delete payload.featured_request_pending;

    if (payload.request_trending) {
      payload.featured_request_pending = true;
      payload.is_trending = false;
      delete payload.request_trending;
    }

    if (payload.applicable_days) {
      payload.applicable_days = normalizeApplicableDays(payload.applicable_days);
    }

    if (
      payload.original_price !== undefined ||
      payload.discounted_price !== undefined ||
      payload.discount_percentage !== undefined ||
      payload.discount_amount !== undefined
    ) {
      const discountValues = deriveDiscountValues({
        original_price: payload.original_price ?? existingOffer.original_price,
        discount_percentage: payload.discount_percentage ?? existingOffer.discount_percentage,
        discount_amount: payload.discount_amount ?? existingOffer.discount_amount,
        discounted_price: payload.discounted_price ?? existingOffer.discounted_price
      });
      payload.original_price = discountValues.original_price;
      payload.discounted_price = discountValues.discounted_price;
      payload.discount_percentage = discountValues.discount_percentage;
      payload.discount_amount = discountValues.discount_amount;
      payload.savings = discountValues.savings;
      payload.ezt_equivalent = discountValues.ezt_equivalent;
    }

    const updatedOffer = await offerRepository.updateOffer(partnerId, offerId, payload);

    emitRealtimeEvent(REALTIME_EVENTS.DEAL_UPDATED, {
      action: 'updated',
      offerId: updatedOffer.id,
      partnerId: updatedOffer.partner_id || existingOffer.partner_id || partnerId,
      serviceType: updatedOffer.service_type,
      status: updatedOffer.status,
      isTrending: Boolean(updatedOffer.is_trending),
      title: updatedOffer.title,
      startDate: updatedOffer.start_date,
      endDate: updatedOffer.end_date,
      timestamp: new Date().toISOString()
    });

    return updatedOffer;
  } catch (error) {
    if (error instanceof AppError) throw error;
    logError('Update offer error:', error);
    throw new AppError(500, `Failed to update offer: ${error.message}`);
  }
}

async function deleteOffer(partnerId, offerId) {
  try {
    const partner = await partnerRepository.getPartnerById(partnerId);
    if (!partner) {
      throw new AppError(404, 'Partner not found');
    }

    const deleted = await offerRepository.deleteOffer(partnerId, offerId);
    if (!deleted) {
      throw new AppError(404, 'Offer not found');
    }

    emitRealtimeEvent(REALTIME_EVENTS.DEAL_UPDATED, {
      action: 'deleted',
      offerId: offerId,
      partnerId,
      timestamp: new Date().toISOString()
    });

    return { deleted: true, id: offerId };
  } catch (error) {
    if (error instanceof AppError) throw error;
    logError('Delete offer error:', error);
    throw new AppError(500, `Failed to delete offer: ${error.message}`);
  }
}

async function listPublicOffers(filters = {}) {
  const {
    is_active: isActiveParam,
    service_type: serviceTypeParam = null,
    trending = null,
    limit: limitParam,
    admin = false
  } = filters || {};

  const normalizedLimit = Number.isFinite(parseInt(limitParam, 10))
    ? Math.min(Math.max(parseInt(limitParam, 10), 1), 1000)
    : 100;

  const enforceActiveFilters = isActiveParam === false ? false : !admin;
  const includeExpired = Boolean(filters.include_expired);

  const repoFilters = {
    status: enforceActiveFilters ? OFFER_STATUS.ACTIVE : null,
    not_expired: includeExpired ? false : enforceActiveFilters,
    has_started: false,
    service_type: serviceTypeParam || null,
    trending: trending === true ? true : null,
    limit: normalizedLimit,
    admin: Boolean(admin),
    partner_ids: filters.partner_ids && Array.isArray(filters.partner_ids) ? filters.partner_ids : null,
  };

  log('[offerService] listPublicOffers request', {
    rawFilters: filters,
    normalizedLimit,
    repoFilters
  });

  try {
    const offers = await offerRepository.listPublicOffers(repoFilters);
    const normalizedOffers = normalizeOffers(offers);
    log('[offerService] listPublicOffers response', {
      count: normalizedOffers.length,
      sample: normalizedOffers.slice(0, 2).map((offer) => ({
        id: offer.id,
        title: offer.title,
        status: offer.status,
        is_active: offer.is_active
      }))
    });
    return normalizedOffers;
  } catch (error) {
    logError('List public offers error:', error);
    throw new AppError(500, `Failed to list offers: ${error.message}`);
  }
}

async function getPublicOfferById(offerId) {
  const offer = await offerRepository.getOfferById(offerId, true);
  if (!offer) return null;
  const { getS3FileUrl } = require('../../utils/s3Bucket');
  return {
    ...offer,
    image_url: offer.image_url ? getS3FileUrl(offer.image_url) : null,
    perk_type: offer.perk_type || 'discount',
    perk_description: offer.perk_description || null
  };
}

module.exports = {
  listOffersByPartner,
  createOffer,
  updateOffer,
  deleteOffer,
  listPublicOffers,
  getPublicOfferById
};

