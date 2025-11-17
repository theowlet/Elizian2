// ============================================
// ELIZIAN BACKEND - MODULAR VERSION
// Node.js + Express + PostgreSQL
// ============================================

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const rateLimit = require("express-rate-limit");

// Import modular routes
const { router: authRoutes, authenticateToken } = require('./routes/auth');
const partnersRoutes = require('./routes/partners');
const categoriesRoutes = require('./routes/categories');

// EZNet routes
const eventsRoutes = require('./routes/eznet/events');
const bookingsRoutes = require('./routes/eznet/bookings');
const venuesRoutes = require('./routes/eznet/venues');
const reviewsRoutes = require('./routes/eznet/reviews');

// Import database and validation
const { pool, testConnection } = require('./config/database');
const { sanitizeInput } = require('./middleware/validation');

// Simple timestamped logger
const log = (...args) => console.log(new Date().toISOString(), ...args);
const logError = (...args) => console.error(new Date().toISOString(), ...args);

// ============================================
// ENVIRONMENT VALIDATION
// ============================================

const validateEnvironment = () => {
  const errors = [];
  const warnings = [];
  
  // Critical environment variables (must be present)
  const criticalVars = [
    'DB_USER',
    'DB_HOST', 
    'DB_NAME',
    'DB_PASSWORD',
    'DB_PORT',
    'JWT_SECRET'
  ];
  
  // Check critical variables
  criticalVars.forEach(varName => {
    if (!process.env[varName]) {
      errors.push(`Missing critical environment variable: ${varName}`);
    }
  });
  
  // Validate JWT_SECRET strength
  if (process.env.JWT_SECRET) {
    if (process.env.JWT_SECRET.length < 32) {
      errors.push('JWT_SECRET must be at least 32 characters long for security');
    }
    if (process.env.JWT_SECRET === 'your-secret-key-change-in-production') {
      errors.push('JWT_SECRET must be changed from default value');
    }
  }
  
  // Validate database port
  if (process.env.DB_PORT) {
    const port = parseInt(process.env.DB_PORT);
    if (isNaN(port) || port < 1 || port > 65535) {
      errors.push('DB_PORT must be a valid port number (1-65535)');
    }
  }
  
  // Check NODE_ENV consistency
  if (!process.env.NODE_ENV) {
    warnings.push('NODE_ENV not set, defaulting to development');
    process.env.NODE_ENV = 'development';
  }
  
  // Validate CORS URLs
  if (process.env.FRONTEND_URL) {
    try {
      new URL(process.env.FRONTEND_URL);
    } catch {
      errors.push('FRONTEND_URL must be a valid URL');
    }
  }
  
  if (process.env.ADMIN_URL) {
    try {
      new URL(process.env.ADMIN_URL);
    } catch {
      errors.push('ADMIN_URL must be a valid URL');
    }
  }
  
  // Log results
  if (errors.length > 0) {
    logError("❌ Environment validation failed:");
    errors.forEach(error => logError(`   - ${error}`));
    process.exit(1);
  }
  
  if (warnings.length > 0) {
    log("⚠️ Environment warnings:");
    warnings.forEach(warning => log(`   - ${warning}`));
  }
  
  log("✅ Environment validation passed");
};

// ============================================
// EXPRESS APP SETUP
// ============================================

const app = express();
const PORT = process.env.PORT || 5001;

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      process.env.FRONTEND_URL,
      process.env.ADMIN_URL,
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:8080',
      'http://localhost:8081'
    ].filter(Boolean);

    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// CORS error handler
app.use((err, req, res, next) => {
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      success: false,
      message: 'CORS policy violation'
    });
  }
  next(err);
});

// Rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: 'Too many requests, please try again later.'
  }
});

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // limit each IP to 3 OTP requests per windowMs
  message: {
    success: false,
    message: 'Too many OTP requests, please try again later.'
  }
});

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(sanitizeInput);
app.use(generalLimiter);

// ============================================
// DATABASE CONNECTION
// ============================================

// Test database connection on startup
testConnection().then(connected => {
  if (connected) {
    log("✅ Database connected successfully");
  } else {
    logError("❌ Database connection failed");
    process.exit(1);
  }
});

// ============================================
// STATIC FILE SERVING
// ============================================

// Serve React frontend in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/build')));
}

// Serve admin and mockup files
app.use('/admin', express.static(path.join(__dirname, '../frontend/public')));
app.use('/mockups', express.static(path.join(__dirname, '../frontend/public/mockups')));

// ============================================
// API ROUTES
// ============================================

// Health check endpoint
app.get('/api/v1/health', async (req, res) => {
  try {
    const dbCheck = await testConnection();
    res.json({
      success: true,
      message: 'API is healthy',
      timestamp: new Date().toISOString(),
      database: dbCheck ? 'connected' : 'disconnected'
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Health check failed',
      error: err.message
    });
  }
});

// API documentation endpoint
app.get('/api/v1', (req, res) => {
  res.json({
    success: true,
    message: 'Elizian Backend API v1',
    version: '1.0.0',
    available_endpoints: {
      auth: [
        'POST /api/v1/auth/register',
        'POST /api/v1/auth/login',
        'POST /api/v1/auth/send-otp',
        'POST /api/v1/auth/verify-otp',
        'GET /api/v1/auth/profile'
      ],
      partners: [
        'GET /api/v1/partners',
        'GET /api/v1/partners/:id',
        'POST /api/v1/partners',
        'PUT /api/v1/partners/:id',
        'DELETE /api/v1/partners/:id'
      ],
      categories: [
        'GET /api/v1/categories',
        'GET /api/v1/categories/:id',
        'POST /api/v1/categories',
        'PUT /api/v1/categories/:id',
        'DELETE /api/v1/categories/:id'
      ],
      eznet: {
        events: [
          'GET /api/v1/eznet/events',
          'GET /api/v1/eznet/events/:id',
          'POST /api/v1/eznet/events',
          'PUT /api/v1/eznet/events/:id',
          'DELETE /api/v1/eznet/events/:id'
        ],
        bookings: [
          'GET /api/v1/eznet/bookings',
          'GET /api/v1/eznet/bookings/:id',
          'POST /api/v1/eznet/bookings',
          'PUT /api/v1/eznet/bookings/:id/confirm',
          'PUT /api/v1/eznet/bookings/:id/cancel'
        ],
        venues: [
          'GET /api/v1/eznet/venues',
          'GET /api/v1/eznet/venues/:id',
          'POST /api/v1/eznet/venues',
          'PUT /api/v1/eznet/venues/:id',
          'DELETE /api/v1/eznet/venues/:id'
        ],
        reviews: [
          'GET /api/v1/eznet/reviews',
          'GET /api/v1/eznet/reviews/:id',
          'POST /api/v1/eznet/reviews',
          'PUT /api/v1/eznet/reviews/:id',
          'DELETE /api/v1/eznet/reviews/:id'
        ]
      }
    }
  });
});

// Mount route modules
app.use('/api/v1/auth', otpLimiter, authRoutes);
app.use('/api/v1/partners', partnersRoutes);
app.use('/api/v1/categories', categoriesRoutes);

// EZNet routes
app.use('/api/v1/eznet/events', eventsRoutes);
app.use('/api/v1/eznet/bookings', bookingsRoutes);
app.use('/api/v1/eznet/venues', venuesRoutes);
app.use('/api/v1/eznet/reviews', reviewsRoutes);

// ============================================
// ERROR HANDLING
// ============================================

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
    path: req.originalUrl
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logError('Unhandled error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

// ============================================
// SERVER STARTUP
// ============================================

const startServer = async () => {
  try {
    // Validate environment
    validateEnvironment();
    
    // Start server
    app.listen(PORT, () => {
      log(`✅ Elizian Backend running on http://localhost:${PORT}`);
      
      // Log environment configuration
      log(`
📋 Environment Configuration:
   - NODE_ENV: ${process.env.NODE_ENV}
   - DB_HOST: ${process.env.DB_HOST}
   - DB_NAME: ${process.env.DB_NAME}
   - DB_PORT: ${process.env.DB_PORT}
   - DB_USER: ${process.env.DB_USER}
   - JWT_SECRET: ${process.env.JWT_SECRET ? '***SET***' : 'NOT SET'}
   - FRONTEND_URL: ${process.env.FRONTEND_URL || 'NOT SET'}
   - ADMIN_URL: ${process.env.ADMIN_URL || 'NOT SET'}
`);
    });
  } catch (error) {
    logError('Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
startServer();

module.exports = app;
