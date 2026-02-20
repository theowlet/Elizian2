const orderRepository = require('../repositories/orderRepository');
const partnerRepository = require('../repositories/partnerRepository');
const { AppError } = require('../../utils/response');
const { logError } = require('../../utils/logger');
const { handleImageUpload, deleteOldImage } = require('../utils/imageUpload');

// List orders for a partner
async function listOrders(partnerId, filters = {}) {
  try {
    const partner = await partnerRepository.getPartnerById(partnerId);
    if (!partner) {
      throw new AppError(404, "Partner not found");
    }
    return await orderRepository.listOrders(partnerId, filters);
  } catch (error) {
    if (error instanceof AppError) throw error;
    logError('List orders error:', error);
    throw new AppError(500, `Failed to list orders: ${error.message}`);
  }
}

// Update order status (with optional image upload)
async function updateOrderStatus(partnerId, orderId, status, notes = null, updates = {}) {
  try {
    const partner = await partnerRepository.getPartnerById(partnerId);
    if (!partner) {
      throw new AppError(404, "Partner not found");
    }

    const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled'];
    if (status && !validStatuses.includes(status)) {
      throw new AppError(400, "Invalid status");
    }

    // Get existing order to check for old image
    const existingOrder = await orderRepository.getOrderById(partnerId, orderId);
    if (!existingOrder) {
      throw new AppError(404, "Order not found");
    }

    // Handle image upload if provided
    let finalImageUrl = updates.image_url;
    if (updates.image_base64) {
      // Delete old image if it exists
      if (existingOrder.image_url) {
        deleteOldImage(existingOrder.image_url);
      }
      
      // Upload new image
      finalImageUrl = handleImageUpload(
        updates.image_base64,
        updates.image_filename,
        'orders',
        'order'
      );
    }

    // Update order with status, notes, and image
    const updated = await orderRepository.updateOrderStatus(
      partnerId, 
      orderId, 
      status || existingOrder.status, 
      notes,
      finalImageUrl !== undefined ? finalImageUrl : existingOrder.image_url
    );
    
    if (!updated) {
      throw new AppError(404, "Order not found");
    }
    
    return updated;
  } catch (error) {
    if (error instanceof AppError) throw error;
    logError('Update order error:', error);
    throw new AppError(500, `Failed to update order: ${error.message}`);
  }
}

module.exports = {
  listOrders,
  updateOrderStatus
};

