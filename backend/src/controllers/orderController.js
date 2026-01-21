const orderService = require('../services/orderService');
const { successResponse, errorResponse } = require('../../utils/response');
const { logError } = require('../../utils/logger');

// List orders
async function listOrders(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.query;
    const orders = await orderService.listOrders(id, { status });
    successResponse(res, 200, "Orders retrieved successfully", orders);
  } catch (err) {
    logError("❌ Orders retrieval error:", err);
    errorResponse(res, err.statusCode || 500, err.message || "Failed to retrieve orders");
  }
}

// Update order status (with optional image upload)
async function updateOrderStatus(req, res) {
  try {
    const { id, orderId } = req.params;
    const { status, order_notes, image_base64, image_filename, image_url } = req.body;
    
    const order = await orderService.updateOrderStatus(id, orderId, status, order_notes, {
      image_base64,
      image_filename,
      image_url
    });
    
    successResponse(res, 200, "Order updated successfully", order);
  } catch (err) {
    logError("❌ Order update error:", err);
    errorResponse(res, err.statusCode || 500, err.message || "Failed to update order");
  }
}

module.exports = {
  listOrders,
  updateOrderStatus
};

