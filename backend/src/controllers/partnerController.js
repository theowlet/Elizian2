const partnerService = require('../services/partnerService');
const { successResponse, errorResponse } = require('../../utils/response');
const { logError } = require('../../utils/logger');
const { getUserRoleById } = require('../utils/queries');
const { writeAudit } = require('../utils/audit');

// List partners
async function listPartners(req, res) {
  try {
    const { category } = req.query;
    const partners = await partnerService.listPartners({ category });
    res.json({ success: true, category: category || "all", data: partners });
  } catch (err) {
    logError('Partners error:', err);
    errorResponse(res, 500, err.message || "Failed to retrieve partners");
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

module.exports = {
  listPartners,
  getPartner,
  createPartner,
  updatePartner,
  deletePartner,
  login,
  register,
  getDashboard,
  getAnalytics,
  forgotPassword,
  resetPassword,
  resendOtp
};

