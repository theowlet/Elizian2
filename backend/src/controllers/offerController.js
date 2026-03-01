const offerService = require("../services/offerService");
const offerSlotsService = require("../services/offerSlotsService");
const { successResponse, errorResponse } = require("../../utils/response");
const { logError } = require("../../utils/logger");
const { getS3FileUrl } = require("../../utils/s3Bucket");

function validateCoPayBody(body) {
  if (body.co_pay_percentage === undefined || body.co_pay_percentage === null) return;
  const v = Number(body.co_pay_percentage);
  if (Number.isNaN(v) || v < 0 || v > 100) {
    const err = new Error("Co-pay percentage must be a number between 0 and 100");
    err.statusCode = 400;
    throw err;
  }
}

// List offers by partner
async function listOffers(req, res) {
  try {
    const { id } = req.params;
    const offers = await offerService.listOffersByPartner(id);
    const defaultOfferKey = 'uploads/default-offer.jpg';
    const normalized = offers.map((item) => ({
      ...item,
      image_url: item.image_url ? getS3FileUrl(item.image_url) : getS3FileUrl(defaultOfferKey),
      co_pay_percentage: item.co_pay_percentage != null ? item.co_pay_percentage : null,
    }));

    console.log("partner offer list", normalized);
    successResponse(res, 200, "Partner offers retrieved successfully", normalized);
  } catch (err) {
    logError("Partner offers fetch error:", err);
    errorResponse(
      res,
      err.statusCode || 500,
      err.message || "Failed to fetch partner offers",
    );
  }
}

// Get single offer by partner (for edit form)
async function getOffer(req, res) {
  try {
    const { id: partnerId, offerId } = req.params;
    const offer = await offerService.getOfferByPartner(partnerId, offerId);
    const { getS3FileUrl } = require("../../utils/s3Bucket");
    const defaultOfferKey = 'uploads/default-offer.jpg';
    const response = {
      ...offer,
      image_url: offer.image_url ? getS3FileUrl(offer.image_url) : getS3FileUrl(defaultOfferKey),
      co_pay_percentage: offer.co_pay_percentage != null ? offer.co_pay_percentage : null,
    };
    successResponse(res, 200, "Offer retrieved successfully", response);
  } catch (err) {
    logError("Partner offer fetch error:", err);
    errorResponse(
      res,
      err.statusCode || 500,
      err.message || "Failed to fetch offer",
    );
  }
}

// Create offer
async function createOffer(req, res) {
  try {
    validateCoPayBody(req.body);
    const { id } = req.params;
    console.log(
      "[offerController] Received request body keys:",
      Object.keys(req.body),
    );
    console.log("[offerController] Has image_base64:", !!req.body.image_base64);
    console.log("[offerController] Has image_url:", !!req.body.image_url);
    console.log(
      "[offerController] image_base64 length:",
      req.body.image_base64 ? req.body.image_base64.length : 0,
    );

    const offer = await offerService.createOffer(id, req.body, {
      actorUserId: req.user?.id,
      actorPartnerId: req.partnerId
    });
    // Use consistent response format
    successResponse(res, 201, "Offer created successfully", offer);
  } catch (err) {
    logError("Offer creation error:", err);
    errorResponse(
      res,
      err.statusCode || 500,
      err.message || "Failed to create offer",
    );
  }
}

// Update offer
async function updateOffer(req, res) {
  try {
    validateCoPayBody(req.body);
    const { partnerId, offerId } = req.params;
    const offer = await offerService.updateOffer(partnerId, offerId, req.body, {
      actorUserId: req.user?.id,
      actorPartnerId: req.partnerId
    });
    successResponse(res, 200, "Offer updated successfully", offer);
  } catch (err) {
    logError("Offer update error:", err);
    errorResponse(
      res,
      err.statusCode || 500,
      err.message || "Failed to update offer",
    );
  }
}

// Delete offer
async function deleteOffer(req, res) {
  try {
    const { partnerId, offerId } = req.params;
    await offerService.deleteOffer(partnerId, offerId, {
      actorUserId: req.user?.id,
      actorPartnerId: req.partnerId
    });
    successResponse(res, 200, "Offer deleted successfully");
  } catch (err) {
    logError("Offer deletion error:", err);
    errorResponse(
      res,
      err.statusCode || 500,
      err.message || "Failed to delete offer",
    );
  }
}

// List public offers (for frontend)
async function listPublicOffers(req, res) {
  try {
    // Validate and sanitize inputs
    const rawLimit = parseInt(req.query.limit, 10);
    const limit = rawLimit > 0 && rawLimit <= 1000 ? rawLimit : 100;

    const validServiceTypes = [
      "dining",
      "events",
      "spa-and-salon",
      "wellness",
      "travel",
      "healthcare",
      "others",
    ];
    const serviceType =
      req.query.service_type &&
      validServiceTypes.includes(req.query.service_type)
        ? req.query.service_type
        : null;

    // Parse cuisine types (comma-separated or array)
    let cuisineTypes = null;
    if (req.query.cuisine_types) {
      if (Array.isArray(req.query.cuisine_types)) {
        cuisineTypes = req.query.cuisine_types;
      } else if (typeof req.query.cuisine_types === "string") {
        cuisineTypes = req.query.cuisine_types
          .split(",")
          .map((c) => c.trim())
          .filter((c) => c);
      }
    }

    // Parse price range
    const priceMin = req.query.price_min
      ? parseFloat(req.query.price_min)
      : null;
    const priceMax = req.query.price_max
      ? parseFloat(req.query.price_max)
      : null;

    // Parse rating
    const minRating = req.query.min_rating
      ? parseFloat(req.query.min_rating)
      : null;

    // Parse location for distance filtering
    const userLat = req.query.user_latitude
      ? parseFloat(req.query.user_latitude)
      : null;
    const userLng = req.query.user_longitude
      ? parseFloat(req.query.user_longitude)
      : null;
    const maxDistance = req.query.max_distance_km
      ? parseFloat(req.query.max_distance_km)
      : null;

    // Dynamic (category-specific) filter params — optional, backward compatible
    const parseArray = (v) => {
      if (!v) return null;
      if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
      return String(v).split(",").map((c) => c.trim()).filter(Boolean);
    };
    const mealType = parseArray(req.query.meal_type);
    const therapyType = parseArray(req.query.therapy_type);
    const eventType = parseArray(req.query.event_type);
    const specialization = parseArray(req.query.specialization);
    const durationMin = req.query.duration_min != null ? parseInt(req.query.duration_min, 10) : null;
    const durationMax = req.query.duration_max != null ? parseInt(req.query.duration_max, 10) : null;
    const eventDate = req.query.event_date && /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.event_date).trim()) ? String(req.query.event_date).trim() : null;
    const starRating = req.query.star_rating != null ? parseInt(req.query.star_rating, 10) : null;
    const refundable = req.query.refundable === "true" ? true : null;

    const filters = {
      is_active: req.query.is_active === "false" ? false : true,
      service_type: serviceType,
      trending: req.query.trending === "true" ? true : null,
      limit: limit,
      admin: req.query.admin === "true",
      include_expired: req.query.include_expired === "true",
      cuisine_types: cuisineTypes,
      price_min: priceMin,
      price_max: priceMax,
      min_rating: minRating,
      user_latitude: userLat,
      user_longitude: userLng,
      max_distance_km: maxDistance,
      meal_type: mealType?.length ? mealType : null,
      therapy_type: therapyType?.length ? therapyType : null,
      duration_min: Number.isFinite(durationMin) ? durationMin : null,
      duration_max: Number.isFinite(durationMax) ? durationMax : null,
      event_type: eventType?.length ? eventType : null,
      event_date: eventDate,
      star_rating: Number.isFinite(starRating) ? starRating : null,
      refundable,
      specialization: specialization?.length ? specialization : null,
    };

    const offers = await offerService.listPublicOffers(filters);
    // Log for debugging
    console.log(
      `[offerController] listPublicOffers: Found ${offers.length} offers with filters:`,
      filters,
    );
    if (offers.length > 0) {
      console.log(
        `[offerController] Sample offer statuses:`,
        offers
          .slice(0, 3)
          .map((o) => ({
            id: o.id,
            status: o.status,
            is_active: o.is_active,
            title: o.title,
          })),
      );
    }
    successResponse(res, 200, "Offers retrieved successfully", offers);
  } catch (err) {
    logError("Public offers fetch error:", err);
    errorResponse(
      res,
      err.statusCode || 500,
      err.message || "Failed to fetch offers",
    );
  }
}

// Get available slots for an offer (Dining: 30-min grid; Events: fixed slots)
async function getAvailableSlots(req, res) {
  try {
    const { offerId } = req.params;
    const date = req.query.date && /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date).trim())
      ? String(req.query.date).trim()
      : null;
    const partySize = req.query.partySize != null ? Math.max(1, parseInt(req.query.partySize, 10) || 1) : 1;

    if (!date) {
      return errorResponse(res, 400, "Query parameter 'date' (YYYY-MM-DD) is required");
    }

    const result = await offerSlotsService.getAvailableSlotsForOffer(offerId, date, partySize);
    const slots = Array.isArray(result?.slots) ? result.slots : [];
    const event_date = result?.event_date || undefined;
    successResponse(res, 200, "Slots retrieved", { slots, event_date });
  } catch (err) {
    logError("Get available slots error:", err);
    errorResponse(res, err.statusCode || 500, err.message || "Failed to fetch slots");
  }
}

// Get single public offer by ID (e.g. for event detail page)
async function getPublicOfferById(req, res) {
  try {
    const { offerId } = req.params;
    const offer = await offerService.getPublicOfferById(offerId);
    if (!offer) {
      return errorResponse(res, 404, "Offer not found");
    }
    successResponse(res, 200, "Offer retrieved successfully", offer);
  } catch (err) {
    logError("Get public offer error:", err);
    errorResponse(
      res,
      err.statusCode || 500,
      err.message || "Failed to fetch offer",
    );
  }
}

module.exports = {
  listOffers,
  getOffer,
  createOffer,
  updateOffer,
  deleteOffer,
  listPublicOffers,
  getPublicOfferById,
  getAvailableSlots,
};
