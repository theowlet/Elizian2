const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const config = require('./config/env');
const { log, logError } = require('../utils/logger');
const requestContext = require('../middleware/requestContext');
const errorHandler = require('../middleware/errorHandler');
const { apiLimiter } = require('../middleware/rateLimiters');

// Import modular routes
const authRoutes = require('../routes/authRoutes');
const loyaltyRoutes = require('../routes/loyaltyRoutes');
const theatreRoutes = require('../routes/theatreRoutes');

const app = express();

// CORS Configuration
const corsOptions = {
  origin: config.isProduction
    ? (process.env.CORS_ALLOWED_ORIGINS 
        ? process.env.CORS_ALLOWED_ORIGINS.split(',').map(o => o.trim())
        : [
            process.env.FRONTEND_URL || 'http://localhost:8080',
            'http://localhost:8080',
            'http://127.0.0.1:8080'
          ])
    : config.cors.allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'Cache-Control',
    'Pragma',
    'X-API-Key'
  ],
  exposedHeaders: ['Authorization']
};

// Helper middleware to set CORS headers for static files
function staticCorsMiddleware(req, res, next) {
  const origin = req.headers.origin;
  let allowedOrigin = null;
  
  // In development, be more permissive for static files
  if (!config.isProduction) {
    // Allow any origin in development for static files
    if (origin) {
      allowedOrigin = origin;
    } else if (Array.isArray(corsOptions.origin) && corsOptions.origin.length > 0) {
      // If no origin header, allow first in list (for direct requests)
      allowedOrigin = corsOptions.origin[0];
    } else {
      // Fallback to wildcard in dev
      allowedOrigin = '*';
    }
  } else {
    // In production, be strict
    if (Array.isArray(corsOptions.origin)) {
      if (origin && corsOptions.origin.includes(origin)) {
        allowedOrigin = origin;
      } else if (!origin && corsOptions.origin.length > 0) {
        allowedOrigin = corsOptions.origin[0];
      }
    } else if (typeof corsOptions.origin === 'string') {
      allowedOrigin = corsOptions.origin === '*' ? (origin || '*') : corsOptions.origin;
    } else if (typeof corsOptions.origin === 'function') {
      try {
        allowedOrigin = corsOptions.origin(origin);
      } catch (err) {
        logError('CORS origin function error:', err);
      }
    } else {
      allowedOrigin = origin || '*';
    }
  }
  
  // Always set CORS headers for static files
  if (allowedOrigin) {
    res.header('Access-Control-Allow-Origin', allowedOrigin);
  }
  res.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.header('Access-Control-Allow-Headers', corsOptions.allowedHeaders.join(', '));
  res.header('Access-Control-Expose-Headers', 'Content-Length, Content-Type');
  
  if (corsOptions.credentials && allowedOrigin !== '*') {
    res.header('Access-Control-Allow-Credentials', 'true');
  }
  
  // Handle OPTIONS preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
}

// Serve static files from backend/uploads directory
// __dirname is backend/src, so uploads are at backend/uploads
const uploadsRoot = path.join(__dirname, '..', 'uploads');
const uploadsOffers = path.join(uploadsRoot, 'offers');

// Ensure upload directories exist on startup
const fs = require('fs');
[uploadsRoot, uploadsOffers, path.join(uploadsRoot, 'menu'), path.join(uploadsRoot, 'events'), path.join(uploadsRoot, 'orders'), path.join(uploadsRoot, 'vouchers')].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    log(`📁 Created upload directory: ${dir}`);
  }
});

log(`📁 Serving static uploads from: ${path.resolve(uploadsRoot)}`);

// Static file serving with CORS headers - MUST be before helmet
app.use('/uploads', (req, res, next) => {
  // Set permissive CORS headers for static files
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
  
  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
}, express.static(uploadsRoot, {
  setHeaders: (res, filePath) => {
    // Set proper content type and CORS headers for images
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    
    if (filePath.endsWith('.png')) {
      res.setHeader('Content-Type', 'image/png');
    } else if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) {
      res.setHeader('Content-Type', 'image/jpeg');
    } else if (filePath.endsWith('.webp')) {
      res.setHeader('Content-Type', 'image/webp');
    } else if (filePath.endsWith('.gif')) {
      res.setHeader('Content-Type', 'image/gif');
    }
  }
}));

// Serve static files from assets directory with CORS (keep for frontend assets)
const assetsPath = path.join(__dirname, '..', '..', 'frontend', 'public', 'assets');
if (fs.existsSync(assetsPath)) {
  app.use('/assets', staticCorsMiddleware, express.static(assetsPath));
}

app.use(cors(corsOptions));

// Security middleware
app.use(requestContext);
app.use(helmet({
  contentSecurityPolicy: false, // kept false due to mixed legacy inline scripts; enable after CSP audit
  crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow images to be loaded cross-origin
  crossOriginEmbedderPolicy: false // Allow embedding images
}));

// HTTP logging
app.use(morgan(':method :url :status :res[content-length] - :response-time ms reqId=:req[x-request-id]'));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Rate limiting
app.use('/api/', apiLimiter);

// Basic health check
app.get('/health', (req, res) => {
  res.status(200).json({ 
    ok: true, 
    status: 'healthy', 
    uptime: process.uptime(), 
    timestamp: new Date().toISOString() 
  });
});

// Modular routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/loyalty', loyaltyRoutes);
app.use('/api/v1/theatre', theatreRoutes);

// Rewards routes
const rewardsRoutes = require('./routes/rewardsRoutes');
app.use('/api/v1/rewards', rewardsRoutes);

// Account management routes (deletion, preferences, etc.)
const accountRoutes = require('./routes/accountRoutes');
app.use('/api/v1/account', accountRoutes);

// Import and mount booking routes
const bookingRoutes = require('./routes/bookingRoutes');
app.use('/api/v1/bookings', bookingRoutes);

// Import and mount redemption routes (voucher redemption system)
const redemptionRoutes = require('./routes/redemptionRoutes');
app.use('/api/v1/redemptions', redemptionRoutes);

// Import and mount voucher routes
const voucherRoutes = require('./routes/voucherRoutes');
app.use('/api/v1/vouchers', voucherRoutes);
app.use('/api/v1/bookings', voucherRoutes.bookingVoucherRouter);
app.use('/api/v1/partners', voucherRoutes.partnerVoucherRouter);

// Import and mount partner routes
const partnerRoutes = require('./routes/partnerRoutes');
app.use('/api/v1/partners', partnerRoutes);

// In-app messaging (conversations)
const conversationRoutes = require('./routes/conversationRoutes');
app.use('/api/v1/conversations', conversationRoutes);

// Subscription passes
const subscriptionPassRoutes = require('./routes/subscriptionPassRoutes');
app.use('/api/v1/passes', subscriptionPassRoutes);

// Prelaunch / founding member (user list)
const prelaunchRoutes = require('./routes/prelaunchRoutes');
app.use('/api/v1/prelaunch', prelaunchRoutes);

// Import and mount event routes
const eventRoutes = require('./routes/eventRoutes');
app.use('/api/v1/events', eventRoutes);

// Import and mount ticket routes
const ticketRoutes = require('./routes/ticketRoutes');
app.use('/api/v1', ticketRoutes);

// Import and mount admin routes
const adminRoutes = require('./routes/adminRoutes');
app.use('/api/v1/admin', adminRoutes);

// Import and mount user routes
const userRoutes = require('./routes/userRoutes');
app.use('/api/v1/user', userRoutes);

// Import and mount category routes
const categoryRoutes = require('./routes/categoryRoutes');
app.use('/api/v1/categories', categoryRoutes);

// Import and mount public offers routes
const offerRoutes = require('./routes/offerRoutes');
app.use('/api/v1/offers', offerRoutes);
app.use('/api/v1/deals', offerRoutes);  // Alias: deals and offers are the same

// Collections (featured removed; single promotional category is Trending)
const collectionsRoutes = require('./routes/collectionsRoutes');
app.use('/api/v1/collections', collectionsRoutes);

// Import and mount service routes (service types, categories)
const serviceRoutes = require('./routes/serviceRoutes');
app.use('/api/v1', serviceRoutes);

// Import and mount tier routes (loyalty tiers system)
const tierRoutes = require('./routes/tierRoutes');
app.use('/api/v1', tierRoutes);

// Import and mount bank offer routes
const bankOfferRoutes = require('./routes/bankOfferRoutes');
app.use('/api/v1', bankOfferRoutes);

// Import and mount reservation routes
const reservationRoutes = require('./routes/reservationRoutes');
app.use('/api/v1', reservationRoutes);

// Import and mount pre-order routes
const preOrderRoutes = require('./routes/preOrderRoutes');
app.use('/api/v1', preOrderRoutes);

// Import and mount notification routes (in-app notifications, push, etc.)
const notificationRoutes = require('./routes/notificationRoutes');
app.use('/api/v1/notifications', notificationRoutes);

// Import and mount achievement routes (gamification system)
const achievementRoutes = require('./routes/achievementRoutes');
app.use('/api/v1/achievements', achievementRoutes);

// Import and mount referral routes (referral program)
const referralRoutes = require('./routes/referralRoutes');
app.use('/api/v1/referrals', referralRoutes);

const recommendationRoutes = require('./routes/recommendationRoutes');
app.use('/api/v1/recommendations', recommendationRoutes);

// Developer API: key management (user auth) + public API (API key auth)
const developerRoutes = require('./routes/developerRoutes');
app.use('/api/v1/developer', developerRoutes);
app.use('/api/developer/v1', developerRoutes.publicRouter);

// Community governance (proposals & voting)
const governanceRoutes = require('./routes/governanceRoutes');
app.use('/api/v1/governance', governanceRoutes);

// Import and mount system settings routes (configuration management)
const systemSettingsRoutes = require('./routes/systemSettingsRoutes');
app.use('/api/v1/settings', systemSettingsRoutes);

// NFC puck routes (tap-to-check-in, partner puck management)
const nfcRoutes = require('./routes/nfcRoutes');
app.use('/api/v1/nfc', nfcRoutes);

// TODO: Add remaining routes as they are refactored:
// - app.use('/api/v1/menu', menuRoutes);
// - app.use('/api/v1', multiTierRoutes);

// WebSocket health check route (optional, safe to fail)
try {
  const websocketHealthRoute = require('./routes/websocketRoutes');
  app.use('/api/v1', websocketHealthRoute);
} catch (error) {
  // WebSocket routes not available - graceful degradation
  console.log('🟡 WebSocket health route not available (optional feature)');
}

// Error handler (must be last)
app.use(errorHandler);

module.exports = app;

