const preOrderRepository = require('../repositories/preOrderRepository');
const { AppError } = require('../../utils/response');
const { logError } = require('../../utils/logger');

// Check if user can pre-order (Echelon tier only)
async function canPreOrder(userId) {
  try {
    return await preOrderRepository.isEchelonTier(userId);
  } catch (error) {
    logError('Error in canPreOrder service:', error);
    return false;
  }
}

// Create pre-order
async function createPreOrder(preOrderData, client) {
  try {
    // Verify Echelon tier
    const canOrder = await canPreOrder(preOrderData.user_id);
    if (!canOrder) {
      throw new AppError(403, 'Pre-ordering is only available for Echelon tier members. Upgrade your tier to access this feature.');
    }

    // Validate items
    if (!preOrderData.items || !Array.isArray(preOrderData.items) || preOrderData.items.length === 0) {
      throw new AppError(400, 'At least one item is required for pre-order');
    }

    // Calculate total if not provided
    let totalAmount = preOrderData.total_amount;
    if (!totalAmount) {
      totalAmount = preOrderData.items.reduce((sum, item) => {
        return sum + (parseFloat(item.price) || 0) * (parseInt(item.quantity) || 1);
      }, 0);
    }

    return await preOrderRepository.createPreOrder({
      ...preOrderData,
      total_amount: totalAmount
    }, client);
  } catch (error) {
    logError('Error in createPreOrder service:', error);
    throw error;
  }
}

// Get pre-order by ID
async function getPreOrder(preOrderId) {
  try {
    const preOrder = await preOrderRepository.getPreOrderById(preOrderId);
    if (!preOrder) {
      throw new AppError(404, 'Pre-order not found');
    }
    return preOrder;
  } catch (error) {
    logError('Error in getPreOrder service:', error);
    throw error;
  }
}

// Update pre-order status (for restaurant)
async function updatePreOrderStatus(preOrderId, status, estimatedReadyTime = null) {
  try {
    const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'served', 'cancelled'];
    if (!validStatuses.includes(status)) {
      throw new AppError(400, `Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    return await preOrderRepository.updatePreOrderStatus(preOrderId, status, estimatedReadyTime);
  } catch (error) {
    logError('Error in updatePreOrderStatus service:', error);
    throw error;
  }
}

// Get partner pre-orders
async function getPartnerPreOrders(partnerId, status = null) {
  try {
    return await preOrderRepository.getPartnerPreOrders(partnerId, status);
  } catch (error) {
    logError('Error in getPartnerPreOrders service:', error);
    throw error;
  }
}

module.exports = {
  canPreOrder,
  createPreOrder,
  getPreOrder,
  updatePreOrderStatus,
  getPartnerPreOrders
};

