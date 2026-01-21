const express = require('express');
const { otpLimiter } = require('../middleware/rateLimiters');
const {
  validatePhoneNumber,
  validateEmail,
  validateRequired,
  sanitizeInput
} = require('../middleware/validation');
const authenticateToken = require('../middleware/authenticateToken');
const authController = require('../controllers/authController');

const router = express.Router();

router.post('/send-otp', otpLimiter, validatePhoneNumber, authController.sendOtp);
router.post('/verify-otp', validatePhoneNumber, authController.verifyOtp);
router.get('/send-otp', (req, res) =>
  res.send("ℹ️ Use POST with JSON { phone_number } to send OTP.")
);
router.get('/verify-otp', (req, res) =>
  res.send("ℹ️ Use POST with JSON { phone_number, otp_code } to verify OTP.")
);

router.post(
  '/register',
  sanitizeInput,
  authController.register
);
router.get('/register', (req, res) =>
  res.send("ℹ️ Use POST with JSON { phone_number, name, email, password, role } to register.")
);

router.post(
  '/login',
  validateRequired(['email', 'password']),
  validateEmail,
  authController.login
);
router.get('/login', (req, res) =>
  res.send("ℹ️ Use POST with JSON { email, password } to log in.")
);

router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);

// User profile endpoint (requires authentication)
router.get('/user/profile', authenticateToken, authController.getProfile);

// M-PIN endpoints
router.post('/set-mpin', authenticateToken, authController.setMpin);
router.post('/verify-mpin', authController.verifyMpin);
router.post('/check-mpin', authController.checkMpinExists);
router.post('/reset-mpin', authenticateToken, authController.resetMpin);

module.exports = router;

