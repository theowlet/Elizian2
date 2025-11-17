const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const { validatePhoneNumber, validateEmail, validateRequired } = require('../middleware/validation');
const { rateLimit } = require('express-rate-limit');

const router = express.Router();

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: 'Too many authentication attempts, please try again later.'
});

// Helper functions
const successResponse = (res, statusCode, message, data = null) => {
  const response = { success: true, message };
  if (data) response.data = data;
  return res.status(statusCode).json(response);
};

const errorResponse = (res, statusCode, message) => {
  return res.status(statusCode).json({ success: false, message });
};

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '24h' });
};

// Middleware to authenticate token
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return errorResponse(res, 401, 'Access token required');
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (err) {
    return errorResponse(res, 403, 'Invalid or expired token');
  }
};

// Routes

// GET /api/v1/auth/register - Info endpoint
router.get('/register', (req, res) => {
  successResponse(res, 200, 'Registration endpoint - Use POST method with user data', {
    required_fields: ['phone_number', 'email', 'password', 'first_name', 'last_name', 'otp_code'],
    example: {
      phone_number: '+919876543210',
      email: 'user@example.com',
      password: 'securePassword123',
      first_name: 'John',
      last_name: 'Doe',
      otp_code: '123456'
    }
  });
});

// POST /api/v1/auth/register - User registration with OTP
// Note: otp_code is optional - can use pre-verified OTP session instead
router.post('/register', authLimiter, validatePhoneNumber, validateEmail, validateRequired(['password', 'first_name', 'last_name']), async (req, res) => {
  try {
    const { phone_number, email, password, first_name, last_name, otp_code } = req.body;

    let otpVerified = false;
    let otpSessionId = null;

    // Check OTP verification - either via pre-verified session OR inline otp_code
    if (otp_code) {
      // Inline OTP verification - verify the OTP code directly
      const otpSessionResult = await pool.query(
        `SELECT * FROM otp_sessions
         WHERE phone_number = $1 AND expires_at > NOW() AND verified = FALSE
         ORDER BY created_at DESC LIMIT 1`,
        [phone_number]
      );

      const otpSession = otpSessionResult.rows[0];

      if (!otpSession) {
        return errorResponse(res, 400, "No valid OTP session found or OTP expired. Please request a new OTP.");
      }

      // Check attempt count
      if (otpSession.attempts >= 5) {
        return errorResponse(res, 400, "Maximum OTP attempts exceeded. Please request a new OTP.");
      }

      const isOtpValid = await bcrypt.compare(otp_code, otpSession.otp_hash);

      if (!isOtpValid) {
        // Increment attempt count
        await pool.query(
          `UPDATE otp_sessions SET attempts = attempts + 1 WHERE id = $1`,
          [otpSession.id]
        );
        return errorResponse(res, 400, "Invalid OTP code.");
      }

      // Mark OTP as verified
      await pool.query(
        `UPDATE otp_sessions SET verified = TRUE, verified_at = NOW() WHERE id = $1`,
        [otpSession.id]
      );

      otpVerified = true;
      otpSessionId = otpSession.id;
    } else {
      // Check for pre-verified OTP session
      const otpCheck = await pool.query(
        `SELECT id, verified, expires_at, created_at, verified_at
         FROM otp_sessions 
         WHERE phone_number = $1 AND verified = true 
         ORDER BY verified_at DESC 
         LIMIT 1`,
        [phone_number]
      );

      if (otpCheck.rows.length === 0 || !otpCheck.rows[0].verified) {
        return errorResponse(res, 403, "OTP verification required. Please verify your phone number first or provide otp_code in the request.");
      }

      // Check if verification is not too old (within last 30 minutes)
      const verifiedAt = new Date(otpCheck.rows[0].verified_at || otpCheck.rows[0].created_at);
      const verificationAge = Date.now() - verifiedAt.getTime();
      if (verificationAge > 30 * 60 * 1000) {
        return errorResponse(res, 403, "OTP verification expired. Please verify again.");
      }

      otpVerified = true;
      otpSessionId = otpCheck.rows[0].id;
    }

    if (!otpVerified) {
      return errorResponse(res, 403, "OTP verification required. Please verify your phone number first or provide otp_code in the request.");
    }

    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE phone_number = $1 OR email = $2',
      [phone_number, email]
    );

    if (existingUser.rows.length > 0) {
      return errorResponse(res, 400, 'User with this phone number or email already exists');
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user
    const result = await pool.query(
      `INSERT INTO users (phone_number, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, phone_number, email, first_name, last_name, created_at`,
      [phone_number, email, hashedPassword, first_name, last_name, true]
    );

    const user = result.rows[0];

    // Generate token
    const token = generateToken(user.id);

    successResponse(res, 201, 'User registered successfully', {
      user: {
        id: user.id,
        phone_number: user.phone_number,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        created_at: user.created_at
      },
      token
    });

  } catch (err) {
    console.error('Registration error:', err);
    if (err.code === '23505') {
      errorResponse(res, 400, 'User with this phone number or email already exists');
    } else {
      errorResponse(res, 500, 'Registration failed');
    }
  }
});

// POST /api/v1/auth/login - User login
router.post('/login', authLimiter, validatePhoneNumber, validateRequired(['password']), async (req, res) => {
  try {
    const { phone_number, password } = req.body;

    // Find user
    const result = await pool.query(
      'SELECT id, phone_number, email, password_hash, first_name, last_name, is_active FROM users WHERE phone_number = $1',
      [phone_number]
    );

    const user = result.rows[0];

    if (!user) {
      return errorResponse(res, 401, 'Invalid phone number or password');
    }

    if (!user.is_active) {
      return errorResponse(res, 401, 'Account is deactivated');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      return errorResponse(res, 401, 'Invalid phone number or password');
    }

    // Generate token
    const token = generateToken(user.id);

    successResponse(res, 200, 'Login successful', {
      user: {
        id: user.id,
        phone_number: user.phone_number,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name
      },
      token
    });

  } catch (err) {
    console.error('Login error:', err);
    errorResponse(res, 500, 'Login failed');
  }
});

// POST /api/v1/auth/send-otp - Send OTP for registration/login
router.post('/send-otp', authLimiter, validatePhoneNumber, async (req, res) => {
  try {
    const { phone_number } = req.body;

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Hash OTP for storage
    const otpHash = await bcrypt.hash(otp, 10);

    // Store OTP session
    await pool.query(
      `INSERT INTO otp_sessions (phone_number, otp_hash, expires_at, attempts, verified)
       VALUES ($1, $2, NOW() + INTERVAL '10 minutes', 0, FALSE)`,
      [phone_number, otpHash]
    );

    // Log OTP in development
    if (process.env.NODE_ENV === 'development' && process.env.LOG_OTP === 'true') {
      console.log(`[DEV] OTP for ${phone_number}: ${otp}`);
    }

    successResponse(res, 200, 'OTP sent successfully');

  } catch (err) {
    console.error('Send OTP error:', err);
    errorResponse(res, 500, 'Failed to send OTP');
  }
});

// POST /api/v1/auth/verify-otp - Verify OTP
router.post('/verify-otp', authLimiter, validatePhoneNumber, validateRequired(['otp_code']), async (req, res) => {
  try {
    const { phone_number, otp_code } = req.body;

    // Find latest OTP session
    const result = await pool.query(
      `SELECT * FROM otp_sessions
       WHERE phone_number = $1 AND expires_at > NOW() AND verified = FALSE
       ORDER BY created_at DESC LIMIT 1`,
      [phone_number]
    );

    const otpSession = result.rows[0];

    if (!otpSession) {
      return errorResponse(res, 400, 'No valid OTP session found or OTP expired');
    }

    if (otpSession.attempts >= 3) {
      return errorResponse(res, 400, 'Too many failed attempts. Please request a new OTP');
    }

    const isOtpValid = await bcrypt.compare(otp_code, otpSession.otp_hash);

    if (!isOtpValid) {
      // Increment attempt count
      await pool.query(
        `UPDATE otp_sessions SET attempts = attempts + 1 WHERE id = $1`,
        [otpSession.id]
      );
      return errorResponse(res, 400, 'Invalid OTP code');
    }

    // Mark OTP as verified
    await pool.query(
      `UPDATE otp_sessions SET verified = TRUE WHERE id = $1`,
      [otpSession.id]
    );

    successResponse(res, 200, 'OTP verified successfully');

  } catch (err) {
    console.error('Verify OTP error:', err);
    errorResponse(res, 500, 'OTP verification failed');
  }
});

// GET /api/v1/auth/profile - Get user profile (protected)
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, phone_number, email, first_name, last_name, created_at FROM users WHERE id = $1',
      [req.userId]
    );

    const user = result.rows[0];

    if (!user) {
      return errorResponse(res, 404, 'User not found');
    }

    successResponse(res, 200, 'Profile retrieved successfully', { user });

  } catch (err) {
    console.error('Get profile error:', err);
    errorResponse(res, 500, 'Failed to retrieve profile');
  }
});

module.exports = { router, authenticateToken };
