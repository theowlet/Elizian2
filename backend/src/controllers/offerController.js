const offerService = require("../services/offerService");
const { successResponse, errorResponse } = require("../../utils/response");
const { logError } = require("../../utils/logger");
const {getS3FileUrl} = require("../../utils/s3Bucket")

// List offers by partner
async function listOffers(req, res) {
  try {
    const { id } = req.params;
    const offers = await offerService.listOffersByPartner(id);
    offers.forEach((item) => {
      item.image_url = getS3FileUrl(item.image_url);
    });

    console.log("partner offer list", offers);
    successResponse(res, 200, "Partner offers retrieved successfully", offers);
  } catch (err) {
    logError("Partner offers fetch error:", err);
    errorResponse(
      res,
      err.statusCode || 500,
      err.message || "Failed to fetch partner offers",
    );
  }
}

// Create offer
async function createOffer(req, res) {
  try {
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

    const offer = await offerService.createOffer(id, req.body);
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
    const { partnerId, offerId } = req.params;
    const offer = await offerService.updateOffer(partnerId, offerId, req.body);
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
    await offerService.deleteOffer(partnerId, offerId);
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

    const filters = {
      is_active: req.query.is_active === "false" ? false : true, // Default to true
      service_type: serviceType,
      trending: req.query.trending === "true" ? true : null,
      limit: limit,
      admin: req.query.admin === "true",
      cuisine_types: cuisineTypes,
      price_min: priceMin,
      price_max: priceMax,
      min_rating: minRating,
      user_latitude: userLat,
      user_longitude: userLng,
      max_distance_km: maxDistance,
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

module.exports = {
  listOffers,
  createOffer,
  updateOffer,
  deleteOffer,
  listPublicOffers,
};
