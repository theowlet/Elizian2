const menuService = require('../services/menuService');
const { successResponse, errorResponse } = require('../../utils/response');
const { logError } = require('../../utils/logger');

// List menu items
async function listMenuItems(req, res) {
  try {
    const { id } = req.params;
    const { include_lifecycle } = req.query;
    const items = await menuService.listMenuItems(id, { include_lifecycle: include_lifecycle === 'true' });
    
    if (include_lifecycle === 'true') {
      res.json({
        success: true,
        message: "Menu items retrieved successfully",
        ...items
      });
    } else {
      successResponse(res, 200, "Menu items retrieved successfully", items);
    }
  } catch (err) {
    logError("❌ Menu items retrieval error:", err);
    errorResponse(res, err.statusCode || 500, err.message || "Failed to retrieve menu items");
  }
}

// Create menu item
async function createMenuItem(req, res) {
  try {
    const { id } = req.params;
    console.log('[menuController] Received request body keys:', Object.keys(req.body));
    console.log('[menuController] Has image_base64:', !!req.body.image_base64);
    console.log('[menuController] Has image_url:', !!req.body.image_url);
    console.log('[menuController] image_base64 length:', req.body.image_base64 ? req.body.image_base64.length : 0);
    
    const menuItem = await menuService.createMenuItem(id, req.body);
    successResponse(res, 201, "Menu item created successfully", menuItem);
  } catch (err) {
    logError("❌ Menu item creation error:", err);
    if (err.code === '23503') {
      errorResponse(res, 400, "Invalid service_category_id or partner_id");
    } else if (err.code === '23505') {
      errorResponse(res, 400, "Menu item with this name already exists for this partner");
    } else {
      errorResponse(res, err.statusCode || 500, err.message || "Failed to create menu item");
    }
  }
}

// Update menu item
async function updateMenuItem(req, res) {
  try {
    const { id, itemId } = req.params;
    const menuItem = await menuService.updateMenuItem(id, itemId, req.body);
    successResponse(res, 200, "Menu item updated successfully", menuItem);
  } catch (err) {
    logError("❌ Menu item update error:", err);
    if (err.code === '23505') {
      errorResponse(res, 400, "Menu item with this name already exists for this partner");
    } else {
      errorResponse(res, err.statusCode || 500, err.message || "Failed to update menu item");
    }
  }
}

// Delete menu item
async function deleteMenuItem(req, res) {
  try {
    const { id, itemId } = req.params;
    await menuService.deleteMenuItem(id, itemId);
    successResponse(res, 200, "Menu item deleted successfully");
  } catch (err) {
    logError("❌ Menu item deletion error:", err);
    errorResponse(res, err.statusCode || 500, err.message || "Failed to delete menu item");
  }
}

module.exports = {
  listMenuItems,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem
};

