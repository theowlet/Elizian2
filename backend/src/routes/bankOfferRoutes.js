const express = require('express');
const router = express.Router();
const bankOfferService = require('../services/bankOfferService');
const authenticateToken = require('../../middleware/authenticateToken');
const requireSuperAdmin = require('../middleware/requireSuperAdmin');
const { successResponse, errorResponse } = require('../../utils/response');
const { logError } = require('../../utils/logger');

// Get all active bank offers (public)
router.get('/bank-offers', async (req, res) => {
  try {
    const offers = await bankOfferService.getAllBankOffers();
    successResponse(res, 200, 'Bank offers retrieved successfully', offers);
  } catch (error) {
    logError('Error getting bank offers:', error);
    errorResponse(res, error.statusCode || 500, error.message || 'Failed to retrieve bank offers');
  }
});

// Get applicable bank offers for a booking
router.get('/bank-offers/applicable', authenticateToken, async (req, res) => {
  try {
    const { orderAmount, partnerId, categoryId } = req.query;
    
    if (!orderAmount) {
      return errorResponse(res, 400, 'orderAmount is required');
    }

    const offers = await bankOfferService.getApplicableOffers(
      parseFloat(orderAmount),
      req.userId,
      partnerId || null,
      categoryId || null
    );

    successResponse(res, 200, 'Applicable bank offers retrieved', offers);
  } catch (error) {
    logError('Error getting applicable offers:', error);
    errorResponse(res, error.statusCode || 500, error.message || 'Failed to retrieve applicable offers');
  }
});

// Calculate discount for a specific offer
router.post('/bank-offers/calculate', authenticateToken, async (req, res) => {
  try {
    const { ruleId, orderAmount } = req.body;
    
    if (!ruleId || !orderAmount) {
      return errorResponse(res, 400, 'ruleId and orderAmount are required');
    }

    const result = await bankOfferService.calculateDiscount(ruleId, parseFloat(orderAmount));
    successResponse(res, 200, 'Discount calculated', result);
  } catch (error) {
    logError('Error calculating discount:', error);
    errorResponse(res, error.statusCode || 500, error.message || 'Failed to calculate discount');
  }
});

// Admin: Create/Update bank offer
router.post('/admin/bank-offers', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const bankOffer = await bankOfferService.upsertBankOffer(req.body);
    successResponse(res, 200, 'Bank offer saved successfully', bankOffer);
  } catch (error) {
    logError('Error saving bank offer:', error);
    errorResponse(res, error.statusCode || 500, error.message || 'Failed to save bank offer');
  }
});

// Admin: Create/Update bank offer rule
router.post('/admin/bank-offers/rules', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const rule = await bankOfferService.upsertBankOfferRule(req.body);
    successResponse(res, 200, 'Bank offer rule saved successfully', rule);
  } catch (error) {
    logError('Error saving bank offer rule:', error);
    errorResponse(res, error.statusCode || 500, error.message || 'Failed to save bank offer rule');
  }
});

module.exports = router;

