const offerService = require('../services/offerService');
const { successResponse, errorResponse } = require('../../utils/response');
const { logError } = require('../../utils/logger');

// List offers by partner
async function listOffers(req, res) {
  try {
    const { id } = req.params;
    const offers = await offerService.listOffersByPartner(id);
    successResponse(res, 200, "Partner offers retrieved successfully", offers);
  } catch (err) {
    logError("Partner offers fetch error:", err);
    errorResponse(res, err.statusCode || 500, err.message || "Failed to fetch partner offers");
  }
}

// Create offer
async function createOffer(req, res) {
  try {
    const { id } = req.params;
    console.log('[offerController] Received request body keys:', Object.keys(req.body));
    console.log('[offerController] Has image_base64:', !!req.body.image_base64);
    console.log('[offerController] Has image_url:', !!req.body.image_url);
    console.log('[offerController] image_base64 length:', req.body.image_base64 ? req.body.image_base64.length : 0);
    
    const offer = await offerService.createOffer(id, req.body);
    // Use consistent response format
    successResponse(res, 201, "Offer created successfully", offer);
  } catch (err) {
    logError("Offer creation error:", err);
    errorResponse(res, err.statusCode || 500, err.message || "Failed to create offer");
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
    errorResponse(res, err.statusCode || 500, err.message || "Failed to update offer");
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
    errorResponse(res, err.statusCode || 500, err.message || "Failed to delete offer");
  }
}

// List public offers (for frontend)
async function listPublicOffers(req, res) {
  try {
    // Validate and sanitize inputs
    const rawLimit = parseInt(req.query.limit, 10);
    const limit = (rawLimit > 0 && rawLimit <= 1000) ? rawLimit : 100;
    
    const validServiceTypes = ['dining', 'events', 'spa-and-salon', 'wellness', 'travel', 'healthcare', 'others'];
    const serviceType = req.query.service_type && validServiceTypes.includes(req.query.service_type) 
      ? req.query.service_type 
      : null;
    
    const filters = {
      is_active: req.query.is_active === 'false' ? false : true, // Default to true
      service_type: serviceType,
      trending: req.query.trending === 'true' ? true : null,
      limit: limit,
      admin: req.query.admin === 'true'
    };
    
    const offers = await offerService.listPublicOffers(filters);
    // Log for debugging
    console.log(`[offerController] listPublicOffers: Found ${offers.length} offers with filters:`, filters);
    if (offers.length > 0) {
      console.log(`[offerController] Sample offer statuses:`, offers.slice(0, 3).map(o => ({ id: o.id, status: o.status, is_active: o.is_active, title: o.title })));
    }
    successResponse(res, 200, "Offers retrieved successfully", offers);
  } catch (err) {
    logError("Public offers fetch error:", err);
    errorResponse(res, err.statusCode || 500, err.message || "Failed to fetch offers");
  }
}

module.exports = {
  listOffers,
  createOffer,
  updateOffer,
  deleteOffer,
  listPublicOffers
};

