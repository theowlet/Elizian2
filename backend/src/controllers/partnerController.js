const partnerService = require('../services/partnerService');
const { successResponse, errorResponse } = require('../../utils/response');
const { logError } = require('../../utils/logger');
const { getUserRoleById } = require('../utils/queries');
const { writeAudit } = require('../utils/audit');
const { log } = require('../utils/logger');

// List partners
async function listPartners(req, res) {
  try {
    const { category, lat, lon } = req.query;
    const filters = { category: category || null };
    if (lat != null && lon != null) {
      const nLat = parseFloat(lat);
      const nLon = parseFloat(lon);
      if (!Number.isNaN(nLat) && !Number.isNaN(nLon)) {
        filters.lat = nLat;
        filters.lon = nLon;
      }
    }
    const partners = await partnerService.listPartners(filters);
    res.json({ success: true, category: filters.category || "all", data: partners });
  } catch (err) {
    logError('Partners error:', err);
    errorResponse(res, 500, err.message || "Failed to retrieve partners");
  }
}

// Get current partner profile (authenticated). Returns full partner including address, latitude, longitude, geo_verified for console.
async function getPartnerMe(req, res) {
  try {
    const partnerId = req.partnerId;
    if (!partnerId) {
      return errorResponse(res, 401, "Partner authentication required");
    }
    const partner = await partnerService.getPartnerById(partnerId, false);
    successResponse(res, 200, "Partner profile retrieved successfully", partner);
  } catch (err) {
    logError("❌ Partner me error:", err);
    errorResponse(res, err.statusCode || 500, err.message || "Failed to retrieve partner profile");
  }
}

// Get partner by ID
async function getPartner(req, res) {
  try {
    const { id } = req.params;
    const partner = await partnerService.getPartnerById(id);
    successResponse(res, 200, "Partner retrieved successfully", partner);
  } catch (err) {
    logError("❌ Partner retrieval error:", err);
    errorResponse(res, err.statusCode || 500, err.message || "Failed to retrieve partner");
  }
}

// Get full venue detail for public venue page (profile, menu, hours, reviews summary, active offers)
async function getVenueDetail(req, res) {
  try {
    const { id } = req.params;
    const venue = await partnerService.getVenueDetail(id);
    successResponse(res, 200, "Venue detail retrieved successfully", venue);
  } catch (err) {
    logError("❌ Venue detail error:", err);
    errorResponse(res, err.statusCode || 500, err.message || "Failed to retrieve venue detail");
  }
}

// Create partner (admin only)
async function createPartner(req, res) {
  try {
    const {
      name,
      category_id,
      description,
      address,
      phone,
      email,
      discount_percentage,
      rating,
      coordinates,
      is_active = false
    } = req.body;

    if (!name || !category_id) {
      return errorResponse(res, 400, "Name and category_id are required");
    }

    const lat = coordinates?.lat || null;
    const lng = coordinates?.lng || null;

    const actorRole = await getUserRoleById(req.userId);
    const partner = await partnerService.createPartner({
      name,
      category_id,
      description,
      address,
      phone_number: phone,
      email,
      partner_discount_percentage: discount_percentage || 0,
      rating,
      latitude: lat,
      longitude: lng,
      is_active
    }, req.userId, actorRole);

    successResponse(res, 201, "Partner created successfully", partner);
  } catch (err) {
    logError("❌ Partner creation error:", err);
    if (err.code === '23503') {
      errorResponse(res, 400, "Invalid category_id");
    } else {
      errorResponse(res, err.statusCode || 500, err.message || "Failed to create partner");
    }
  }
}

// Update partner
async function updatePartner(req, res) {
  try {
    const { id } = req.params;
    const updates = req.body;

    const partner = await partnerService.updatePartner(id, updates);
    successResponse(res, 200, "Partner updated successfully", partner);
  } catch (err) {
    logError("❌ Partner update error:", err);
    errorResponse(res, err.statusCode || 500, err.message || "Failed to update partner");
  }
}

// Delete partner
async function deletePartner(req, res) {
  try {
    const { id } = req.params;
    await partnerService.deletePartner(id);
    successResponse(res, 200, "Partner deleted successfully");
  } catch (err) {
    logError("❌ Partner deletion error:", err);
    errorResponse(res, err.statusCode || 500, err.message || "Failed to delete partner");
  }
}

// Partner login
async function login(req, res) {
  try {
    const { email, password } = req.body;
    const result = await partnerService.loginPartner(email, password);
    successResponse(res, 200, "Login successful", result);
  } catch (err) {
    logError("❌ Partner login error:", err);
    errorResponse(res, err.statusCode || 500, err.message || "Login failed");
  }
}

// Partner registration
async function register(req, res) {
  try {
    const result = await partnerService.registerPartner(req.body);
    successResponse(res, 201, "Partner registration submitted for approval", result);
  } catch (err) {
    logError("❌ Partner registration error:", err);
    errorResponse(res, err.statusCode || 500, err.message || "Registration failed");
  }
}

// Get partner dashboard
async function getDashboard(req, res) {
  try {
    const { id } = req.params;
    const stats = await partnerService.getPartnerDashboard(id);
    successResponse(res, 200, "Dashboard stats retrieved successfully", stats);
  } catch (err) {
    logError("❌ Dashboard stats error:", err);
    errorResponse(res, err.statusCode || 500, err.message || "Failed to retrieve dashboard stats");
  }
}

// Get partner analytics
async function getAnalytics(req, res) {
  try {
    const { id } = req.params;
    const { period = '30' } = req.query;
    const analytics = await partnerService.getPartnerAnalytics(id, period);
    successResponse(res, 200, "Analytics retrieved successfully", analytics);
  } catch (err) {
    logError("❌ Analytics fetch error:", err);
    errorResponse(res, err.statusCode || 500, err.message || "Failed to fetch analytics");
  }
}

// Get partner rewards analytics
async function getRewardsAnalytics(req, res) {
  try {
    const { id } = req.params;
    const analytics = await partnerService.getPartnerRewardsAnalytics(id);
    successResponse(res, 200, "Rewards analytics retrieved successfully", analytics);
  } catch (err) {
    logError("❌ Partner rewards analytics error:", err);
    errorResponse(res, err.statusCode || 500, err.message || "Failed to fetch rewards analytics");
  }
}

// Forgot password
async function forgotPassword(req, res) {
  try {
    const result = await require('../services/partnerAuthService').forgotPassword(req.body.email);
    successResponse(res, 200, "Recovery code sent to your email", result);
  } catch (err) {
    logError("❌ Forgot password error:", err);
    errorResponse(res, err.statusCode || 500, err.message || "Failed to process password recovery request");
  }
}

// Reset password
async function resetPassword(req, res) {
  try {
    const { email, otp, newPassword } = req.body;
    const result = await require('../services/partnerAuthService').resetPassword(email, otp, newPassword);
    successResponse(res, 200, result.message);
  } catch (err) {
    logError("❌ Reset password error:", err);
    errorResponse(res, err.statusCode || 500, err.message || "Failed to reset password");
  }
}

// Resend OTP
async function resendOtp(req, res) {
  try {
    const result = await require('../services/partnerAuthService').resendOtp(req.body.email);
    successResponse(res, 200, result.message, result);
  } catch (err) {
    logError("❌ Resend OTP error:", err);
    errorResponse(res, err.statusCode || 500, err.message || "Failed to resend recovery code");
  }
}

// Get menu images (scrollable menu viewer)
// CRITICAL: Only show menu images for approved partners to public users
async function getMenuImages(req, res) {
  try {
    const { id } = req.params;
    // Check if user is admin/partner (can view unapproved partners)
    const isAdmin = req.userId ? (await getUserRoleById(req.userId)) === 'admin' : false;
    const requireApproval = !isAdmin; // Public users require approval, admins don't
    
    const partner = await partnerService.getPartnerWithMenuImages(id, requireApproval);
    const menuImages = partner.menu_images || [];
    
    successResponse(res, 200, "Menu images retrieved successfully", {
      partner_id: id,
      partner_name: partner.name,
      menu_images: menuImages,
      count: menuImages.length
    });
  } catch (err) {
    logError("❌ Get menu images error:", err);
    errorResponse(res, err.statusCode || 500, err.message || "Failed to retrieve menu images");
  }
}

// Upload menu images (scrollable menu viewer)
async function uploadMenuImages(req, res) {
  try {
    const { id } = req.params;
    
    if (!req.files || req.files.length === 0) {
      return errorResponse(res, 400, "No images uploaded");
    }
    
    // Get partner's current menu images
    const partner = await partnerService.getPartnerWithMenuImages(id);
    const currentImages = partner.menu_images || [];
    
    // Add new image paths
    const newImagePaths = req.files.map(file => `/uploads/menu/${file.filename}`);
    const updatedImages = [...currentImages, ...newImagePaths];
    // Update partner record
    await partnerService.updatePartnerMenuImages(id, updatedImages);
    
    successResponse(res, 200, "Menu images uploaded successfully", {
      uploadedCount: newImagePaths.length,
      totalImages: updatedImages.length,
      images: updatedImages
    });
  } catch (err) {
    logError("❌ Menu images upload error:", err);
    errorResponse(res, err.statusCode || 500, err.message || "Failed to upload menu images");
  }
}

// Delete a menu image by index
async function deleteMenuImage(req, res) {
  try {
    const { id, index } = req.params;
    const imageIndex = parseInt(index);
    
    if (isNaN(imageIndex) || imageIndex < 0) {
      return errorResponse(res, 400, "Invalid image index");
    }
    
    // Get partner's current menu images
    const partner = await partnerService.getPartnerWithMenuImages(id);
    const currentImages = partner.menu_images || [];
    
    if (imageIndex >= currentImages.length) {
      return errorResponse(res, 404, "Image not found");
    }
    
    // Remove image from array
    const updatedImages = currentImages.filter((_, idx) => idx !== imageIndex);
    
    // Delete physical file
    const fs = require('fs');
    const path = require('path');
    const imagePath = path.join(__dirname, '../../', currentImages[imageIndex]);
    
    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }
    
    // Update partner record
    await partnerService.updatePartnerMenuImages(id, updatedImages);
    
    successResponse(res, 200, "Menu image deleted successfully", {
      remainingImages: updatedImages.length,
      images: updatedImages
    });
  } catch (err) {
    logError("❌ Menu image delete error:", err);
    errorResponse(res, err.statusCode || 500, err.message || "Failed to delete menu image");
  }
}

module.exports = {
  listPartners,
  getPartnerMe,
  getPartner,
  getVenueDetail,
  createPartner,
  updatePartner,
  deletePartner,
  login,
  register,
  getDashboard,
  getAnalytics,
  getRewardsAnalytics,
  forgotPassword,
  resetPassword,
  resendOtp,
  getMenuImages,
  uploadMenuImages,
  deleteMenuImage
};

