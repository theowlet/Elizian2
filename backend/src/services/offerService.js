const offerRepository = require('../repositories/offerRepository');
const eventSlotsRepository = require('../repositories/eventSlotsRepository');
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
const { ensureOffersHaveImageUrl } = require('../utils/offerImageUrl');
const { createAuditLogEntry } = require('../../utils/audit');

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

async function getOfferByPartner(partnerId, offerId) {
  try {
    const partner = await partnerRepository.getPartnerById(partnerId);
    if (!partner) {
      throw new AppError(404, 'Partner not found');
    }
    const offer = await offerRepository.getOfferByPartnerAndId(partnerId, offerId);
    if (!offer) {
      throw new AppError(404, 'Offer not found');
    }
    if (String(offer.service_type || '').toLowerCase() === 'events') {
      try {
        offer.event_slots = await eventSlotsRepository.listByOffer(offerId);
      } catch (_) {
        offer.event_slots = [];
      }
    }
    return offer;
  } catch (error) {
    if (error instanceof AppError) throw error;
    logError('Get offer by partner error:', error);
    throw new AppError(500, `Failed to get offer: ${error.message}`);
  }
}

async function createOffer(partnerId, offerData, options = {}) {
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

    const coPayInput = offerData.co_pay_percentage != null ? Number(offerData.co_pay_percentage) : null;
    if (coPayInput != null && (Number.isNaN(coPayInput) || coPayInput < 0 || coPayInput > 100)) {
      throw new AppError(400, 'Co-pay percentage must be a number between 0 and 100');
    }
    const normalizedCoPay = coPayInput != null && Number.isFinite(coPayInput)
      ? Math.round(coPayInput * 100) / 100
      : null;
    const offerDataWithNormalizedCoPay = { ...offerData, co_pay_percentage: normalizedCoPay };

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
      original_price: finalOriginalPrice || offerDataWithNormalizedCoPay.original_price,
      co_pay_percentage: offerDataWithNormalizedCoPay.co_pay_percentage,
      discount_amount: offerDataWithNormalizedCoPay.discount_amount,
      discounted_price: offerDataWithNormalizedCoPay.discounted_price
    });

    const normalizedDays = normalizeApplicableDays(offerData.applicable_days);
    const desiredStatus = approvalRequired ? OFFER_STATUS.PENDING : OFFER_STATUS.ACTIVE;
    const trendingRequest = !!offerData.request_trending;

    const { event_slots: eventSlotsPayload, ...offerDataForRepo } = offerData;
    const offer = await offerRepository.createOffer(partnerId, {
      ...offerDataForRepo,
      applicable_days: normalizedDays,
      image_url: finalImageUrl,
      menu_item_id: finalMenuItemId,
      service_type: finalServiceType,
      original_price: discountValues.original_price,
      discounted_price: discountValues.discounted_price,
      co_pay_percentage: discountValues.co_pay_percentage,
      discount_amount: discountValues.discount_amount,
      savings: discountValues.savings,
      ezt_equivalent: discountValues.ezt_equivalent,
      featured_request_pending: trendingRequest,
      is_trending: false,
      forced_by_admin: false,
      status: scheduleStatus === 'expired' ? OFFER_STATUS.EXPIRED : desiredStatus
    });

    if (String(finalServiceType || '').toLowerCase() === 'events' && Array.isArray(eventSlotsPayload) && eventSlotsPayload.length > 0) {
      try {
        await eventSlotsRepository.upsertForOffer(offer.id, eventSlotsPayload);
      } catch (slotsErr) {
        logError('Event slots upsert failed (offer created):', slotsErr);
      }
    }

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

    try {
      await createAuditLogEntry(
        options.actorUserId || null,
        'partner create deal',
        'offer',
        offer.id,
        {
          previous: null,
          next: {
            title: offer.title,
            co_pay_percentage: offer.co_pay_percentage,
            image_url: offer.image_url,
            perk_type: offer.perk_type,
            perk_description: offer.perk_description,
            start_date: offer.start_date,
            end_date: offer.end_date,
            status: offer.status,
            partner_id: partnerId
          },
          partner_id: partnerId,
          actor_partner_id: options.actorPartnerId
        }
      );
    } catch (auditErr) {
      logError('Audit log create offer failed:', auditErr);
    }

    return offer;
  } catch (error) {
    if (error instanceof AppError) throw error;
    logError('Create offer error:', error);
    throw new AppError(500, `Failed to create offer: ${error.message}`);
  }
}

async function updateOffer(partnerId, offerId, updates, options = {}) {
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
      const existingStart = new Date(existingOffer.start_date);
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
      // Only reject when changing to a new past date; allow keeping existing (past) start when editing
      const within24h = Math.abs(existingStart.getTime() - newStart.getTime()) < 24 * 60 * 60 * 1000;
      const existingWasInPast = existingStart < fiveMinutesAgo;
      if (!within24h && newStart < fiveMinutesAgo && !existingWasInPast) {
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

    const coPayInput = updates.co_pay_percentage != null ? Number(updates.co_pay_percentage) : null;
    if (coPayInput != null && (Number.isNaN(coPayInput) || coPayInput < 0 || coPayInput > 100)) {
      throw new AppError(400, 'Co-pay percentage must be a number between 0 and 100');
    }
    const normalizedCoPayUpdate = coPayInput != null && Number.isFinite(coPayInput)
      ? Math.round(coPayInput * 100) / 100
      : undefined;
    if (normalizedCoPayUpdate !== undefined) {
      updates = { ...updates, co_pay_percentage: normalizedCoPayUpdate };
    }

    let finalImageUrl = updates.image_url;
    if (updates.image_base64) {
      if (existingOffer.image_url) {
        deleteOldImage(existingOffer.image_url);
      }
      finalImageUrl = await handleOfferImageUpload(updates.image_base64, updates.image_filename);
    } else if (finalImageUrl) {
      finalImageUrl = sanitizeImageUrl(finalImageUrl);
    } else if (existingOffer.image_url) {
      // No new upload and no explicit image_url in updates: preserve existing deal image
      finalImageUrl = existingOffer.image_url;
    }

    const { event_slots: eventSlotsPayload, ...updatesForRepo } = updates;
    const payload = { ...updatesForRepo, image_url: finalImageUrl };

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
      payload.co_pay_percentage !== undefined ||
      payload.discount_amount !== undefined
    ) {
      const perkType = String(payload.perk_type ?? existingOffer.perk_type ?? '').toLowerCase();
      const isFixedPrice = perkType === 'fixed_price_deal' || perkType === 'free_item';

      if (isFixedPrice && (payload.discounted_price != null && payload.discounted_price !== '')) {
        // Fixed Price deal: use explicit prices, do NOT recalculate from co_pay_percentage
        const orig = payload.original_price != null && payload.original_price !== '' ? Number(payload.original_price) : (existingOffer.original_price ?? null);
        const disc = Number(payload.discounted_price);
        payload.original_price = Number.isFinite(orig) && orig >= 0 ? orig : null;
        payload.discounted_price = Number.isFinite(disc) && disc >= 0 ? disc : (existingOffer.discounted_price ?? null);
        payload.savings = (payload.original_price != null && payload.discounted_price != null && payload.original_price > payload.discounted_price)
          ? payload.original_price - payload.discounted_price
          : 0;
        payload.ezt_equivalent = payload.savings > 0 ? Math.round((payload.savings / 100) * 100) / 100 : 0;
      } else {
        const discountValues = deriveDiscountValues({
          original_price: payload.original_price ?? existingOffer.original_price,
          co_pay_percentage: payload.co_pay_percentage ?? existingOffer.co_pay_percentage,
          discount_amount: payload.discount_amount ?? existingOffer.discount_amount,
          discounted_price: payload.discounted_price ?? existingOffer.discounted_price
        });
        payload.original_price = discountValues.original_price;
        payload.discounted_price = discountValues.discounted_price;
        payload.co_pay_percentage = discountValues.co_pay_percentage;
        payload.discount_amount = discountValues.discount_amount;
        payload.savings = discountValues.savings;
        payload.ezt_equivalent = discountValues.ezt_equivalent;
      }
    }

    const updatedOffer = await offerRepository.updateOffer(partnerId, offerId, payload);

    if (String(updatedOffer.service_type || existingOffer.service_type || '').toLowerCase() === 'events' && eventSlotsPayload !== undefined) {
      try {
        await eventSlotsRepository.upsertForOffer(offerId, Array.isArray(eventSlotsPayload) ? eventSlotsPayload : []);
      } catch (slotsErr) {
        logError('Event slots upsert failed (offer updated):', slotsErr);
      }
    }

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

    try {
      const previous = {
        title: existingOffer.title,
        co_pay_percentage: existingOffer.co_pay_percentage,
        image_url: existingOffer.image_url,
        perk_type: existingOffer.perk_type,
        perk_description: existingOffer.perk_description,
        start_date: existingOffer.start_date,
        end_date: existingOffer.end_date,
        status: existingOffer.status
      };
      const next = {
        title: updatedOffer.title,
        co_pay_percentage: updatedOffer.co_pay_percentage,
        image_url: updatedOffer.image_url,
        perk_type: updatedOffer.perk_type,
        perk_description: updatedOffer.perk_description,
        start_date: updatedOffer.start_date,
        end_date: updatedOffer.end_date,
        status: updatedOffer.status
      };
      await createAuditLogEntry(
        options.actorUserId || null,
        'partner update deal',
        'offer',
        offerId,
        {
          previous,
          next,
          partner_id: partnerId,
          actor_partner_id: options.actorPartnerId
        }
      );
    } catch (auditErr) {
      logError('Audit log update offer failed:', auditErr);
    }

    return updatedOffer;
  } catch (error) {
    if (error instanceof AppError) throw error;
    logError('Update offer error:', error);
    throw new AppError(500, `Failed to update offer: ${error.message}`);
  }
}

async function deleteOffer(partnerId, offerId, options = {}) {
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

    try {
      await createAuditLogEntry(
        options.actorUserId || null,
        'partner delete deal',
        'offer',
        offerId,
        {
          previous: {
            title: deleted.title,
            co_pay_percentage: deleted.co_pay_percentage,
            image_url: deleted.image_url,
            status: deleted.status
          },
          next: null,
          partner_id: partnerId,
          actor_partner_id: options.actorPartnerId
        }
      );
    } catch (auditErr) {
      logError('Audit log delete offer failed:', auditErr);
    }

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
    cuisine_types: filters.cuisine_types && Array.isArray(filters.cuisine_types) && filters.cuisine_types.length > 0 ? filters.cuisine_types : null,
    price_min: filters.price_min != null && Number.isFinite(Number(filters.price_min)) ? Number(filters.price_min) : null,
    price_max: filters.price_max != null && Number.isFinite(Number(filters.price_max)) ? Number(filters.price_max) : null,
    min_rating: filters.min_rating != null && Number.isFinite(Number(filters.min_rating)) ? Number(filters.min_rating) : null,
    user_latitude: filters.user_latitude != null && Number.isFinite(Number(filters.user_latitude)) ? Number(filters.user_latitude) : null,
    user_longitude: filters.user_longitude != null && Number.isFinite(Number(filters.user_longitude)) ? Number(filters.user_longitude) : null,
    max_distance_km: filters.max_distance_km != null && Number.isFinite(Number(filters.max_distance_km)) && Number(filters.max_distance_km) > 0 ? Number(filters.max_distance_km) : null,
    meal_type: filters.meal_type && Array.isArray(filters.meal_type) && filters.meal_type.length > 0 ? filters.meal_type : null,
    therapy_type: filters.therapy_type && Array.isArray(filters.therapy_type) && filters.therapy_type.length > 0 ? filters.therapy_type : null,
    duration_min: filters.duration_min != null && Number.isFinite(Number(filters.duration_min)) ? Number(filters.duration_min) : null,
    duration_max: filters.duration_max != null && Number.isFinite(Number(filters.duration_max)) ? Number(filters.duration_max) : null,
    event_type: filters.event_type && Array.isArray(filters.event_type) && filters.event_type.length > 0 ? filters.event_type : null,
    event_date: filters.event_date || null,
    star_rating: filters.star_rating != null && Number.isFinite(Number(filters.star_rating)) ? Number(filters.star_rating) : null,
    refundable: filters.refundable === true ? true : null,
    specialization: filters.specialization && Array.isArray(filters.specialization) && filters.specialization.length > 0 ? filters.specialization : null,
  };

  log('[offerService] listPublicOffers request', {
    rawFilters: filters,
    normalizedLimit,
    repoFilters
  });

  try {
    const offers = await offerRepository.listPublicOffers(repoFilters);
    const normalizedOffers = normalizeOffers(offers);
    const withImageUrl = ensureOffersHaveImageUrl(normalizedOffers);
    log('[offerService] listPublicOffers response', {
      count: withImageUrl.length,
      sample: withImageUrl.slice(0, 2).map((offer) => ({
        id: offer.id,
        title: offer.title,
        status: offer.status,
        is_active: offer.is_active
      }))
    });
    return withImageUrl;
  } catch (error) {
    logError('List public offers error:', error);
    throw new AppError(500, `Failed to list offers: ${error.message}`);
  }
}

// Return public offer by ID. Same eligibility as booking: deal active and within dates, partner not suspended/rejected.
async function getPublicOfferById(offerId) {
  const offer = await offerRepository.getOfferById(offerId, false);
  if (!offer) return null;
  const partnerStatus = offer.partner_status != null ? String(offer.partner_status).toLowerCase().trim() : '';
  if (['suspended', 'rejected'].includes(partnerStatus)) return null;
  const { resolveOfferImageUrl } = require('../utils/offerImageUrl');
  const { getPool } = require('../config/db');
  const pool = getPool();
  let event_date = null;
  if ((offer.service_type || '').toLowerCase() === 'events') {
    try {
      const meta = await pool.query(
        `SELECT em.event_date, po.start_date, po.end_date
         FROM partner_offers po
         LEFT JOIN experience_metadata em ON em.offer_id = po.id
         WHERE po.id = $1`,
        [offerId]
      );
      const row = meta.rows[0];
      const fromMeta = row?.event_date;
      if (fromMeta) {
        const d = fromMeta;
        event_date = typeof d === 'string' ? d.split('T')[0] : (d instanceof Date ? d.toISOString().split('T')[0] : String(d).split('T')[0]);
      } else if (row?.start_date && row?.end_date) {
        const toStr = (d) => (d ? (typeof d === 'string' ? d.split('T')[0] : (d instanceof Date ? d.toISOString().split('T')[0] : String(d).split('T')[0])) : null);
        const s = toStr(row.start_date);
        const e = toStr(row.end_date);
        if (s && e && s === e) event_date = s; // Single-day event: start_date === end_date
      }
    } catch (_) {
      // experience_metadata may not exist; ignore
    }
  }
  return {
    ...offer,
    image_url: resolveOfferImageUrl(offer.image_url),
    perk_type: offer.perk_type || 'discount',
    perk_description: offer.perk_description || null,
    event_date: event_date || undefined,
    experience_metadata: event_date ? { event_date } : undefined
  };
}

module.exports = {
  listOffersByPartner,
  getOfferByPartner,
  createOffer,
  updateOffer,
  deleteOffer,
  listPublicOffers,
  getPublicOfferById
};

