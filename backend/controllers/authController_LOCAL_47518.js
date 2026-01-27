const authService = require('../services/authService');
const { successResponse } = require('../utils/response');

const sendOtp = async (req, res, next) => {
  try {
    const data = await authService.sendOtp({
      phoneNumber: req.body.phone_number,
      countryCode: req.body.country_code,
      purpose: req.body.purpose
    });
    successResponse(res, 200, 'OTP sent successfully', data);
  } catch (error) {
    next(error);
  }
};

const verifyOtp = async (req, res, next) => {
  try {
    const result = await authService.verifyOtp({
      phoneNumber: req.body.phone_number,
      otpCode: req.body.otp_code
    });

    if (result.requires_registration) {
      return successResponse(res, 200, 'OTP verified successfully. Please complete registration.', {
        requires_registration: true,
        has_mpin: false
      });
    }

    // If user has M-PIN, return has_mpin flag instead of token
    if (result.has_mpin) {
      return successResponse(res, 200, 'OTP verified. Please enter M-PIN.', {
        has_mpin: true,
        user: result.user
      });
    }

    // User exists but no M-PIN - return token (existing behavior)
    successResponse(res, 200, 'OTP verified successfully', {
      token: result.token,
      user: result.user,
      has_mpin: false
    });
  } catch (error) {
    next(error);
  }
};

const register = async (req, res, next) => {
  try {
    const { token, user } = await authService.registerUser(req.body);
    successResponse(res, 201, 'User registered successfully', { token, user });
  } catch (error) {
    next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { token, user } = await authService.loginUser(req.body);
    // Return token at top level for frontend compatibility
    res.status(200).json({
      success: true,
      message: 'Login successful',
      token: token,
      user: user
    });
  } catch (error) {
    next(error);
  }
};

const forgotPassword = async (req, res, next) => {
  try {
    const payload = await authService.forgotPassword(req.body);
    successResponse(res, 200, 'Recovery code sent to your email', payload);
  } catch (error) {
    next(error);
  }
};

const resetPassword = async (req, res, next) => {
  try {
    const payload = await authService.resetPassword(req.body);
    successResponse(res, 200, payload.message, null);
  } catch (error) {
    next(error);
  }
};

const getProfile = async (req, res, next) => {
  try {
    const userId = req.userId || req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'authentication_required',
        message: 'Authentication required'
      });
    }
    
    const profile = await authService.getUserProfile(userId);
    successResponse(res, 200, 'Profile retrieved successfully', profile);
  } catch (error) {
    next(error);
  }
};

// M-PIN endpoints
const setMpin = async (req, res, next) => {
  try {
    const userId = req.userId || req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'authentication_required',
        message: 'Authentication required'
      });
    }

    const { mpin } = req.body;
    const result = await authService.setMpin(userId, mpin);
    successResponse(res, 200, result.message, result);
  } catch (error) {
    next(error);
  }
};

const verifyMpin = async (req, res, next) => {
  try {
    const { phone_number, mpin } = req.body;
    const result = await authService.verifyMpin(phone_number, mpin);
    
    // Return token at top level for frontend compatibility
    res.status(200).json({
      success: true,
      message: 'M-PIN verified successfully',
      token: result.token,
      user: result.user
    });
  } catch (error) {
    next(error);
  }
};

const checkMpinExists = async (req, res, next) => {
  try {
    const { phone_number } = req.body;
    const result = await authService.checkMpinExists(phone_number);
    successResponse(res, 200, 'M-PIN status retrieved', result);
  } catch (error) {
    next(error);
  }
};

const resetMpin = async (req, res, next) => {
  try {
    const userId = req.userId || req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'authentication_required',
        message: 'Authentication required'
      });
    }

    const { mpin } = req.body;
    const result = await authService.resetMpin(userId, mpin);
    successResponse(res, 200, result.message, result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  sendOtp,
  verifyOtp,
  register,
  login,
  forgotPassword,
  resetPassword,
  getProfile,
  setMpin,
  verifyMpin,
  checkMpinExists,
  resetMpin
};

