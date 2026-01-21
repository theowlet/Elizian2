const express = require('express');
const router = express.Router();
const preOrderService = require('../services/preOrderService');
const authenticateToken = require('../../middleware/authenticateToken');
const { successResponse, errorResponse } = require('../../utils/response');
const { logError } = require('../../utils/logger');

// Check if user can pre-order
router.get('/pre-orders/can-order', authenticateToken, async (req, res) => {
  try {
    const canOrder = await preOrderService.canPreOrder(req.userId);
    successResponse(res, 200, 'Pre-order eligibility checked', { canPreOrder: canOrder });
  } catch (error) {
    logError('Error checking pre-order eligibility:', error);
    errorResponse(res, error.statusCode || 500, error.message || 'Failed to check eligibility');
  }
});

// Create pre-order (Echelon tier only)
router.post('/pre-orders', authenticateToken, async (req, res) => {
  try {
    const {
      bookingId,
      reservationId,
      partnerId,
      items,
      totalAmount,
      specialInstructions,
      dietaryRequirements
    } = req.body;

    if (!bookingId || !partnerId || !items || !Array.isArray(items) || items.length === 0) {
      return errorResponse(res, 400, 'Missing required fields: bookingId, partnerId, items');
    }

    const preOrder = await preOrderService.createPreOrder({
      booking_id: bookingId,
      reservation_id: reservationId,
      partner_id: partnerId,
      user_id: req.userId,
      items,
      total_amount: totalAmount,
      special_instructions: specialInstructions,
      dietary_requirements: dietaryRequirements
    });

    successResponse(res, 201, 'Pre-order created successfully', preOrder);
  } catch (error) {
    logError('Error creating pre-order:', error);
    errorResponse(res, error.statusCode || 500, error.message || 'Failed to create pre-order');
  }
});

// Get pre-order by ID
router.get('/pre-orders/:id', authenticateToken, async (req, res) => {
  try {
    const preOrder = await preOrderService.getPreOrder(req.params.id);
    successResponse(res, 200, 'Pre-order retrieved', preOrder);
  } catch (error) {
    logError('Error getting pre-order:', error);
    errorResponse(res, error.statusCode || 500, error.message || 'Failed to get pre-order');
  }
});

// Partner: Get pre-orders for their restaurant
router.get('/partners/pre-orders', authenticateToken, async (req, res) => {
  try {
    // TODO: Verify user is a partner
    const { partnerId, status } = req.query;
    
    if (!partnerId) {
      return errorResponse(res, 400, 'partnerId is required');
    }

    const preOrders = await preOrderService.getPartnerPreOrders(partnerId, status);
    successResponse(res, 200, 'Pre-orders retrieved', preOrders);
  } catch (error) {
    logError('Error getting partner pre-orders:', error);
    errorResponse(res, error.statusCode || 500, error.message || 'Failed to get pre-orders');
  }
});

// Partner: Update pre-order status
router.patch('/partners/pre-orders/:id/status', authenticateToken, async (req, res) => {
  try {
    const { status, estimatedReadyTime } = req.body;
    
    if (!status) {
      return errorResponse(res, 400, 'status is required');
    }

    const preOrder = await preOrderService.updatePreOrderStatus(
      req.params.id,
      status,
      estimatedReadyTime
    );
    successResponse(res, 200, 'Pre-order status updated', preOrder);
  } catch (error) {
    logError('Error updating pre-order status:', error);
    errorResponse(res, error.statusCode || 500, error.message || 'Failed to update status');
  }
});

module.exports = router;

