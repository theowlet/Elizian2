// ============================================
// ELIZIAN BACKEND PROTOTYPE
// Node.js + Express + PostgreSQL
// ============================================

const {
  validateRequired,
  validateEmail,
  validatePhoneNumber,
  sanitizeInput
} = require("./middleware/validation");

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const rateLimit = require("express-rate-limit");
const { Pool } = require("pg");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { randomUUID } = require("crypto");
const QRCode = require('qrcode');
const cron = require('node-cron');

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
  // Check for DATABASE_URL (Railway) or individual DB vars (local dev)
  if (!process.env.DATABASE_URL) {
    const dbVars = ['DB_USER', 'DB_HOST', 'DB_NAME', 'DB_PASSWORD', 'DB_PORT'];
    dbVars.forEach(varName => {
      if (!process.env[varName]) {
        errors.push(`Missing critical environment variable: ${varName} (or use DATABASE_URL instead)`);
      }
    });
  }
  
  // JWT_SECRET is always required
  if (!process.env.JWT_SECRET) {
    errors.push('Missing critical environment variable: JWT_SECRET');
  }
  
  // Validate JWT_SECRET strength
  if (process.env.JWT_SECRET) {
    if (process.env.JWT_SECRET.length < 32) {
      errors.push('JWT_SECRET must be at least 32 characters long for security');
    }
    if (process.env.JWT_SECRET === 'your-secret-key-change-in-production') {
      warnings.push('JWT_SECRET is using default value - change this in production');
    }
  }
  
  // Validate database port (only if using individual DB vars, not DATABASE_URL)
  if (!process.env.DATABASE_URL && process.env.DB_PORT) {
    const port = parseInt(process.env.DB_PORT);
    if (isNaN(port) || port < 1 || port > 65535) {
      errors.push('DB_PORT must be a valid port number (1-65535)');
    }
  }
  
  // Validate NODE_ENV
  if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = 'development';
    warnings.push('NODE_ENV not set, defaulting to development');
  } else if (!['development', 'production', 'test'].includes(process.env.NODE_ENV)) {
    warnings.push(`NODE_ENV is set to '${process.env.NODE_ENV}' which is not a standard value`);
  }
  
  // Production-specific validations
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.FRONTEND_URL) {
      warnings.push('FRONTEND_URL not set - CORS will be restrictive in production');
    }
    if (process.env.JWT_SECRET === 'your-secret-key-change-in-production') {
      errors.push('JWT_SECRET must be changed from default value in production');
    }
    
    // Additional production security checks (only if using individual DB vars)
    if (!process.env.DATABASE_URL && process.env.DB_PASSWORD && process.env.DB_PASSWORD.length < 8) {
      warnings.push('DB_PASSWORD should be at least 8 characters long in production');
    }
  }
  
  // Validate optional configuration
  if (process.env.PORT) {
    const port = parseInt(process.env.PORT);
    if (isNaN(port) || port < 1 || port > 65535) {
      errors.push('PORT must be a valid port number (1-65535)');
    }
  }
  
  // Validate URL formats for CORS
  if (process.env.FRONTEND_URL) {
    try {
      new URL(process.env.FRONTEND_URL);
    } catch {
      warnings.push('FRONTEND_URL appears to be an invalid URL format');
    }
  }
  
  if (process.env.ADMIN_URL) {
    try {
      new URL(process.env.ADMIN_URL);
    } catch {
      warnings.push('ADMIN_URL appears to be an invalid URL format');
    }
  }
  
  // Display warnings
  if (warnings.length > 0) {
    log('\n⚠️  Environment Warnings:');
    warnings.forEach(warning => log(`   - ${warning}`));
  }
  
  // Display errors and exit if critical issues found
  if (errors.length > 0) {
    logError('\n❌ Environment Validation Failed:');
    errors.forEach(error => logError(`   - ${error}`));
    logError('\nPlease fix these issues before starting the server.');
    process.exit(1);
  }
  
  // Success message
  log('✅ Environment validation passed');
  
  // Display environment info (mask sensitive data)
  log('\n📋 Environment Configuration:');
  log(`   - NODE_ENV: ${process.env.NODE_ENV}`);
  if (process.env.DATABASE_URL) {
    log(`   - DATABASE_URL: ***SET (Railway)***`);
  } else {
    log(`   - DB_HOST: ${process.env.DB_HOST}`);
    log(`   - DB_NAME: ${process.env.DB_NAME}`);
    log(`   - DB_PORT: ${process.env.DB_PORT}`);
    log(`   - DB_USER: ${process.env.DB_USER}`);
  }
  log(`   - JWT_SECRET: ${process.env.JWT_SECRET ? '***SET***' : 'NOT SET'}`);
  log(`   - FRONTEND_URL: ${process.env.FRONTEND_URL || 'NOT SET'}`);
  log(`   - ADMIN_URL: ${process.env.ADMIN_URL || 'NOT SET'}`);
  log('');
};

// Validate environment before proceeding
validateEnvironment();

const app = express();

// ============================================
// CORS CONFIGURATION (apply before routes)
// ============================================
const isProduction = process.env.NODE_ENV === 'production';

const corsOptions = {
  origin: isProduction
    ? (process.env.FRONTEND_URL || 'http://localhost:8080')
    : [
        'http://localhost:8080',
        'http://localhost:8081',
        'http://localhost:3000',
        'http://localhost:5173',
        'http://127.0.0.1:8080',
        'http://127.0.0.1:8081'
      ],
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

app.use(cors(corsOptions));

// Security middleware
const helmet = require('helmet');
const morgan = require('morgan');
const { separateByLifecycle, enrichWithLifecycleStatus, computeLifecycleStatus } = require('./utils/lifecycle');
const { validateAvailability, checkAvailability } = require('./middleware/validateAvailability');
const rfs = null; // placeholder if rotating logs added later
const requestIdHeader = 'x-request-id';

// Attach a per-request ID for tracing
app.use((req, res, next) => {
  const requestId = req.headers[requestIdHeader] || randomUUID();
  req.requestId = requestId;
  res.setHeader(requestIdHeader, requestId);
  next();
});

// Standard security headers
app.use(helmet({
  contentSecurityPolicy: false // kept false due to mixed legacy inline scripts; enable after CSP audit
}));

// HTTP logging (to stdout); infra can redirect to file
app.use(morgan(':method :url :status :res[content-length] - :response-time ms reqId=:req[x-request-id]'));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Basic health check
app.get('/health', (req, res) => {
  res.status(200).json({ ok: true, status: 'healthy', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// ============================================
// FEATURED DEALS MODERATION HELPERS
// ============================================
async function getUserRoleById(userId) {
  try {
    const result = await pool.query(
      `SELECT r.role_name
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       WHERE u.id = $1`,
      [userId]
    );
    return result.rows[0]?.role_name || null;
  } catch (e) {
    return null;
  }
}

async function requireSuperAdmin(req, res, next) {
  try {
    const roleName = await getUserRoleById(req.userId);
    if (roleName !== 'super_admin') {
      return res.status(403).json({ success: false, error: 'Admin privileges required' });
    }
    next();
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Role verification failed' });
  }
}

async function writeAudit(actorUserId, actorRole, action, entityType, entityId, meta) {
  try {
    const actorInfo = actorUserId
      ? await pool.query(
          `SELECT first_name, last_name, email FROM users WHERE id = $1`,
          [actorUserId]
        )
      : null;
    const enrichedMeta = {
      ...(meta || {}),
      actor: {
        id: actorUserId || null,
        role: actorRole || null,
        name: actorInfo?.rows?.[0]
          ? `${actorInfo.rows[0].first_name || ''} ${actorInfo.rows[0].last_name || ''}`.trim() || actorInfo.rows[0].email
          : 'System'
      }
    };

    await pool.query(
      `INSERT INTO audit_log (actor_user_id, actor_role, action, entity_type, entity_id, meta)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [actorUserId || null, actorRole || null, action, entityType, entityId, JSON.stringify(enrichedMeta)]
    );
  } catch (e) {
    logError('audit_log insert failed', e.message);
  }
}

function calculateDiscountMetrics({ original, percent, amount, discounted }) {
  const parsedOriginal = parseFloat(original);
  const originalValue = Number.isFinite(parsedOriginal) && parsedOriginal > 0 ? parsedOriginal : 0;

  const parsedPercent = parseFloat(percent);
  const percentValue = Number.isFinite(parsedPercent) && parsedPercent > 0 ? parsedPercent : 0;

  const parsedAmount = parseFloat(amount);
  const amountValue = Number.isFinite(parsedAmount) && parsedAmount > 0 ? parsedAmount : 0;

  const parsedDiscounted = parseFloat(discounted);
  let discountedValue = Number.isFinite(parsedDiscounted) ? parsedDiscounted : NaN;
  let savingsValue = 0;

  if (originalValue > 0) {
    if (percentValue > 0) {
      savingsValue = (originalValue * percentValue) / 100;
      discountedValue = originalValue - savingsValue;
    } else if (amountValue > 0) {
      savingsValue = amountValue;
      discountedValue = originalValue - amountValue;
    } else if (!Number.isFinite(discountedValue) || discountedValue <= 0) {
      discountedValue = originalValue;
      savingsValue = 0;
      } else {
      savingsValue = originalValue - discountedValue;
      }
    } else {
    // No original price provided - fall back safely
    discountedValue = Number.isFinite(discountedValue) ? discountedValue : 0;
    savingsValue = 0;
  }

  if (!Number.isFinite(discountedValue) || discountedValue < 0) {
    discountedValue = 0;
  }
  if (!Number.isFinite(savingsValue) || savingsValue < 0) {
    savingsValue = 0;
  }

  const finalDiscountedPrice = parseFloat(discountedValue.toFixed(2));
  const finalSavings = parseFloat(savingsValue.toFixed(2));
  const finalEztEquivalent = parseFloat((finalSavings / 100).toFixed(2));

  return {
    finalDiscountedPrice,
    finalSavings,
    finalEztEquivalent
  };
}

async function grantSignupBonus(userId, bonusTokens = 100) {
  try {
    const bonus = parseFloat(bonusTokens);
    if (!bonus || bonus <= 0) {
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const balanceResult = await client.query(
        'SELECT available_tokens FROM users WHERE id = $1 FOR UPDATE',
        [userId]
      );

      if (balanceResult.rowCount === 0) {
        await client.query('ROLLBACK');
        logError('⚠️ Signup bonus skipped, user not found:', userId);
        client.release();
        return;
      }
      
      const balanceBefore = parseFloat(balanceResult.rows[0].available_tokens ?? 0);
      const balanceAfter = balanceBefore + bonus;

      await client.query(
        `UPDATE users 
           SET available_tokens = COALESCE(available_tokens, 0) + $1,
               total_tokens_earned = COALESCE(total_tokens_earned, 0) + $1,
               signup_bonus_credited = true
         WHERE id = $2`,
        [bonus, userId]
      );

      await client.query(
        `INSERT INTO token_ledger (user_id, transaction_id, amount, ledger_type, balance_before, balance_after, description)
         VALUES ($1, NULL, $2, 'airdrop', $3, $4, $5)`,
        [
          userId,
          bonus,
          balanceBefore,
          balanceAfter,
          'Signup bonus credited (will sync with blockchain airdrop)'
        ]
      );

      await client.query('COMMIT');

      log(`🎁 Credited signup bonus of ${bonus.toFixed(2)} EZT to user ${userId}`);
    } catch (txError) {
      await client.query('ROLLBACK');
      throw txError;
    } finally {
      client.release();
    }
  } catch (error) {
    logError('❌ Signup bonus credit error:', error);
  }
}

// ============================================
// ADMIN: Toggle partner eligibility for featured
// ============================================
app.put('/api/v1/admin/partners/:id/featured-eligibility', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { approved_for_featured, reason } = req.body || {};

    const before = await pool.query('SELECT approved_for_featured FROM partners WHERE id = $1', [id]);
    if (before.rowCount === 0) return res.status(404).json({ success: false, error: 'Partner not found' });

    await pool.query('UPDATE partners SET approved_for_featured = $1 WHERE id = $2', [!!approved_for_featured, id]);

    await writeAudit(req.userId, 'super_admin', 'partner_feature_eligibility', 'partner', id, {
      previous: before.rows[0],
      next: { approved_for_featured: !!approved_for_featured },
      reason: reason || null
    });

    return res.json({ success: true });
  } catch (err) {
    logError('admin featured-eligibility error', err);
    return res.status(500).json({ success: false, error: 'Failed to update eligibility' });
      }
});

// ============================================
// ADMIN: Moderate an offer's featured status
// ============================================
app.put('/api/v1/admin/offers/:offerId/feature', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { offerId } = req.params;
    const { is_promoted, reason } = req.body || {};

    // Get offer with partner info
    const offerResult = await pool.query(
      `SELECT po.is_promoted, po.featured_request_pending, po.forced_by_admin, po.partner_id,
              p.approved_for_featured, p.name as partner_name
       FROM partner_offers po
       JOIN partners p ON po.partner_id = p.id
       WHERE po.id = $1`,
      [offerId]
    );
    
    if (offerResult.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Offer not found' });
      }

    const offer = offerResult.rows[0];
    const setPromoted = !!is_promoted;
    
    // If promoting, check partner eligibility (unless admin is forcing it)
    if (setPromoted && !offer.approved_for_featured && !offer.forced_by_admin) {
      // Admin can still force it, but log a warning
      log(`⚠️ Admin promoting deal for ineligible partner: ${offer.partner_name} (ID: ${offer.partner_id})`);
    }
    
    await pool.query(
      `UPDATE partner_offers
         SET is_promoted = $1,
             featured_request_pending = false,
             forced_by_admin = $2,
             updated_at = NOW()
       WHERE id = $3`,
      [setPromoted, setPromoted, offerId]
    );

    await writeAudit(req.userId, 'super_admin', 'feature_moderation', 'offer', offerId, {
      previous: { 
        is_promoted: offer.is_promoted, 
        featured_request_pending: offer.featured_request_pending, 
        forced_by_admin: offer.forced_by_admin 
      },
      next: { 
        is_promoted: setPromoted, 
        featured_request_pending: false, 
        forced_by_admin: setPromoted 
      },
      partner_eligible: offer.approved_for_featured,
      reason: reason || null
    });

    return res.json({ success: true });
  } catch (err) {
    logError('admin feature moderation error', err);
    return res.status(500).json({ success: false, error: 'Failed to moderate offer' });
  }
});

// ============================================
// PARTNER: Request to feature a deal or toggle if eligible
// ============================================
app.put('/api/v1/partners/:partnerId/offers/:offerId', authenticateToken, async (req, res) => {
  try {
    const { partnerId, offerId } = req.params;
    const { is_promoted } = req.body || {};

    // Only allow the partner who owns the offer to modify (basic check)
    const offer = await pool.query('SELECT id, partner_id, is_promoted, featured_request_pending FROM partner_offers WHERE id = $1', [offerId]);
    if (offer.rowCount === 0) return res.status(404).json({ success: false, error: 'Offer not found' });
    if (String(offer.rows[0].partner_id) !== String(partnerId)) return res.status(403).json({ success: false, error: 'Not your offer' });

    // Check partner eligibility
    const partner = await pool.query('SELECT approved_for_featured FROM partners WHERE id = $1', [partnerId]);
    if (partner.rowCount === 0) return res.status(404).json({ success: false, error: 'Partner not found' });

    const wantsPromoted = !!is_promoted;
    if (wantsPromoted && partner.rows[0].approved_for_featured !== true) {
      // Mark as pending approval
      await pool.query(
        `UPDATE partner_offers
           SET featured_request_pending = true,
               updated_at = NOW()
         WHERE id = $1`,
        [offerId]
      );
      await writeAudit(req.userId, 'partner_admin', 'feature_request', 'offer', offerId, { previous: offer.rows[0], next: { featured_request_pending: true } });
      return res.status(202).json({ success: true, pendingApproval: true });
    }

    // Eligible partner: toggle is_promoted directly
    await pool.query(
      `UPDATE partner_offers
         SET is_promoted = $1,
             featured_request_pending = false,
             updated_at = NOW()
       WHERE id = $2`,
      [wantsPromoted, offerId]
    );

    await writeAudit(req.userId, 'partner_admin', 'feature_toggle', 'offer', offerId, { previous: offer.rows[0], next: { is_promoted: wantsPromoted } });
    return res.json({ success: true, is_promoted: wantsPromoted });
  } catch (err) {
    logError('partner offer update error', err);
    return res.status(500).json({ success: false, error: 'Failed to update offer' });
  }
});

// CORS error handler
app.use((err, req, res, next) => {
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      success: false,
      error: 'CORS policy violation',
      message: 'Your origin is not allowed to access this API',
      origin: req.headers.origin || 'Unknown'
    });
  }
  next(err);
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { success: false, error: 'Too many requests from this IP, please try again later' }
});
app.use(limiter);

// Specific rate limiting for OTP requests
const otpLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: process.env.NODE_ENV === 'development' ? 10 : 3, // More lenient in development
  message: 'Too many OTP requests, please try again later (wait 5 minutes)',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req, res) => {
    res.status(429).json({ 
      success: false, 
      error: 'Too many OTP requests, please try again later (wait 5 minutes)',
      retryAfter: '5 minutes'
    });
  }
});

// ============================================
// 1. DATABASE CONNECTION
// ============================================

// Vercel-safe global PG pool
let pool;

function getPgPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
    });
  }
  return pool;
}

pool = getPgPool();

// Database connection error handling
pool.on('error', (err) => {
  logError('Unexpected error on idle client', err);
  process.exit(-1);
});

// Test database connection on startup
const testConnection = async () => {
  try {
    const client = await pool.connect();
    log('✅ Database connected successfully');
    client.release();
  } catch (err) {
    logError('❌ Database connection failed:', err);
    process.exit(1);
  }
};

testConnection();

const DEFAULT_PARTNER_CATEGORIES = [
  { name: 'Dining', slug: 'dining', description: 'Restaurants, cafes, fine dining, and food experiences', display_order: 1 },
  { name: 'Spa and Salon', slug: 'spa-and-salon', description: 'Hair, beauty, spa treatments, and personal care services', display_order: 2 },
  { name: 'Healthcare', slug: 'healthcare', description: 'Hospitals, clinics, diagnostics, and premium medical services', display_order: 3 },
  { name: 'Wellness', slug: 'wellness', description: 'Fitness centers, yoga, therapy, and holistic wellness', display_order: 4 },
  { name: 'Events', slug: 'events', description: 'Concerts, shows, immersive experiences, and entertainment venues', display_order: 5 },
  { name: 'Travel', slug: 'travel', description: 'Hotels, getaways, tours, transportation, and destination travel', display_order: 6 },
  { name: 'Others', slug: 'others', description: 'Boutiques, lifestyle services, and everything in between', display_order: 7 }
];

async function ensureDefaultPartnerCategories() {
  const client = await pool.connect();
  try {
    for (const category of DEFAULT_PARTNER_CATEGORIES) {
      await client.query(
        `INSERT INTO categories (name, slug, description, is_active, display_order)
         VALUES ($1, $2, $3, true, $4)
         ON CONFLICT (slug) DO UPDATE
         SET name = EXCLUDED.name,
             description = EXCLUDED.description,
             is_active = true,
             display_order = EXCLUDED.display_order,
             updated_at = CURRENT_TIMESTAMP`,
        [category.name, category.slug, category.description, category.display_order]
      );
    }
    log('✅ Default partner categories verified');
  } catch (err) {
    logError('⚠️ Failed to ensure default categories:', err);
  } finally {
    client.release();
  }
}

ensureDefaultPartnerCategories();

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";

// ============================================
// RESPONSE HELPER FUNCTIONS
// ============================================

const successResponse = (res, statusCode, message = 'Success', data = null) => {
  res.status(statusCode).json({ success: true, message, data });
};

const errorResponse = (res, statusCode, message, details = null) => {
  const response = { success: false, error: message };
  if (details) response.details = details;
  res.status(statusCode).json(response);
};

// ============================================
// INPUT VALIDATION MIDDLEWARE
// ============================================

// ============================================
// 2. HELPER FUNCTIONS
// ============================================

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function createToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "7d" });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token provided" });

  const decoded = verifyToken(token);
  if (!decoded) return res.status(403).json({ error: "Invalid token" });

  req.userId = decoded.userId;
  next();
}

let systemSettingsEnsured = false;
let vouchersTableEnsured = false;
let ordersTableEnsured = false;

async function ensureSystemSettingsTable() {
  if (systemSettingsEnsured) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        setting_key VARCHAR(100) NOT NULL UNIQUE,
        setting_value TEXT NOT NULL,
        description TEXT,
        updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`
      INSERT INTO system_settings (setting_key, setting_value, description) VALUES
        ('loyalty_multiplier', '1', 'Points earned per ₹100 spent (default: 1 point per ₹100)'),
        ('commission_percentage', '10.0', 'Default commission percentage for partners'),
        ('voucher_expiry_days', '30', 'Voucher expiry in days from booking date'),
        ('archive_expired_after_days', '7', 'Auto-archive offers after X days of expiry')
      ON CONFLICT (setting_key) DO NOTHING;
    `);
    systemSettingsEnsured = true;
  } catch (err) {
    logError('⚠️ System settings ensure failed:', err.message || err);
  }
}

async function getSystemSetting(key, defaultValue = null) {
  try {
    await ensureSystemSettingsTable();
    const result = await pool.query(
      "SELECT setting_value FROM system_settings WHERE setting_key = $1 LIMIT 1",
      [key]
    );
    if (result.rows.length > 0) {
      return result.rows[0].setting_value;
    }
  } catch (err) {
    logError(`⚠️ Failed to read system setting "${key}":`, err.message || err);
  }
  return defaultValue;
}

async function ensureVouchersTable() {
  if (vouchersTableEnsured) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS vouchers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
        event_id UUID REFERENCES events(id) ON DELETE SET NULL,
        partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
        code VARCHAR(100) NOT NULL UNIQUE,
        qr_code_url VARCHAR(500),
        qr_code_data TEXT,
        status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'redeemed', 'expired', 'cancelled')),
        redeemed_by_partner_id UUID REFERENCES partners(id) ON DELETE SET NULL,
        redeemed_at TIMESTAMP,
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_vouchers_booking_id ON vouchers(booking_id);
      CREATE INDEX IF NOT EXISTS idx_vouchers_code ON vouchers(code);
      CREATE INDEX IF NOT EXISTS idx_vouchers_status ON vouchers(status);
      CREATE INDEX IF NOT EXISTS idx_vouchers_partner_id ON vouchers(partner_id);
    `);
    vouchersTableEnsured = true;
  } catch (err) {
    logError('⚠️ Failed to ensure vouchers table:', err.message || err);
  }
}

async function ensureOrdersTable() {
  if (ordersTableEnsured) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
        customer_name VARCHAR(255) NOT NULL,
        customer_email VARCHAR(255),
        customer_phone VARCHAR(20),
        order_items JSONB NOT NULL,
        total_amount DECIMAL(10, 2) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_orders_partner ON orders(partner_id);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
      CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
    `);
    ordersTableEnsured = true;
  } catch (err) {
    logError('⚠️ Failed to ensure orders table:', err.message || err);
  }
}
async function getUserProfile(userId) {
  try {
    const user = await pool.query(
      `SELECT 
        u.id, u.first_name, u.last_name, u.email, u.phone_number,
        u.available_tokens, u.total_tokens_earned, u.total_tokens_spent,
        u.current_tier_id,
        r.role_name,
        t.name as tier_name, t.token_earning_percentage, t.level as tier_level,
        tp.total_spend
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       LEFT JOIN tiers t ON u.current_tier_id = t.id
       LEFT JOIN tier_progress tp ON u.id = tp.user_id
       WHERE u.id = $1`,
      [userId]
    );

    if (user.rows.length > 0) {
      const userData = user.rows[0];
      const fullName = [userData.first_name, userData.last_name].filter(Boolean).join(' ').trim();

      const nextTier = await pool.query(
        'SELECT id, name, spend_needed FROM tiers WHERE level > $1 ORDER BY level ASC LIMIT 1',
        [userData.tier_level]
      );

      const spendNeeded = nextTier.rows[0]?.spend_needed || 0;

      return {
        id: userData.id,
        fullName: fullName || null,
        email: userData.email,
        phone_number: userData.phone_number,
        available_tokens: userData.available_tokens,
        total_tokens_earned: userData.total_tokens_earned,
        total_tokens_spent: userData.total_tokens_spent,
        current_tier: {
          name: userData.tier_name,
          token_earning_percentage: userData.token_earning_percentage,
          level: userData.tier_level
        },
        next_tier: nextTier.rows[0] ? {
          name: nextTier.rows[0].name,
          spend_needed: spendNeeded
        } : null,
        role_name: userData.role_name || 'user'
      };
    }
  } catch (err) {
    logError('⚠️ Failed to load user profile:', err.message || err);
  }
  return null;
}
async function createVoucherForBooking(booking, deal, userId, quantity) {
  try {
    await ensureVouchersTable();
    const partnerId = deal.partner_id;
    if (!partnerId) {
      logError('⚠️ Voucher creation skipped: missing partner id for deal', deal.id);
      return null;
    }

    const expiryDays = parseInt(await getSystemSetting('voucher_expiry_days', 30)) || 30;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiryDays);

    const voucherCode = `VCH-${booking.booking_reference.slice(-8)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const qrPayload = {
      voucher_code: voucherCode,
      booking_id: booking.id,
      booking_reference: booking.booking_reference,
      partner_id: partnerId,
      deal_id: deal.id,
      user_id: userId,
      quantity,
      amount: booking.fiat_amount || booking.total_price || 0,
      created_at: new Date().toISOString()
    };

    const qrDataUrl = await QRCode.toDataURL(JSON.stringify(qrPayload), {
      errorCorrectionLevel: 'H',
      width: 400
    });

    const insertResult = await pool.query(
      `INSERT INTO vouchers (
        booking_id, event_id, partner_id, code, qr_code_url, qr_code_data,
        status, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (code) DO NOTHING
      RETURNING *`,
      [
        booking.id,
        null,
        partnerId,
        voucherCode,
        null,
        qrDataUrl,
        'active',
        expiresAt
      ]
    );

    if (insertResult.rows.length === 0) {
      const existing = await pool.query(
        'SELECT * FROM vouchers WHERE booking_id = $1',
        [booking.id]
      );
      return existing.rows[0] || null;
    }

    return insertResult.rows[0];
  } catch (err) {
    logError('⚠️ Auto voucher creation failed:', err.message || err);
    return null;
  }
}

async function createPartnerOrderRecord(booking, deal, userProfile, quantity, finalAmount, specialRequests, totalOriginalAmount, totalDiscountAmount, eztRedeemed) {
  try {
    await ensureOrdersTable();
    const itemsPayload = [
      {
        name: deal.title || 'Booking',
        quantity,
        price: finalAmount,
        original_price: totalOriginalAmount,
        discount_amount: totalDiscountAmount,
        ezt_redeemed: eztRedeemed
      }
    ];

    const customerName = userProfile?.fullName || userProfile?.first_name || 'Guest';

    const orderResult = await pool.query(
      `INSERT INTO orders (
        partner_id, customer_name, customer_email, customer_phone,
        order_items, total_amount, status, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        deal.partner_id,
        customerName,
        userProfile?.email || null,
        userProfile?.phone_number || null,
        JSON.stringify(itemsPayload),
        finalAmount,
        'confirmed',
        specialRequests || null
      ]
    );

    return orderResult.rows[0];
  } catch (err) {
    logError('⚠️ Failed to create partner order record:', err.message || err);
    return null;
  }
}

// =====================================================
// ✅ Middleware to parse JSON and handle form data
// ✅ Note: express.json() and express.urlencoded() are already configured above (line 183-184)
// =====================================================

// ============================================
// 3. AUTH ENDPOINTS — OTP SEND + VERIFY (DB)
// ============================================

// 3A. SEND OTP (stores securely in DB)
app.post("/api/v1/auth/send-otp", otpLimiter, validatePhoneNumber, async (req, res) => {
  try {
    const { phone_number, country_code = "+91", purpose = "login" } = req.body;

    if (!phone_number)
      return res.status(400).json({ success: false, error: "Phone number required" });

    const otp = generateOTP();
    const hashedOtp = await bcrypt.hash(otp, 5);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // expires in 5 minutes

    // Delete older unverified OTPs for this number
    await pool.query(
      `DELETE FROM otp_sessions WHERE phone_number = $1 AND verified = false`,
      [phone_number]
    );

    // Insert new OTP entry
    await pool.query(
      `INSERT INTO otp_sessions (phone_number, country_code, otp_hash, purpose, expires_at, verified, attempts)
       VALUES ($1, $2, $3, $4, $5, false, 0)`,
      [phone_number, country_code, hashedOtp, 'login', expiresAt]
    );

    // OTP logged only for development - remove in production
    if (process.env.NODE_ENV === 'development' && process.env.LOG_OTP !== 'false') {
      log(`[DEV] OTP for ${country_code}${phone_number}: ${otp}`);
    }

    // TODO: Integrate external SMS service here (Twilio, MSG91, AWS SNS)
    // sendSMS(country_code + phone_number, `Your OTP for Elizian is ${otp}. It expires in 5 minutes.`);
    
    // TEMPORARY: Log OTP to console and file for development
    if (process.env.NODE_ENV === 'development' || process.env.LOG_OTP === 'true') {
      const otpLogMessage = `🔐 OTP for ${phone_number}: ${otp} (expires in 5 minutes) - ${new Date().toISOString()}\n`;
      console.log(otpLogMessage.trim());
      
      if (process.env.VERCEL) {
        log('⚠️ Skipping OTP file logging on Vercel');
      } else {
        // Write to otp.log file (local/dev only)
        const fs = require('fs');
        const path = require('path');
        const logPath = path.join(__dirname, 'otp.log');
        fs.appendFileSync(logPath, otpLogMessage);
      }
    }

    successResponse(res, 200, "OTP sent successfully", { expires_in: "5 minutes" });
  } catch (err) {
    logError("❌ OTP generation error:", err);
    errorResponse(res, 500, "Failed to generate OTP", err.message);
  }
});

// 3B. VERIFY OTP (validates via DB)
app.post("/api/v1/auth/verify-otp", validatePhoneNumber, async (req, res) => {
  try {
    const { phone_number, otp_code } = req.body;

    if (!phone_number || !otp_code)
      return res.status(400).json({ success: false, error: "Phone number and OTP required" });

    const result = await pool.query(
      `SELECT id, otp_hash, expires_at, verified, attempts
       FROM otp_sessions
       WHERE phone_number = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [phone_number]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ success: false, error: "No OTP found for this number" });

    const otpSession = result.rows[0];

    // Check if already verified
    if (otpSession.verified)
      return res.status(400).json({ success: false, error: "OTP already verified" });

    // Check expiry
    if (new Date(otpSession.expires_at) < new Date())
      return res.status(400).json({ success: false, error: "OTP expired" });

    // Check attempt count (max 5 attempts)
    if (otpSession.attempts >= 5)
      return res.status(403).json({ success: false, error: "Maximum attempts exceeded" });

    // Compare OTP hash
    log(`🔍 Verifying OTP for ${phone_number}: received="${otp_code}" (type: ${typeof otp_code})`);
    const otpMatch = await bcrypt.compare(String(otp_code), otpSession.otp_hash);
    log(`🔍 OTP match result: ${otpMatch}`);
    
    if (!otpMatch) {
      await pool.query(
        `UPDATE otp_sessions SET attempts = attempts + 1 WHERE id = $1`,
        [otpSession.id]
      );
      log(`❌ Invalid OTP attempt for ${phone_number}. Attempts: ${otpSession.attempts + 1}`);
      return res.status(400).json({ success: false, error: "Invalid OTP" });
    }

    // Mark as verified
    await pool.query(
      `UPDATE otp_sessions
       SET verified = true, verified_at = NOW()
       WHERE id = $1`,
      [otpSession.id]
    );

    // Check if user already exists
    const existingUser = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.phone_number, u.current_tier_id
       FROM users u
       WHERE u.phone_number = $1`,
      [phone_number]
    );

    if (existingUser.rows.length > 0) {
      // User exists - generate login token
      const user = existingUser.rows[0];
      const token = jwt.sign(
        { 
          userId: user.id, 
          phone: user.phone_number,
          type: 'user' 
        },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      return res.status(200).json({
        success: true,
        message: "OTP verified successfully",
        token: token,
        user: {
          id: user.id,
          first_name: user.first_name,
          last_name: user.last_name,
          email: user.email,
          phone_number: user.phone_number,
          current_tier_id: user.current_tier_id
        }
      });
    } else {
      // User doesn't exist - return success without token (needs registration)
      return res.status(200).json({
        success: true,
        message: "OTP verified successfully. Please complete registration.",
        requiresRegistration: true
      });
    }
  } catch (err) {
    logError("❌ OTP verification error:", err);
    errorResponse(res, 500, "OTP verification failed", err.message);
  }
});

// Browser-friendly POST messages
app.get("/api/v1/auth/send-otp", (req, res) =>
  res.send("ℹ️ Use POST with JSON { phone_number } to send OTP.")
);
app.get("/api/v1/auth/verify-otp", (req, res) =>
  res.send("ℹ️ Use POST with JSON { phone_number, otp_code } to verify OTP.")
);

// ============================================
// 4A. USER REGISTRATION
// ============================================

app.post("/api/v1/auth/register", sanitizeInput, async (req, res) => {
  try {
    const { phone_number, first_name, last_name, name, email, password, role = 'user' } = req.body;
    
    log(`🔐 Registration attempt: role=${role}, email=${email}, phone=${phone_number}, has_password=${!!password}`);
    
    // Extract first_name and last_name from req.body
    // If first_name and last_name are provided, use them
    // If name is provided but first_name/last_name are missing, construct them from name
    let firstName = (first_name || '').trim();
    let lastName = (last_name || '').trim();
    
    // If name is provided and first_name is missing, construct from name
    if (!firstName && name) {
      const nameParts = (name || '').trim().split(/\s+/);
      firstName = nameParts[0] || '';
      lastName = nameParts.slice(1).join(' ') || '';
    }
    
    // Validate that at least first_name is provided
    if (!firstName || firstName.trim().length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: "First name is required. Provide either 'first_name' or 'name' field." 
      });
    }

    // Handle Super Admin registration FIRST (bypass OTP for initial setup)
    if (role === 'super_admin') {
      log('🔑 Super Admin registration detected');
      
      // Super Admin MUST have email and password
      if (!email || !password) {
        return res.status(400).json({ 
          success: false, 
          error: "Super Admin requires email and password." 
        });
      }

      // Validate email format
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ 
          success: false, 
          error: "Invalid email format." 
        });
      }

      // Validate password strength
      if (password.length < 6) {
        return res.status(400).json({ 
          success: false, 
          error: "Password must be at least 6 characters long." 
        });
      }

      // Check if super admin already exists
      // Try to check by role_id first, fallback to email check if role_id column doesn't exist
      let existingSuperAdmin = { rows: [] };
      try {
        existingSuperAdmin = await pool.query(
          `SELECT u.id FROM users u 
           JOIN roles r ON u.role_id = r.id 
           WHERE r.role_name IN ('super_admin', 'admin', 'super-admin') LIMIT 1`
        );
      } catch (roleCheckError) {
        // If role_id column doesn't exist (PostgreSQL error code 42703 or message contains role_id), skip role-based check
        // We'll rely on email uniqueness check instead
        const errorMsg = roleCheckError.message || '';
        const isRoleIdError = roleCheckError.code === '42703' || 
                              errorMsg.toLowerCase().includes('role_id') ||
                              errorMsg.toLowerCase().includes('does not exist');
        
        if (isRoleIdError) {
          log('⚠️ role_id column not found, skipping role-based super admin check');
        } else {
          throw roleCheckError; // Re-throw if it's a different error
        }
      }
      
      if (existingSuperAdmin.rows.length > 0) {
        return res.status(409).json({ 
          success: false, 
          error: "Super Admin already exists. Please log in instead." 
        });
      }

      // Check if email already taken
      const existingEmail = await pool.query(
        "SELECT id FROM users WHERE LOWER(email) = LOWER($1)",
        [email]
      );

      if (existingEmail.rows.length > 0) {
        return res.status(409).json({ 
          success: false, 
          error: "Email already registered." 
        });
      }

      // Get or create super_admin role (only if roles table exists)
      let roleId = null;
      try {
        let roleResult = await pool.query(
          "SELECT id FROM roles WHERE role_name = 'super_admin' LIMIT 1"
        );
        
        roleId = roleResult.rows[0]?.id;
        
        // If super_admin role doesn't exist, create it
        if (!roleId) {
          log('⚠️ Super Admin role not found, creating it...');
          const createRoleResult = await pool.query(
            `INSERT INTO roles (role_name, description) 
             VALUES ('super_admin', 'Super Administrator with full system access')
             RETURNING id`
          );
          roleId = createRoleResult.rows[0].id;
          log(`✅ Created super_admin role with id: ${roleId}`);
        }
      } catch (roleError) {
        // If roles table doesn't exist, roleId will be null
        log('⚠️ Roles table not found, proceeding without role_id');
      }

      // Get default tier (Ather) - ensure new users start at Ather
      let tierResult = await pool.query("SELECT id FROM tiers WHERE LOWER(name) IN ('ather', 'aether') ORDER BY name LIMIT 1");
      let tierId = tierResult.rows[0]?.id;

      if (!tierId) {
        log('⚠️ Default tier not found, creating Ather tier...');
        const createTierResult = await pool.query(
          `INSERT INTO tiers (name, level, token_earning_percentage, min_spend_required, description, color_code) 
           VALUES ('Ather', 1, 1.00, 0, 'Default membership tier', '#B0BEC5')
           RETURNING id`
        );
        tierId = createTierResult.rows[0].id;
      }

      // Use extracted first_name and last_name (already processed above)
      // Hash password
      const passwordHash = await bcrypt.hash(password, 10);

      // Create super admin user
      // Try with role_id first, fallback to without role_id if column doesn't exist
      let userInsert;
      try {
        if (roleId) {
          userInsert = await pool.query(
            `INSERT INTO users (phone_number, email, first_name, last_name, current_tier_id, role_id)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, email, first_name, last_name, phone_number`,
            [phone_number || null, email, firstName, lastName, tierId, roleId]
          );
        } else {
          throw new Error('roleId is null, try without role_id');
        }
      } catch (insertError) {
        // If role_id column doesn't exist (PostgreSQL error code 42703 or message contains role_id), insert without it
        const errorMsg = insertError.message || '';
        const isRoleIdError = insertError.code === '42703' || 
                              errorMsg.toLowerCase().includes('role_id') ||
                              errorMsg.toLowerCase().includes('does not exist');
        
        if (isRoleIdError) {
          log('⚠️ role_id column not found, creating user without role_id');
          userInsert = await pool.query(
            `INSERT INTO users (phone_number, email, first_name, last_name, current_tier_id)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, email, first_name, last_name, phone_number`,
            [phone_number || null, email, firstName, lastName, tierId]
          );
        } else {
          throw insertError; // Re-throw if it's a different error
        }
      }

      const userId = userInsert.rows[0].id;

      // Initialize tier_progress for new user (starts at Ather with 0 spend)
      await pool.query(
        `INSERT INTO tier_progress (user_id, current_tier_id, total_spend)
         VALUES ($1, $2, 0)
         ON CONFLICT (user_id) DO NOTHING`,
        [userId, tierId]
      );

      // Create auth credentials
      await pool.query(
        `INSERT INTO user_auth_credentials (user_id, password_hash, email_verified)
         VALUES ($1, $2, true)
         ON CONFLICT (user_id) DO UPDATE SET password_hash = $2, email_verified = true`,
        [userId, passwordHash]
      );

      await grantSignupBonus(userId);

      // Generate JWT token
      const token = jwt.sign(
        { 
          userId: userId, 
          phone: phone_number || null,
          email: email,
          role: 'super_admin',
          type: 'user' 
        },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      log(`✅ Super Admin created successfully: ${email}`);

      return res.status(201).json({
        success: true,
        message: "Super Admin registered successfully",
        token: token,
        user: {
          id: userId,
          phone_number: phone_number || null,
          email: email,
          first_name: firstName,
          last_name: lastName,
          role: 'super_admin',
          current_tier_id: tierId
        }
      });
    }

    // REGULAR USER REGISTRATION (requires phone and OTP)
    
    // Validate phone number
    if (!phone_number) {
      return res.status(400).json({ 
        success: false, 
        error: "Phone number is required for user registration." 
      });
    }

    // Clean phone number - remove all non-digits first, then remove leading country code
    let cleanPhone = String(phone_number).replace(/\D/g, ''); // Remove all non-digits
    // Remove leading country codes (91 for India)
    if (cleanPhone.startsWith('91') && cleanPhone.length === 12) {
      cleanPhone = cleanPhone.substring(2);
    }
    // Final validation - must be exactly 10 digits
    if (cleanPhone.length !== 10 || !/^\d{10}$/.test(cleanPhone)) {
      // Log detailed info for debugging
      log(`⚠️ Phone validation failed: Received="${phone_number}", Cleaned="${cleanPhone}", Length=${cleanPhone.length}`);
      return res.status(400).json({ 
        success: false, 
        error: "Invalid phone number format. Must be exactly 10 digits. Please enter a valid 10-digit mobile number." 
      });
    }

    // Check if OTP is verified for this phone number
    const otpCheck = await pool.query(
      `SELECT id, verified, expires_at, created_at 
       FROM otp_sessions
       WHERE phone_number = $1 AND verified = true 
       ORDER BY verified_at DESC
       LIMIT 1`,
      [cleanPhone]
    );

    if (otpCheck.rows.length === 0 || !otpCheck.rows[0].verified) {
      return res.status(403).json({ 
        success: false, 
        error: "OTP verification required before registration. Please verify your phone number first." 
      });
    }

    // Check if verification is not too old (within last 30 minutes)
    const verifiedAt = new Date(otpCheck.rows[0].verified_at || otpCheck.rows[0].created_at);
    const verificationAge = Date.now() - verifiedAt.getTime();
    if (verificationAge > 30 * 60 * 1000) {
      return res.status(403).json({ 
        success: false, 
        error: "OTP verification expired. Please verify again." 
      });
    }

    // Email is optional, but if provided, validate format
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ 
        success: false, 
        error: "Invalid email format." 
      });
    }

    // Password is optional, but if provided, validate strength (min 8 chars)
    if (password && password.length > 0 && password.length < 8) {
      return res.status(400).json({ 
        success: false, 
        error: "Password must be at least 8 characters long if provided." 
      });
    }

    // Use extracted first_name and last_name (already processed above)
    // Check if user already exists by phone number
    const existingUserByPhone = await pool.query(
      "SELECT id FROM users WHERE phone_number = $1",
      [cleanPhone]
    );

    if (existingUserByPhone.rows.length > 0) {
      return res.status(409).json({ 
        success: false, 
        error: "User with this phone number already exists. Please log in instead." 
      });
    }

    // Check if user already exists by email (if email provided)
    if (email) {
      const existingUserByEmail = await pool.query(
        "SELECT id FROM users WHERE email = $1",
        [email]
    );

      if (existingUserByEmail.rows.length > 0) {
        return res.status(409).json({ 
          success: false, 
          error: "User with this email already exists." 
        });
      }
    }

    // Map role to database role_name
    let dbRoleName = 'user'; // default
    if (role === 'partner') {
      dbRoleName = 'partner_admin';
    }

    const roleResult = await pool.query(
      "SELECT id FROM roles WHERE role_name = $1 LIMIT 1",
      [dbRoleName]
    );

    const roleId = roleResult.rows[0]?.id;
    if (!roleId) {
      return res.status(500).json({
        success: false,
        error: `Role '${dbRoleName}' not found. Please initialize database tables.`
      });
    }

    // Get default tier
    const tierRes = await pool.query("SELECT id FROM tiers WHERE LOWER(name) IN ('ather', 'aether') ORDER BY name LIMIT 1");
    const tierId = tierRes.rows[0]?.id || null;

    if (!tierId) {
      return res.status(500).json({ 
        success: false, 
        error: "Default tier not found. Please run the seed script." 
      });
    }

    // Hash password if provided, otherwise null
    const passwordHash = password && password.length > 0 ? await bcrypt.hash(password, 10) : null;

    const userInsert = await pool.query(
      `INSERT INTO users (phone_number, email, first_name, last_name, current_tier_id, role_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, first_name, last_name, phone_number`,
      [cleanPhone, email || null, firstName, lastName, tierId, roleId]
    );

    const userId = userInsert.rows[0].id;

    // Initialize tier_progress for new user (starts at Ather with 0 spend)
    await pool.query(
      `INSERT INTO tier_progress (user_id, current_tier_id, total_spend)
       VALUES ($1, $2, 0)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId, tierId]
    );

    // Only create auth credentials if password was provided
    if (passwordHash) {
      await pool.query(
        `INSERT INTO user_auth_credentials (user_id, password_hash, email_verified)
         VALUES ($1, $2, false)
         ON CONFLICT (user_id) DO UPDATE SET password_hash = $2`,
        [userId, passwordHash]
      );
    }

    // Mark OTP session as used (optional, for audit trail)
    await pool.query(
      `UPDATE otp_sessions SET verified = true WHERE phone_number = $1 AND id = $2`,
      [cleanPhone, otpCheck.rows[0].id]
    );

    await grantSignupBonus(userId);

    // Generate JWT token for new user
    const token = jwt.sign(
      { 
        userId: userId, 
        phone: cleanPhone,
        email: email || null,
        role: dbRoleName,
        type: 'user' 
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      token: token,
      user: {
        id: userId,
        phone_number: cleanPhone,
        email: email || null,
        first_name: firstName,
        last_name: lastName,
        role: dbRoleName,
        current_tier_id: tierId
      }
    });
  } catch (err) {
    logError("❌ Registration error:", err);
    res.status(500).json({ success: false, error: "Registration failed", details: err.message });
  }
});

app.get("/api/v1/auth/register", (req, res) =>
  res.send("ℹ️ Use POST with JSON { phone_number, name, email, password, role } to register.")
);
// ============================================
// 4B. LOGIN USER
// ============================================

app.post("/api/v1/auth/login", validateRequired(['email', 'password']), validateEmail, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ success: false, error: "Email and password required" });

    // Try to get user with role info, fallback to without role if role_id column doesn't exist
    let userRes;
    try {
      userRes = await pool.query(
        `SELECT u.id, u.first_name, u.last_name, u.email, u.phone_number, u.role_id, r.role_name, c.password_hash
         FROM users u
         JOIN user_auth_credentials c ON u.id = c.user_id
         LEFT JOIN roles r ON u.role_id = r.id
         WHERE u.email = $1`,
        [email]
      );
    } catch (roleError) {
      // If role_id column doesn't exist (PostgreSQL error code 42703 or message contains role_id), query without it
      const errorMsg = roleError.message || '';
      const isRoleIdError = roleError.code === '42703' || 
                            errorMsg.toLowerCase().includes('role_id') ||
                            errorMsg.toLowerCase().includes('does not exist');
      
      if (isRoleIdError) {
        userRes = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.phone_number, c.password_hash
       FROM users u
       JOIN user_auth_credentials c ON u.id = c.user_id
       WHERE u.email = $1`,
      [email]
    );
        // Add default role_name for compatibility
        if (userRes.rows.length > 0) {
          userRes.rows[0].role_name = 'user';
        }
      } else {
        throw roleError; // Re-throw if it's a different error
      }
    }

    if (userRes.rows.length === 0)
      return res.status(400).json({ success: false, error: "Invalid credentials" });

    const user = userRes.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch)
      return res.status(400).json({ success: false, error: "Invalid credentials" });

    // Create token with role information
    const token = jwt.sign(
      { 
        userId: user.id,
        role: user.role_name || 'user',
        type: 'user' 
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        phone_number: user.phone_number,
      },
    });
  } catch (err) {
    logError("❌ Login error:", err);
    res.status(500).json({ success: false, error: "Login failed", details: err.message });
  }
});

app.get("/api/v1/auth/login", (req, res) =>
  res.send("ℹ️ Use POST with JSON { email, password } to log in.")
);
// ============================================
// 4C. USER PROFILE (PROTECTED)
// ============================================

app.get('/api/v1/user/profile', authenticateToken, async (req, res) => {
  try {
    const user = await pool.query(
      `SELECT 
        u.id, u.first_name, u.last_name, u.email, u.phone_number,
        u.available_tokens, u.total_tokens_earned, u.total_tokens_spent,
        u.current_tier_id,
        r.role_name,
        t.name as tier_name, t.token_earning_percentage, t.level as tier_level,
        tp.total_spend
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       LEFT JOIN tiers t ON u.current_tier_id = t.id
       LEFT JOIN tier_progress tp ON u.id = tp.user_id
       WHERE u.id = $1`,
      [req.userId]
    );
    if (user.rows.length === 0) return errorResponse(res, 404, 'User not found');
    
    const userData = user.rows[0];
    
    // Get next tier information
    let nextTier = null;
    if (userData.tier_level) {
      const nextTierResult = await pool.query(
        'SELECT name, min_spend_required FROM tiers WHERE level = $1 LIMIT 1',
        [userData.tier_level + 1]
      );
      if (nextTierResult.rows.length > 0) {
        nextTier = nextTierResult.rows[0];
      }
    }
    
    // Calculate spend needed for next tier
    const totalSpend = parseFloat(userData.total_spend || 0);
    const nextTierSpend = nextTier ? parseFloat(nextTier.min_spend_required || 0) : null;
    const spendNeeded = nextTierSpend ? Math.max(0, nextTierSpend - totalSpend) : null;

    successResponse(res, 200, 'Profile retrieved successfully', {
      ...userData,
      ezt_balance: parseFloat(userData.available_tokens || 0),
      ezt_total_earned: parseFloat(userData.total_tokens_earned || 0),
      ezt_total_spent: parseFloat(userData.total_tokens_spent || 0),
      current_tier: userData.tier_name || 'Ather',
      tier_percentage: parseFloat(userData.token_earning_percentage || 1),
      total_spend: totalSpend,
      next_tier: nextTier ? {
        name: nextTier.name,
        spend_needed: spendNeeded
      } : null,
      role_name: userData.role_name || 'user'
    });
  } catch (err) {
    logError("❌ Profile fetch error:", err);
    errorResponse(res, 500, 'Failed to fetch profile', err.message);
  }
});

// ============================================
// 4D. CATEGORIES
// ============================================

app.get("/api/v1/categories", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, slug, description, is_active, display_order
      FROM categories
      ORDER BY display_order ASC;
    `);
    successResponse(res, 200, 'Categories retrieved successfully', result.rows);
  } catch (err) {
    logError('Categories error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// 4E. PARTNERS
// ============================================

app.get("/api/v1/partners", async (req, res) => {
  try {
    const { category } = req.query;
    const query = `
      SELECT p.id, p.name, p.description, p.partner_discount_percentage AS discount_percentage,
             p.latitude, p.longitude, p.address, p.partner_code, p.email, p.phone_number,
             p.approved_for_featured,
             c.slug AS category, c.name AS category_name
      FROM partners p
      JOIN categories c ON p.category_id = c.id
      WHERE ($1::text IS NULL OR c.slug = $1)
      ORDER BY p.name ASC;
    `;
    const result = await pool.query(query, [category || null]);
    const formatted = result.rows.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      discount_percentage: Number(r.discount_percentage),
      latitude: r.latitude,
      longitude: r.longitude,
      city: extractCity(r.address),
      address: r.address,
      partner_code: r.partner_code,
      email: r.email,
      phone_number: r.phone_number,
      approved_for_featured: r.approved_for_featured || false,
    }));
    res.json({ success: true, category: category || "all", data: formatted });
  } catch (err) {
    logError('Partners error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

function extractCity(address) {
  if (!address) return null;
  const parts = address.split(",").map((p) => p.trim());
  return parts[parts.length - 1] || null;
}

// ============================================
// 5. TEST ROUTES
// ============================================

app.get("/api/v1/test-db", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({ success: true, db_time: result.rows[0].now });
  } catch (err) {
    logError('Test DB error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// ADMIN ENDPOINTS
// ============================================

// Create Category
app.post("/api/v1/categories", async (req, res) => {
  try {
    const { name, slug, description, display_order, is_active = true } = req.body;
    
    if (!name || !slug) {
      return errorResponse(res, 400, "Name and slug are required");
    }

    const result = await pool.query(
      `INSERT INTO categories (name, slug, description, display_order, is_active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, slug, description, display_order || 1, is_active]
    );

    successResponse(res, 201, "Category created successfully", result.rows[0]);
  } catch (err) {
    logError("❌ Category creation error:", err);
    if (err.code === '23505') {
      errorResponse(res, 400, "Category with this name or slug already exists");
    } else {
      errorResponse(res, 500, "Failed to create category");
    }
  }
});

// Delete Category
app.delete("/api/v1/categories/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      `DELETE FROM categories WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return errorResponse(res, 404, "Category not found");
    }

    successResponse(res, 200, "Category deleted successfully");
  } catch (err) {
    logError("❌ Category deletion error:", err);
    errorResponse(res, 500, "Failed to delete category");
  }
});

// Create Partner (Admin only - requires approval)
app.post("/api/v1/partners", authenticateToken, requireSuperAdmin, async (req, res) => {
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
      is_active = false  // Changed default to false - requires explicit approval
    } = req.body;
    
    if (!name || !category_id) {
      return errorResponse(res, 400, "Name and category_id are required");
    }

    const lat = coordinates?.lat || null;
    const lng = coordinates?.lng || null;

    const result = await pool.query(
      `INSERT INTO partners (name, category_id, description, address, phone_number, email, partner_discount_percentage, rating, latitude, longitude, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [name, category_id, description, address, phone, email, discount_percentage || 0, rating, lat, lng, is_active]
    );

    // Log audit trail
    await writeAudit(req.userId, 'super_admin', 'partner_create', 'partner', result.rows[0].id, {
      partner_name: name,
      category_id: category_id,
      is_active: is_active
    });

    successResponse(res, 201, "Partner created successfully", result.rows[0]);
  } catch (err) {
    logError("❌ Partner creation error:", err);
    if (err.code === '23503') {
      errorResponse(res, 400, "Invalid category_id");
    } else {
      errorResponse(res, 500, "Failed to create partner");
    }
  }
});

// Get Single Partner
app.get("/api/v1/partners/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      `SELECT p.*, c.name as category_name, c.slug as category_slug 
       FROM partners p 
       LEFT JOIN categories c ON p.category_id = c.id 
       WHERE p.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return errorResponse(res, 404, "Partner not found");
    }

    successResponse(res, 200, "Partner retrieved successfully", result.rows[0]);
  } catch (err) {
    logError("❌ Partner retrieval error:", err);
    errorResponse(res, 500, "Failed to retrieve partner");
  }
});

// Update Partner
app.put("/api/v1/partners/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      name, 
      description, 
      address, 
      phone_number, 
      email, 
      partner_discount_percentage, 
      rating,
      is_active,
      website_url,
      partner_category_type
    } = req.body;
    
    const result = await pool.query(
      `UPDATE partners 
       SET name = COALESCE($2, name),
           description = COALESCE($3, description),
           address = COALESCE($4, address),
           phone_number = COALESCE($5, phone_number),
           email = COALESCE($6, email),
           partner_discount_percentage = COALESCE($7, partner_discount_percentage),
           rating = COALESCE($8, rating),
           is_active = COALESCE($9, is_active),
           website_url = COALESCE($10, website_url),
           partner_category_type = COALESCE($11, partner_category_type),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 
       RETURNING *`,
      [id, name, description, address, phone_number, email, partner_discount_percentage, rating, is_active, website_url, partner_category_type]
    );

    if (result.rows.length === 0) {
      return errorResponse(res, 404, "Partner not found");
    }

    successResponse(res, 200, "Partner updated successfully", result.rows[0]);
  } catch (err) {
    logError("❌ Partner update error:", err);
    errorResponse(res, 500, "Failed to update partner");
  }
});

// Delete Partner
app.delete("/api/v1/partners/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      `DELETE FROM partners WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return errorResponse(res, 404, "Partner not found");
    }

    successResponse(res, 200, "Partner deleted successfully");
  } catch (err) {
    logError("❌ Partner deletion error:", err);
    errorResponse(res, 500, "Failed to delete partner");
  }
});

// ============================================
// PARTNER MENU ITEMS MANAGEMENT
// ============================================

// Create menu items table if it doesn't exist
app.get("/api/v1/partners/:id/menu", async (req, res) => {
  try {
    const { id } = req.params;
    const { include_lifecycle } = req.query; // Optional: return active/archived separation
    
    // Create menu_items table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS menu_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        price DECIMAL(10, 2) NOT NULL,
        category VARCHAR(100),
        is_available BOOLEAN DEFAULT true,
        image_url VARCHAR(500),
        preparation_time INT DEFAULT 15,
        service_category_id UUID REFERENCES service_categories(id),
        duration_minutes INTEGER,
        max_capacity INTEGER,
        requires_booking BOOLEAN DEFAULT false,
        service_type VARCHAR(50) DEFAULT 'food',
        event_date DATE,
        event_time TIME,
        organizer_name VARCHAR(255),
        venue_name VARCHAR(255),
        is_time_bound BOOLEAN DEFAULT false,
        start_time TIMESTAMP NULL,
        end_time TIMESTAMP NULL,
        status VARCHAR(20) DEFAULT 'active',
        is_trending BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Add is_trending column if it doesn't exist (for existing tables)
    await pool.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'menu_items' AND column_name = 'is_trending'
        ) THEN
          ALTER TABLE menu_items ADD COLUMN is_trending BOOLEAN DEFAULT false;
          CREATE INDEX IF NOT EXISTS idx_menu_items_trending ON menu_items(is_trending);
        END IF;
      END $$;
    `);

    const result = await pool.query(`
      SELECT mi.*, sc.name as service_category_name, sc.slug as service_category_slug, sc.icon as service_category_icon
      FROM menu_items mi
      LEFT JOIN service_categories sc ON mi.service_category_id = sc.id
      WHERE mi.partner_id = $1 
      ORDER BY mi.created_at DESC
    `, [id]);

    // Enrich with lifecycle status
    const enrichedItems = enrichWithLifecycleStatus(result.rows);

    // If client requests lifecycle separation
    if (include_lifecycle === 'true') {
      const separated = separateByLifecycle(result.rows);
      return res.json({
        success: true,
        message: "Menu items retrieved successfully",
        active: separated.active,
        archived: separated.archived,
        scheduled: separated.scheduled,
        total: enrichedItems.length
      });
    }

    // Default: return all items with computed_status
    successResponse(res, 200, "Menu items retrieved successfully", enrichedItems);
  } catch (err) {
    logError("❌ Menu items retrieval error:", err);
    errorResponse(res, 500, "Failed to retrieve menu items");
  }
});

// ============================================
// HELPER: SYNC MENU ITEM TO EVENTS TABLE
// ============================================
async function syncMenuItemToEvent(client, menuItem) {
  try {
    // Only sync if it's an event-type menu item
    if (menuItem.service_type !== 'events') {
      return { success: true, message: 'Not an event, skipping sync' };
    }

    // Build start_time from event_date + event_time
    if (!menuItem.event_date || !menuItem.event_time) {
      console.log('⚠️ Event missing date/time, skipping sync:', menuItem.name);
      return { success: false, message: 'Missing event_date or event_time' };
    }

    // Extract date portion from event_date (handles both DATE and TIMESTAMP formats)
    let dateStr = menuItem.event_date;
    if (dateStr instanceof Date) {
      dateStr = dateStr.toISOString().split('T')[0];
    } else if (typeof dateStr === 'string' && dateStr.includes('T')) {
      dateStr = dateStr.split('T')[0];
    }

    // Extract time portion (remove timezone if present)
    let timeStr = menuItem.event_time;
    if (typeof timeStr === 'string') {
      timeStr = timeStr.split('+')[0].split('Z')[0]; // Remove timezone
      if (timeStr.split(':').length === 2) {
        timeStr += ':00'; // Add seconds if missing
      }
    }

    const startTime = `${dateStr} ${timeStr}`; // Use space instead of T for PostgreSQL TIMESTAMP format
    const endTime = null; // Can be calculated if duration is provided
    const bookingCap = menuItem.max_capacity || null;
    const pricePerTicket = menuItem.price || 0;
    const imageUrl = menuItem.image_url || null;
    const description = menuItem.description || null;
    const status = menuItem.is_available ? 'active' : 'inactive';

    // Check if event exists
    const existing = await client.query(
      'SELECT id FROM events WHERE venue_id = $1 AND title = $2 LIMIT 1',
      [menuItem.partner_id, menuItem.name]
    );

    if (existing.rows.length > 0) {
      // Update existing event
      await client.query(
        `UPDATE events
         SET description = $1,
             start_time = $2,
             end_time = $3,
             booking_cap = $4,
             price_per_ticket = $5,
             image_url = $6,
             status = $7,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $8`,
        [description, startTime, endTime, bookingCap, pricePerTicket, imageUrl, status, existing.rows[0].id]
      );
      log(`✅ Synced menu item to existing event: ${menuItem.name} (status: ${status})`);
      return { success: true, message: 'Event updated', eventId: existing.rows[0].id };
    } else {
      // Insert new event
      const result = await client.query(
        `INSERT INTO events (venue_id, title, description, start_time, end_time, booking_cap, price_per_ticket, image_url, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [menuItem.partner_id, menuItem.name, description, startTime, endTime, bookingCap, pricePerTicket, imageUrl, status]
      );
      log(`✅ Created new event from menu item: ${menuItem.name} (status: ${status})`);
      return { success: true, message: 'Event created', eventId: result.rows[0].id };
    }
  } catch (err) {
    logError('❌ Error syncing menu item to event:', err);
    return { success: false, message: err.message };
  }
}

// ============================================
// PARTNER MENU ITEMS MANAGEMENT
// ============================================

// Add Menu Item
app.post("/api/v1/partners/:id/menu", async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { 
      name, description, price, category, is_available = true, image_url, image_base64, image_filename, preparation_time = 15,
      service_category_id, duration_minutes, max_capacity, requires_booking = false, service_type = 'food',
      event_date, event_time, organizer_name, venue_name
    } = req.body;
    
    if (!name || price === undefined || price === null) {
      return errorResponse(res, 400, "Name and price are required");
    }
    
    // Validate price is a number and >= 0
    if (isNaN(price) || price < 0) {
      return errorResponse(res, 400, "Price must be 0 or greater");
    }

    // Start transaction
    await client.query('BEGIN');

    // Verify partner exists
    const partnerCheck = await client.query(
      'SELECT id FROM partners WHERE id = $1 AND is_active = true',
      [id]
    );

    if (partnerCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return errorResponse(res, 404, "Partner not found or inactive");
    }

    // Resolve image: accept direct URL or base64 upload
    // Events go to /uploads/events, other services go to /uploads/menu
    let finalImageUrl = image_url || null;
    try {
      if (!finalImageUrl && image_base64) {
        if (process.env.VERCEL) {
          await client.query('ROLLBACK');
          return errorResponse(res, 500, "Local file storage not supported on Vercel");
        }
        // Determine upload directory based on service type
        const subFolder = service_type === 'events' ? 'events' : 'menu';
        const uploadsDir = path.join(__dirname, `../frontend/public/uploads/${subFolder}`);
        fs.mkdirSync(uploadsDir, { recursive: true });
        
        let base64Data = image_base64;
        let extension = 'jpg';
        const match = /^data:(.*?);base64,(.*)$/.exec(image_base64);
        if (match) {
          const mime = match[1] || 'image/jpeg';
          base64Data = match[2];
          if (mime.includes('png')) extension = 'png';
          else if (mime.includes('webp')) extension = 'webp';
          else if (mime.includes('jpeg') || mime.includes('jpg')) extension = 'jpg';
        }
        
        // Generate filename with service type prefix
        const prefix = service_type === 'events' ? 'event' : 'item';
        const safeName = (image_filename && image_filename.replace(/[^a-zA-Z0-9-_\.]/g, '')) 
          || `${prefix}_${Date.now()}.${extension}`;
        const targetPath = path.join(uploadsDir, safeName);
        fs.writeFileSync(targetPath, Buffer.from(base64Data, 'base64'));
        finalImageUrl = `/uploads/${subFolder}/${safeName}`;
        log(`✅ Image uploaded to: ${finalImageUrl}`);
      }
    } catch (fileErr) {
      logError('❌ Image upload error:', fileErr);
    }

    // Insert menu item
    const is_trending = req.body.is_trending || false;
    const result = await client.query(
      `INSERT INTO menu_items (partner_id, name, description, price, category, is_available, image_url, preparation_time, service_category_id, duration_minutes, max_capacity, requires_booking, service_type, event_date, event_time, organizer_name, venue_name, is_trending)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       RETURNING *`,
      [id, name, description, price, category, is_available, finalImageUrl, preparation_time, service_category_id, duration_minutes, max_capacity, requires_booking, service_type, event_date, event_time, organizer_name, venue_name, is_trending]
    );

    // Sync to events table if it's an event-type menu item
    const syncResult = await syncMenuItemToEvent(client, result.rows[0]);
    if (syncResult.success) {
      log(syncResult.message);
      } else {
      logError('⚠️ Event sync warning:', syncResult.message);
    }

    await client.query('COMMIT');
    successResponse(res, 201, "Menu item created successfully", result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    logError("❌ Menu item creation error:", err);
    if (err.code === '23503') {
      errorResponse(res, 400, "Invalid service_category_id or partner_id");
    } else if (err.code === '23505') {
      errorResponse(res, 400, "Menu item with this name already exists for this partner");
    } else {
      errorResponse(res, 500, "Failed to create menu item");
    }
  } finally {
    client.release();
  }
});

// Update Menu Item
app.put("/api/v1/partners/:id/menu/:itemId", async (req, res) => {
  const client = await pool.connect();
  try {
    const { id, itemId } = req.params;
    const { name, description, price, category, is_available, image_url, image_base64, image_filename, preparation_time } = req.body;
    
    // Start transaction
    await client.query('BEGIN');

    // Verify partner exists
    const partnerCheck = await client.query(
      'SELECT id FROM partners WHERE id = $1 AND is_active = true',
      [id]
    );

    if (partnerCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return errorResponse(res, 404, "Partner not found or inactive");
    }

    // Get existing menu item to determine service type for proper folder
    const existingItem = await client.query(
      'SELECT service_type FROM menu_items WHERE id = $1 AND partner_id = $2',
      [itemId, id]
    );
    const serviceType = existingItem.rows[0]?.service_type || 'food';

    // Handle image update if base64 provided
    // Events go to /uploads/events, other services go to /uploads/menu
    let finalImageUrl = image_url || null;
    try {
      if (image_base64) {
        if (process.env.VERCEL) {
          await client.query('ROLLBACK');
          return errorResponse(res, 500, "Local file storage not supported on Vercel");
        }
        const subFolder = serviceType === 'events' ? 'events' : 'menu';
        const uploadsDir = path.join(__dirname, `../frontend/public/uploads/${subFolder}`);
        fs.mkdirSync(uploadsDir, { recursive: true });
        
        let base64Data = image_base64;
        let extension = 'jpg';
        const match = /^data:(.*?);base64,(.*)$/.exec(image_base64);
        if (match) {
          const mime = match[1] || 'image/jpeg';
          base64Data = match[2];
          if (mime.includes('png')) extension = 'png';
          else if (mime.includes('webp')) extension = 'webp';
          else if (mime.includes('jpeg') || mime.includes('jpg')) extension = 'jpg';
        }
        
        const prefix = serviceType === 'events' ? 'event' : 'item';
        const safeName = (image_filename && image_filename.replace(/[^a-zA-Z0-9-_\.]/g, '')) 
          || `${prefix}_${Date.now()}.${extension}`;
        const targetPath = path.join(uploadsDir, safeName);
        fs.writeFileSync(targetPath, Buffer.from(base64Data, 'base64'));
        finalImageUrl = `/uploads/${subFolder}/${safeName}`;
        log(`✅ Image updated to: ${finalImageUrl}`);
      }
    } catch (fileErr) {
      logError('❌ Image upload (update) error:', fileErr);
    }

    const is_trending = req.body.is_trending !== undefined ? req.body.is_trending : null;

    const result = await client.query(
      `UPDATE menu_items 
       SET name = COALESCE($3, name),
           description = COALESCE($4, description),
           price = COALESCE($5, price),
           category = COALESCE($6, category),
           is_available = COALESCE($7, is_available),
           image_url = COALESCE($8, image_url),
           preparation_time = COALESCE($9, preparation_time),
           is_trending = COALESCE($10, is_trending),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND partner_id = $1 
       RETURNING *`,
      [id, itemId, name, description, price, category, is_available, finalImageUrl, preparation_time, is_trending]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return errorResponse(res, 404, "Menu item not found");
    }

    // Sync to events table if it's an event-type menu item
    const syncResult = await syncMenuItemToEvent(client, result.rows[0]);
    if (syncResult.success) {
      log(syncResult.message);
      } else {
      logError('⚠️ Event sync warning:', syncResult.message);
    }

    await client.query('COMMIT');
    successResponse(res, 200, "Menu item updated successfully", result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    logError("❌ Menu item update error:", err);
    if (err.code === '23505') {
      errorResponse(res, 400, "Menu item with this name already exists for this partner");
    } else {
      errorResponse(res, 500, "Failed to update menu item");
    }
  } finally {
    client.release();
  }
});
// Delete Menu Item
app.delete("/api/v1/partners/:id/menu/:itemId", async (req, res) => {
  const client = await pool.connect();
  try {
    const { id, itemId } = req.params;
    
    // Start transaction
    await client.query('BEGIN');

    // Verify partner exists
    const partnerCheck = await client.query(
      'SELECT id FROM partners WHERE id = $1 AND is_active = true',
      [id]
    );

    if (partnerCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return errorResponse(res, 404, "Partner not found or inactive");
    }
    
    const result = await client.query(
      `DELETE FROM menu_items WHERE id = $2 AND partner_id = $1 RETURNING *`,
      [id, itemId]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return errorResponse(res, 404, "Menu item not found");
    }

    const deletedItem = result.rows[0];

    // Hard-delete linked event if it's an event-type menu item
    if (deletedItem.service_type === 'events') {
      const eventDeleteResult = await client.query(
        `DELETE FROM events WHERE venue_id = $1 AND title = $2 RETURNING id`,
        [id, deletedItem.name]
      );
      
      if (eventDeleteResult.rows.length > 0) {
        log(`🗑️ Deleted linked event: ${deletedItem.name} (id: ${eventDeleteResult.rows[0].id})`);
      } else {
        log(`⚠️ No linked event found for deleted menu item: ${deletedItem.name}`);
      }
    }

    await client.query('COMMIT');
    successResponse(res, 200, "Menu item deleted successfully");
  } catch (err) {
    await client.query('ROLLBACK');
    logError("❌ Menu item deletion error:", err);
    errorResponse(res, 500, "Failed to delete menu item");
  } finally {
    client.release();
  }
});
// ============================================
// PARTNER ORDERS MANAGEMENT
// ============================================

// Create orders table if it doesn't exist
app.get("/api/v1/partners/:id/orders", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.query;
    
    // Create orders table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
        customer_name VARCHAR(255) NOT NULL,
        customer_phone VARCHAR(20),
        customer_email VARCHAR(255),
        items JSONB NOT NULL,
        total_amount DECIMAL(10, 2) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        order_notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    let query = `SELECT * FROM orders WHERE partner_id = $1`;
    let params = [id];
    
    if (status) {
      query += ` AND status = $2`;
      params.push(status);
    }
    
    query += ` ORDER BY created_at DESC LIMIT 50`;

    const result = await pool.query(query, params);

    successResponse(res, 200, "Orders retrieved successfully", result.rows);
  } catch (err) {
    logError("❌ Orders retrieval error:", err);
    errorResponse(res, 500, "Failed to retrieve orders");
  }
});
// ============================================
// DATABASE INITIALIZATION
// ============================================

// Initialize all missing tables (roles, bookings, vouchers, loyalty_points, archives)
app.get("/api/v1/init-missing-tables", async (req, res) => {
  try {
    const sqlFile = path.join(__dirname, 'db/missing_tables.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');
    await pool.query(sql);
    successResponse(res, 200, "Missing tables initialized successfully");
  } catch (err) {
    logError("Missing tables initialization error:", err);
    errorResponse(res, 500, "Failed to initialize missing tables: " + err.message);
  }
});

// ============================================
// PARTNER OFFERS & DISCOUNTS MANAGEMENT
// ============================================

// Initialize offers table
app.get("/api/v1/init-offers-table", async (req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS partner_offers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        service_type VARCHAR(50),
        discount_percentage DECIMAL(5, 2),
        discount_amount DECIMAL(10, 2),
        original_price DECIMAL(10, 2),
        discounted_price DECIMAL(10, 2),
        offer_type VARCHAR(50) DEFAULT 'percentage',
        terms_conditions TEXT,
        image_url VARCHAR(500),
        start_date TIMESTAMP NOT NULL,
        end_date TIMESTAMP NOT NULL,
        is_active BOOLEAN DEFAULT true,
        is_trending BOOLEAN DEFAULT false,
        max_redemptions INTEGER,
        current_redemptions INTEGER DEFAULT 0,
        applicable_days TEXT[] DEFAULT ARRAY['monday','tuesday','wednesday','thursday','friday','saturday','sunday'],
        applicable_categories JSONB,
        min_purchase_amount DECIMAL(10, 2),
        promo_code VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_partner_offers_partner_id ON partner_offers(partner_id);
      CREATE INDEX IF NOT EXISTS idx_partner_offers_active ON partner_offers(is_active, end_date);
      CREATE INDEX IF NOT EXISTS idx_partner_offers_trending ON partner_offers(is_trending);
      CREATE INDEX IF NOT EXISTS idx_partner_offers_service_type ON partner_offers(service_type);
    `);
    
    // Migration: Handle existing applicable_days JSONB column and service_type
    await pool.query(`
      DO $$ 
      BEGIN
        -- Check if applicable_days exists as JSONB (old format)
        IF EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'partner_offers' 
            AND column_name = 'applicable_days' 
            AND data_type = 'jsonb'
        ) THEN
          -- Create temporary array column if it doesn't exist
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'partner_offers' 
              AND column_name = 'applicable_days_array'
          ) THEN
            ALTER TABLE partner_offers ADD COLUMN applicable_days_array TEXT[];
          END IF;
          
          -- Migrate JSONB to TEXT[] array
          UPDATE partner_offers 
          SET applicable_days_array = (
            SELECT ARRAY(SELECT jsonb_array_elements_text(applicable_days))
            WHERE applicable_days IS NOT NULL
          )
          WHERE applicable_days IS NOT NULL 
            AND (applicable_days_array IS NULL OR array_length(applicable_days_array, 1) IS NULL);
          
          -- Set default for null values
          UPDATE partner_offers 
          SET applicable_days_array = ARRAY['monday','tuesday','wednesday','thursday','friday','saturday','sunday']
          WHERE applicable_days_array IS NULL OR array_length(applicable_days_array, 1) IS NULL;
          
          -- Drop old JSONB column and rename array column
          ALTER TABLE partner_offers DROP COLUMN IF EXISTS applicable_days;
          ALTER TABLE partner_offers RENAME COLUMN applicable_days_array TO applicable_days;
        ELSE
          -- Ensure column exists with default
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'partner_offers' 
              AND column_name = 'applicable_days'
          ) THEN
            ALTER TABLE partner_offers ADD COLUMN applicable_days TEXT[] DEFAULT ARRAY['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
          END IF;
          
          -- Set default for any null values
          UPDATE partner_offers 
          SET applicable_days = ARRAY['monday','tuesday','wednesday','thursday','friday','saturday','sunday']
          WHERE applicable_days IS NULL OR array_length(applicable_days, 1) IS NULL;
        END IF;
        
        -- Add service_type column if it doesn't exist
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'partner_offers' AND column_name = 'service_type'
        ) THEN
          ALTER TABLE partner_offers ADD COLUMN service_type VARCHAR(50);
          CREATE INDEX IF NOT EXISTS idx_partner_offers_service_type ON partner_offers(service_type);
        END IF;
      END $$;
    `);
    
    successResponse(res, 200, "Offers table initialized successfully");
  } catch (err) {
    logError("Offers table initialization error:", err);
    errorResponse(res, 500, "Failed to initialize offers table");
  }
});

// Get all offers (with filters) - includes both partner_offers and trending events from menu_items
app.get("/api/v1/offers", async (req, res) => {
  try {
    const { partner_id, category, trending, is_active = 'true', service_type, limit = 50, offset = 0, admin } = req.query;
    const isAdminRequest = admin === 'true';
    
    // Get current day of week name (lowercase, e.g., 'monday')
    const currentDayOfWeek = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    
    // Build query for partner_offers
    let offersQuery = `
      SELECT 
        po.id,
        po.partner_id,
        po.title as name,
        po.title,
        po.description,
        po.original_price as price,
        po.discounted_price,
        po.discount_percentage,
        po.discount_amount,
        po.image_url,
        po.is_trending,
        po.is_promoted,
        po.featured_request_pending,
        po.forced_by_admin,
        po.service_type,
        po.start_date,
        po.end_date,
        po.start_date as valid_from,
        po.end_date as valid_until,
        po.is_active,
        po.created_at,
        p.name as partner_name,
        p.address as partner_address,
        p.latitude,
        p.longitude,
        p.partner_discount_percentage as partner_base_discount,
        p.approved_for_featured as partner_eligible,
        c.name as category_name,
        c.slug as category_slug,
        po.savings,
        po.ezt_equivalent,
        'offer' as item_type
      FROM partner_offers po
      JOIN partners p ON po.partner_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE 1=1
    `;
    
    // Only apply date filters for non-admin requests
    if (!isAdminRequest) {
      offersQuery += ` AND p.is_active = true
        AND (
          po.service_type = 'events'
          OR (
            (po.start_date IS NULL OR po.start_date <= CURRENT_TIMESTAMP)
            AND (po.end_date IS NULL OR po.end_date >= CURRENT_TIMESTAMP)
          )
        )`;
    }
    
    // Build query for trending events from menu_items (only for non-admin, admin should see all offers from partner_offers)
    let eventsQuery = `
      SELECT 
        mi.id,
        mi.partner_id,
        mi.name,
        mi.name as title,
        mi.description,
        mi.price,
        NULL as discounted_price,
        NULL as discount_percentage,
        NULL as discount_amount,
        mi.image_url,
        mi.is_trending,
        NULL as is_promoted,
        NULL as featured_request_pending,
        NULL as forced_by_admin,
        mi.service_type,
        mi.event_date as start_date,
        mi.event_date as end_date,
        mi.event_date as valid_from,
        mi.event_date as valid_until,
        CASE WHEN mi.is_available = true THEN true ELSE false END as is_active,
        mi.created_at,
        p.name as partner_name,
        p.address as partner_address,
        p.latitude,
        p.longitude,
        p.partner_discount_percentage as partner_base_discount,
        p.approved_for_featured as partner_eligible,
        c.name as category_name,
        c.slug as category_slug,
        NULL as savings,
        NULL as ezt_equivalent,
        'event' as item_type
      FROM menu_items mi
      JOIN partners p ON mi.partner_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE mi.service_type = 'events'
    `;
    
    // Only apply filters for non-admin requests
    if (!isAdminRequest) {
      eventsQuery += ` AND mi.is_trending = true
        AND mi.is_available = true
        AND p.is_active = true
        AND (
          mi.event_date IS NULL
          OR (mi.event_date IS NOT NULL AND mi.event_date >= CURRENT_DATE)
        )`;
    }
    
    const params = [];
    let paramCount = 0;
    
    // Apply filters to offers query
    if (is_active === 'true' && !isAdminRequest) {
      offersQuery += ` AND po.is_active = true`;
    }
    
    // NOTE: Removed applicable_days filter to show ALL deals in Partner Deals section
    // Day restrictions can be enforced at redemption time, not at display time
    // This ensures all deals created in partner console appear in Partner Deals
    
    if (partner_id) {
      paramCount++;
      offersQuery += ` AND po.partner_id = $${paramCount}`;
      eventsQuery += ` AND mi.partner_id = $${paramCount}`;
      params.push(partner_id);
    }
    
    if (category) {
      paramCount++;
      offersQuery += ` AND c.slug = $${paramCount}`;
      eventsQuery += ` AND c.slug = $${paramCount}`;
      params.push(category);
    }
    
    // Handle trending filter - include both is_trending and is_promoted as "trending"
    if (trending === 'true') {
      offersQuery += ` AND (po.is_trending = true OR po.is_promoted = true)`;
      // eventsQuery already filters for is_trending = true
    }
    
    // Handle promoted filter - only show featured deals from eligible partners or admin-forced
    const { promoted } = req.query;
    if (promoted === 'true') {
      offersQuery += ` AND po.is_promoted = true 
        AND (p.approved_for_featured = true OR po.forced_by_admin = true)`;
      // Exclude pending requests from promoted list
      offersQuery += ` AND (po.featured_request_pending = false OR po.featured_request_pending IS NULL)`;
    }
    
    if (service_type) {
      paramCount++;
      offersQuery += ` AND po.service_type = $${paramCount}`;
      eventsQuery += ` AND mi.service_type = $${paramCount}`;
      params.push(service_type);
    }
    
    // For admin requests, use higher limit and only show partner_offers (not menu_items events)
    const adminLimit = isAdminRequest ? 1000 : parseInt(limit);
    const adminOffset = parseInt(offset);
    
    // UNION both queries and order
    let finalQuery = '';
    let queryParams = [...params];
    
    try {
      // Add limit and offset parameters
      // PostgreSQL uses 1-based parameter indexing ($1, $2, etc.)
      // So if we have N params already, limit is at N+1 and offset is at N+2
      const limitParamIndex = queryParams.length + 1;
      const offsetParamIndex = queryParams.length + 2;
      queryParams.push(adminLimit);
      queryParams.push(adminOffset);
      
      log(`🔍 Admin request: paramCount=${paramCount}, queryParams.length=${queryParams.length}, limitParam=${limitParamIndex}, offsetParam=${offsetParamIndex}`);
      
      if (isAdminRequest) {
        // Admin: Only show partner_offers, skip menu_items events
        // For admin with no filters, use a simpler query
        if (params.length === 0) {
          // No filters - use simple query with $1 and $2
          finalQuery = `
            SELECT 
              po.id,
              po.partner_id,
              po.title as name,
              po.title,
              po.description,
              po.original_price as price,
              po.discounted_price,
              po.discount_percentage,
              po.discount_amount,
              po.image_url,
              po.is_trending,
              po.is_promoted,
              po.featured_request_pending,
              po.forced_by_admin,
              po.service_type,
              po.start_date,
              po.end_date,
              po.start_date as valid_from,
              po.end_date as valid_until,
              po.is_active,
              po.created_at,
              p.name as partner_name,
              p.address as partner_address,
              p.latitude,
              p.longitude,
              p.partner_discount_percentage as partner_base_discount,
              c.name as category_name,
              c.slug as category_slug,
              po.savings,
              po.ezt_equivalent,
              'offer' as item_type
            FROM partner_offers po
            JOIN partners p ON po.partner_id = p.id
            LEFT JOIN categories c ON p.category_id = c.id
            ORDER BY (po.is_trending OR po.is_promoted) DESC, po.created_at DESC
            LIMIT $1
            OFFSET $2
          `;
        } else {
          // Has filters - use the built query
          finalQuery = `
            ${offersQuery}
            ORDER BY (po.is_trending OR po.is_promoted) DESC, po.created_at DESC
            LIMIT $${limitParamIndex}
            OFFSET $${offsetParamIndex}
          `;
        }
      } else {
        // Regular users: Show both partner_offers and trending events
        finalQuery = `
          SELECT * FROM (
            (${offersQuery})
            UNION ALL
            (${eventsQuery})
          ) combined
          ORDER BY (COALESCE(combined.is_trending, false) OR COALESCE(combined.is_promoted, false)) DESC, combined.created_at DESC
          LIMIT $${limitParamIndex}
          OFFSET $${offsetParamIndex}
        `;
      }
      
      log(`🔍 Executing offers query (admin=${isAdminRequest}, params=${queryParams.length}, limit=${adminLimit})`);
      log(`📝 Query preview: ${finalQuery.substring(0, 300)}...`);
      log(`📝 Query params: ${JSON.stringify(queryParams)}`);
      
      const result = await pool.query(finalQuery, queryParams);
      log(`✅ Query successful, returned ${result.rows.length} offers`);
      successResponse(res, 200, "Offers retrieved successfully", result.rows);
    } catch (queryErr) {
      logError("❌ Offers query execution error:", queryErr);
      logError("❌ Query SQL:", finalQuery);
      logError("❌ Query params:", queryParams);
      logError("❌ Error message:", queryErr.message);
      logError("❌ Error code:", queryErr.code);
      throw queryErr; // Re-throw to be caught by outer catch
    }
  } catch (err) {
    logError("❌ Offers fetch error:", err);
    logError("❌ Error stack:", err.stack);
    logError("❌ Error message:", err.message);
    logError("❌ Error code:", err.code);
    // Always return error details - we need to see what's wrong
    const errorDetails = err.message || err.toString() || 'Unknown error occurred';
    logError("❌ Returning error to client:", errorDetails);
    errorResponse(res, 500, "Failed to fetch offers", errorDetails);
  }
});

// Get partner's offers
app.get("/api/v1/partners/:id/offers", async (req, res) => {
  try {
    const { id } = req.params;
    
    // Auto-create table if it doesn't exist
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS partner_offers (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
          title VARCHAR(255) NOT NULL,
          description TEXT,
          service_type VARCHAR(50),
          discount_percentage DECIMAL(5, 2),
          discount_amount DECIMAL(10, 2),
          original_price DECIMAL(10, 2),
          discounted_price DECIMAL(10, 2),
          offer_type VARCHAR(50) DEFAULT 'percentage',
          terms_conditions TEXT,
          image_url VARCHAR(500),
          start_date TIMESTAMP NOT NULL,
          end_date TIMESTAMP NOT NULL,
          is_active BOOLEAN DEFAULT true,
          is_trending BOOLEAN DEFAULT false,
          max_redemptions INTEGER,
          current_redemptions INTEGER DEFAULT 0,
          applicable_days TEXT[] DEFAULT ARRAY['monday','tuesday','wednesday','thursday','friday','saturday','sunday'],
          applicable_categories JSONB,
          min_purchase_amount DECIMAL(10, 2),
          promo_code VARCHAR(50),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // Add missing columns if they don't exist
      try {
        await pool.query(`
          DO $$ 
          BEGIN
            -- Add service_type column if it doesn't exist
            IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns 
              WHERE table_name = 'partner_offers' AND column_name = 'service_type'
            ) THEN
              ALTER TABLE partner_offers ADD COLUMN service_type VARCHAR(50);
            END IF;
            
            -- Check if applicable_days exists and what type it is
            IF EXISTS (
              SELECT 1 FROM information_schema.columns 
              WHERE table_name = 'partner_offers' 
                AND column_name = 'applicable_days' 
                AND data_type = 'jsonb'
            ) THEN
              -- Migrate from JSONB to TEXT[]
              IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'partner_offers' 
                  AND column_name = 'applicable_days_array'
              ) THEN
                ALTER TABLE partner_offers ADD COLUMN applicable_days_array TEXT[];
              END IF;
              
              -- Migrate JSONB to TEXT[] array
              UPDATE partner_offers 
              SET applicable_days_array = (
                SELECT ARRAY(SELECT jsonb_array_elements_text(applicable_days))
                WHERE applicable_days IS NOT NULL
              )
              WHERE applicable_days IS NOT NULL 
                AND (applicable_days_array IS NULL OR array_length(applicable_days_array, 1) IS NULL);
              
              -- Set default for null values
              UPDATE partner_offers 
              SET applicable_days_array = ARRAY['monday','tuesday','wednesday','thursday','friday','saturday','sunday']
              WHERE applicable_days_array IS NULL OR array_length(applicable_days_array, 1) IS NULL;
              
              -- Drop old JSONB column and rename array column
              ALTER TABLE partner_offers DROP COLUMN IF EXISTS applicable_days;
              ALTER TABLE partner_offers RENAME COLUMN applicable_days_array TO applicable_days;
            ELSIF NOT EXISTS (
              SELECT 1 FROM information_schema.columns 
              WHERE table_name = 'partner_offers' 
                AND column_name = 'applicable_days'
            ) THEN
              -- Column doesn't exist at all, add it
              ALTER TABLE partner_offers ADD COLUMN applicable_days TEXT[] DEFAULT ARRAY['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
            END IF;
            
            -- Set default for any null values
            UPDATE partner_offers 
            SET applicable_days = ARRAY['monday','tuesday','wednesday','thursday','friday','saturday','sunday']
            WHERE applicable_days IS NULL OR array_length(applicable_days, 1) IS NULL;
          EXCEPTION WHEN OTHERS THEN
            -- Silent fail for migration - column might already be in correct format
            NULL;
          END $$;
        `);
        
        // Create service_type index if column exists
        const hasServiceType = await pool.query(`
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'partner_offers' AND column_name = 'service_type'
        `);
        
        if (hasServiceType.rows.length > 0) {
          await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_partner_offers_service_type ON partner_offers(service_type);
          `);
        }
      } catch (migrationErr) {
        // Migration errors are non-critical - continue
        if (migrationErr.code !== '42703' && migrationErr.code !== '42P07') {
          logError("Migration warning (non-critical):", migrationErr);
        }
      }
      
      // Create indexes if they don't exist
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_partner_offers_partner_id ON partner_offers(partner_id);
        CREATE INDEX IF NOT EXISTS idx_partner_offers_active ON partner_offers(is_active, end_date);
        CREATE INDEX IF NOT EXISTS idx_partner_offers_trending ON partner_offers(is_trending);
      `);
    } catch (createErr) {
      // Table might already exist, continue
      if (createErr.code !== '42P07' && createErr.code !== '42703') { // 42P07 = duplicate_table, 42703 = column doesn't exist
        logError("Error ensuring offers table exists:", createErr);
        throw createErr; // Re-throw if it's a serious error
      }
    }
    
    const result = await pool.query(`
      SELECT * FROM partner_offers
      WHERE partner_id = $1
      ORDER BY created_at DESC
    `, [id]);
    
    successResponse(res, 200, "Partner offers retrieved successfully", result.rows);
  } catch (err) {
    logError("Partner offers fetch error:", err);
    errorResponse(res, 500, "Failed to fetch partner offers: " + (err.message || err.toString()));
  }
});
// Create offer
app.post("/api/v1/partners/:id/offers", async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const {
      title, description, service_type, discount_percentage, discount_amount,
      original_price, discounted_price, offer_type = 'percentage',
      terms_conditions, image_url, image_base64, image_filename,
      start_date, end_date, is_trending = false,
      max_redemptions, applicable_days, applicable_categories,
      min_purchase_amount, promo_code,
      menu_item_id, applicable_menu_items, discount_applies_to = 'standalone',
      savings, ezt_equivalent
    } = req.body;
    
    if (!title || !start_date || !end_date) {
      return errorResponse(res, 400, "Title, start date, and end date are required");
    }
    
    // Ensure table is initialized with correct schema
    try {
      await pool.query(`
        DO $$ 
        BEGIN
          -- Add applicable_days if missing
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'partner_offers' 
              AND column_name = 'applicable_days'
          ) THEN
            ALTER TABLE partner_offers ADD COLUMN applicable_days TEXT[] DEFAULT ARRAY['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
          END IF;
          
          -- Add menu_item_id for linking offers to specific menu items
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'partner_offers' 
              AND column_name = 'menu_item_id'
          ) THEN
            ALTER TABLE partner_offers ADD COLUMN menu_item_id UUID REFERENCES menu_items(id) ON DELETE SET NULL;
            CREATE INDEX IF NOT EXISTS idx_partner_offers_menu_item_id ON partner_offers(menu_item_id);
          END IF;
          
          -- Add applicable_menu_items array for offers that apply to multiple items
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'partner_offers' 
              AND column_name = 'applicable_menu_items'
          ) THEN
            ALTER TABLE partner_offers ADD COLUMN applicable_menu_items UUID[];
            CREATE INDEX IF NOT EXISTS idx_partner_offers_applicable_menu_items ON partner_offers USING GIN(applicable_menu_items);
          END IF;
          
          -- Add discount_applies_to to specify how the discount applies
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'partner_offers' 
              AND column_name = 'discount_applies_to'
          ) THEN
            ALTER TABLE partner_offers ADD COLUMN discount_applies_to VARCHAR(50) DEFAULT 'standalone' 
              CHECK (discount_applies_to IN ('standalone', 'menu_item', 'menu_items', 'category', 'service_type'));
            CREATE INDEX IF NOT EXISTS idx_partner_offers_discount_applies_to ON partner_offers(discount_applies_to);
          END IF;
        END $$;
      `);
    } catch (initErr) {
      // Table might not exist yet, or column already exists - continue
      if (initErr.code !== '42P07' && initErr.code !== '42703') {
        logError('Table initialization warning:', initErr);
      }
    }
    
    await client.query('BEGIN');
    
    // Process applicable_days: accept array or comma-separated string, default to all days
    let processedApplicableDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    if (applicable_days) {
      if (Array.isArray(applicable_days) && applicable_days.length > 0) {
        // Normalize to lowercase
        processedApplicableDays = applicable_days.map(day => String(day).toLowerCase().trim()).filter(day => day);
      } else if (typeof applicable_days === 'string' && applicable_days.trim()) {
        // Split comma-separated string
        processedApplicableDays = applicable_days.split(',').map(day => day.toLowerCase().trim()).filter(day => day);
      }
      
      // Validate day names
      const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      processedApplicableDays = processedApplicableDays.filter(day => validDays.includes(day));
      
      // If empty after validation, default to all days
      if (processedApplicableDays.length === 0) {
        processedApplicableDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      }
    }
    
    // Handle image upload
    let finalImageUrl = image_url || null;
    try {
      if (!finalImageUrl && image_base64) {
        if (process.env.VERCEL) {
          await client.query('ROLLBACK');
          return errorResponse(res, 500, "Local file storage not supported on Vercel");
        }
        const uploadsDir = path.join(__dirname, '../frontend/public/uploads/offers');
        fs.mkdirSync(uploadsDir, { recursive: true });
        
        let base64Data = image_base64;
        let extension = 'jpg';
        const match = /^data:(.*?);base64,(.*)$/.exec(image_base64);
        if (match) {
          const mime = match[1] || 'image/jpeg';
          base64Data = match[2];
          if (mime.includes('png')) extension = 'png';
          else if (mime.includes('webp')) extension = 'webp';
        }
        
        const safeName = (image_filename && image_filename.replace(/[^a-zA-Z0-9-_\.]/g, '')) 
          || `offer_${Date.now()}.${extension}`;
        const targetPath = path.join(uploadsDir, safeName);
        fs.writeFileSync(targetPath, Buffer.from(base64Data, 'base64'));
        finalImageUrl = `/uploads/offers/${safeName}`;
      }
    } catch (fileErr) {
      logError('Image upload error:', fileErr);
    }
    
    let finalOriginalPrice = original_price;
    let finalDiscountedPrice = discounted_price;
    let finalSavings = savings;
    let finalEztEquivalent = ezt_equivalent;
    let finalMenuItemId = menu_item_id || null;
    let finalApplicableMenuItems = null;
    let finalDiscountAppliesTo = discount_applies_to || 'standalone';
    let finalServiceType = service_type;
    
    if (applicable_menu_items) {
      if (Array.isArray(applicable_menu_items) && applicable_menu_items.length > 0) {
        finalApplicableMenuItems = applicable_menu_items;
      } else if (typeof applicable_menu_items === 'string') {
        try {
          const parsed = JSON.parse(applicable_menu_items);
          finalApplicableMenuItems = Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          finalApplicableMenuItems = [applicable_menu_items];
        }
      }
    }
    
    if (finalMenuItemId) {
      try {
        const menuItemResult = await client.query(
          'SELECT id, name, price, service_type FROM menu_items WHERE id = $1 AND partner_id = $2',
          [finalMenuItemId, id]
        );
        
        if (menuItemResult.rows.length > 0) {
          const menuItem = menuItemResult.rows[0];
          finalOriginalPrice = parseFloat(menuItem.price) || finalOriginalPrice;
          finalDiscountAppliesTo = 'menu_item';
          
          if (!finalServiceType && menuItem.service_type) {
            finalServiceType = menuItem.service_type;
          }
          
          log(`✅ Linked offer to menu item: ${menuItem.name} (₹${finalOriginalPrice})`);
        } else {
          log(`⚠️ Menu item ${finalMenuItemId} not found for partner ${id}, creating standalone offer`);
          finalMenuItemId = null;
        }
      } catch (menuErr) {
        logError('Error fetching menu item:', menuErr);
        finalMenuItemId = null;
      }
    }

    const parsedOriginal = parseFloat(finalOriginalPrice) || 0;
    const parsedPercent = parseFloat(discount_percentage) || 0;
    const parsedAmount = parseFloat(discount_amount) || 0;

    let computedDiscounted = finalDiscountedPrice !== undefined && finalDiscountedPrice !== null
      ? parseFloat(finalDiscountedPrice)
      : null;
    let computedSavings = 0;

    if (parsedPercent > 0) {
      computedSavings = (parsedOriginal * parsedPercent) / 100;
      computedDiscounted = parsedOriginal - computedSavings;
    } else if (parsedAmount > 0) {
      computedSavings = parsedAmount;
      computedDiscounted = parsedOriginal - parsedAmount;
    } else if (computedDiscounted === null || Number.isNaN(computedDiscounted)) {
      computedDiscounted = parsedOriginal;
    }

    if (computedDiscounted < 0 || Number.isNaN(computedDiscounted)) {
      computedDiscounted = parsedOriginal;
    }

    if (computedSavings === 0 && parsedOriginal > 0 && computedDiscounted < parsedOriginal) {
      computedSavings = parsedOriginal - computedDiscounted;
    }

    const normalizedSavings = parseFloat((computedSavings || 0).toFixed(2));
    const normalizedDiscounted = parseFloat(computedDiscounted.toFixed(2));
    const computedEzt = parseFloat(((normalizedSavings / 100) || 0).toFixed(5));

    finalOriginalPrice = parsedOriginal;
    finalDiscountedPrice = normalizedDiscounted;
    finalSavings = normalizedSavings;
    finalEztEquivalent = computedEzt;
    
    const result = await client.query(`
      INSERT INTO partner_offers (
        partner_id, title, description, service_type, discount_percentage, discount_amount,
        original_price, discounted_price, offer_type, terms_conditions,
        image_url, start_date, end_date, is_trending, max_redemptions,
        applicable_days, applicable_categories, min_purchase_amount, promo_code,
        menu_item_id, applicable_menu_items, discount_applies_to,
        savings, ezt_equivalent
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
      RETURNING *
    `, [
      id, title, description, finalServiceType, discount_percentage, discount_amount,
      finalOriginalPrice, finalDiscountedPrice, offer_type, terms_conditions,
      finalImageUrl, start_date, end_date, is_trending, max_redemptions,
      processedApplicableDays,
      applicable_categories ? JSON.stringify(applicable_categories) : null,
      min_purchase_amount, promo_code,
      finalMenuItemId, finalApplicableMenuItems, finalDiscountAppliesTo,
      finalSavings, finalEztEquivalent
    ]);
    
    await client.query('COMMIT');

    try {
      const offer = result.rows[0];
      const clientDesc = offer.discount_percentage
        ? `${offer.discount_percentage}% discount offer`
        : `${offer.discount_amount}₹ flat discount offer`;
      const eztDebit = offer.ezt_equivalent || (offer.savings / 100) || 0;
      const normalizedDebit = parseFloat(Number(eztDebit).toFixed(2));
      if (normalizedDebit > 0) {
        await pool.query(`
          INSERT INTO token_ledger (partner_id, offer_id, change_type, ledger_type, amount, description, source)
          VALUES ($1, $2, 'debit', 'marketing_debit', $3, $4, 'marketing')
        `, [id, offer.id, normalizedDebit, `EZT debit for ${clientDesc}`]);
        log(`📉 Token Ledger: -${normalizedDebit} EZT marketing debit recorded for partner ${id}`);
      }
    } catch (ledgerErr) {
      logError("⚠️ Token ledger sync (discount creation) failed:", ledgerErr.message);
    }

    const createdOffer = result.rows[0];
    res.status(201).json({
      success: true,
      message: "Offer created successfully",
      data: createdOffer,
      offer: createdOffer
    });
  } catch (err) {
    await client.query('ROLLBACK');
    logError("Offer creation error:", err);
    errorResponse(res, 500, "Failed to create offer: " + (err.message || err.toString()));
  } finally {
    client.release();
  }
});

// Update offer
app.put("/api/v1/partners/:partnerId/offers/:offerId", async (req, res) => {
  const client = await pool.connect();
  try {
    const { partnerId, offerId } = req.params;
    const {
      title, description, service_type, discount_percentage, discount_amount,
      original_price, discounted_price, offer_type,
      terms_conditions, image_url, image_base64, image_filename,
      start_date, end_date, is_active, is_trending,
      max_redemptions, applicable_days, applicable_categories,
      min_purchase_amount, promo_code,
      menu_item_id, applicable_menu_items, discount_applies_to,
      savings, ezt_equivalent
    } = req.body;
    
    await client.query('BEGIN');

    const existingResult = await client.query(
      'SELECT * FROM partner_offers WHERE id = $1 AND partner_id = $2 FOR UPDATE',
      [offerId, partnerId]
    );

    if (existingResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return errorResponse(res, 404, "Offer not found");
    }
    const existingOffer = existingResult.rows[0];
    
    // Process applicable_days if provided: accept array or comma-separated string
    let processedApplicableDays = null;
    if (applicable_days !== undefined) {
      if (Array.isArray(applicable_days)) {
        // Normalize to lowercase
        processedApplicableDays = applicable_days.map(day => day.toLowerCase().trim()).filter(day => day);
      } else if (typeof applicable_days === 'string') {
        // Split comma-separated string
        processedApplicableDays = applicable_days.split(',').map(day => day.toLowerCase().trim()).filter(day => day);
      }
      
      // Validate day names
      const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      processedApplicableDays = processedApplicableDays.filter(day => validDays.includes(day));
      
      // If empty after validation, default to all days
      if (processedApplicableDays.length === 0) {
        processedApplicableDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      }
    }
    
    // Handle image update
    let finalImageUrl = image_url || null;
    try {
      if (image_base64) {
        if (process.env.VERCEL) {
          await client.query('ROLLBACK');
          return errorResponse(res, 500, "Local file storage not supported on Vercel");
        }
        const uploadsDir = path.join(__dirname, '../frontend/public/uploads/offers');
        fs.mkdirSync(uploadsDir, { recursive: true });
        
        let base64Data = image_base64;
        let extension = 'jpg';
        const match = /^data:(.*?);base64,(.*)$/.exec(image_base64);
        if (match) {
          const mime = match[1] || 'image/jpeg';
          base64Data = match[2];
          if (mime.includes('png')) extension = 'png';
          else if (mime.includes('webp')) extension = 'webp';
        }
        
        const safeName = (image_filename && image_filename.replace(/[^a-zA-Z0-9-_\.]/g, '')) 
          || `offer_${Date.now()}.${extension}`;
        const targetPath = path.join(uploadsDir, safeName);
        fs.writeFileSync(targetPath, Buffer.from(base64Data, 'base64'));
        finalImageUrl = `/uploads/offers/${safeName}`;
      }
    } catch (fileErr) {
      logError('Image upload error:', fileErr);
    }
    
    // Handle menu item linking and price calculation
    let finalOriginalPrice = original_price !== undefined ? original_price : existingOffer.original_price;
    let finalDiscountedPrice = discounted_price !== undefined ? discounted_price : existingOffer.discounted_price;
    let finalMenuItemId = menu_item_id !== undefined ? (menu_item_id || null) : existingOffer.menu_item_id || null;
    let finalApplicableMenuItems = null;
    let finalDiscountAppliesTo = discount_applies_to !== undefined ? discount_applies_to : existingOffer.discount_applies_to;
    let finalServiceType = service_type !== undefined ? service_type : existingOffer.service_type;
    let finalDiscountPercentage = discount_percentage !== undefined ? discount_percentage : existingOffer.discount_percentage;
    let finalDiscountAmount = discount_amount !== undefined ? discount_amount : existingOffer.discount_amount;
    let finalTermsConditions = terms_conditions !== undefined ? terms_conditions : existingOffer.terms_conditions;
    let finalOfferType = offer_type !== undefined ? offer_type : existingOffer.offer_type;
    let finalPromoCode = promo_code !== undefined ? promo_code : existingOffer.promo_code;
    let finalMinPurchaseAmount = min_purchase_amount !== undefined ? min_purchase_amount : existingOffer.min_purchase_amount;
    let finalMaxRedemptions = max_redemptions !== undefined ? max_redemptions : existingOffer.max_redemptions;
    let finalApplicableCategories = applicable_categories !== undefined ? applicable_categories : existingOffer.applicable_categories;
    let finalIsTrending = is_trending !== undefined ? is_trending : existingOffer.is_trending;
    let finalIsActive = is_active !== undefined ? is_active : existingOffer.is_active;
    
    // Process applicable_menu_items if provided
    if (applicable_menu_items !== undefined) {
      if (Array.isArray(applicable_menu_items) && applicable_menu_items.length > 0) {
        finalApplicableMenuItems = applicable_menu_items;
      } else if (typeof applicable_menu_items === 'string' && applicable_menu_items.trim()) {
        try {
          const parsed = JSON.parse(applicable_menu_items);
          finalApplicableMenuItems = Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          finalApplicableMenuItems = [applicable_menu_items];
        }
      } else {
        finalApplicableMenuItems = null;
      }
    }
    
    if (finalMenuItemId) {
      try {
        const menuItemResult = await client.query(
          'SELECT id, name, price, service_type FROM menu_items WHERE id = $1 AND partner_id = $2',
          [finalMenuItemId, partnerId]
        );
        
        if (menuItemResult.rows.length > 0) {
          const menuItem = menuItemResult.rows[0];
          finalOriginalPrice = parseFloat(menuItem.price) || finalOriginalPrice;
          finalDiscountAppliesTo = 'menu_item';
          
          if (!finalServiceType && menuItem.service_type) {
            finalServiceType = menuItem.service_type;
          }
          
          log(`✅ Updated offer linked to menu item: ${menuItem.name} (₹${finalOriginalPrice})`);
        } else {
          log(`⚠️ Menu item ${finalMenuItemId} not found, removing link`);
          finalMenuItemId = null;
        }
      } catch (menuErr) {
        logError('Error fetching menu item:', menuErr);
        finalMenuItemId = null;
      }
    }

    const parsedOriginalUpdate = parseFloat(finalOriginalPrice) || 0;
    const parsedPercentUpdate = parseFloat(finalDiscountPercentage) || 0;
    const parsedAmountUpdate = parseFloat(finalDiscountAmount) || 0;

    let computedDiscountedUpdate = finalDiscountedPrice !== undefined && finalDiscountedPrice !== null
      ? parseFloat(finalDiscountedPrice)
      : null;
    let computedSavingsUpdate = savings !== undefined && savings !== null
      ? parseFloat(savings) || 0
      : parseFloat(existingOffer.savings || 0);

    if (parsedPercentUpdate > 0) {
      computedSavingsUpdate = (parsedOriginalUpdate * parsedPercentUpdate) / 100;
      computedDiscountedUpdate = parsedOriginalUpdate - computedSavingsUpdate;
    } else if (parsedAmountUpdate > 0) {
      computedSavingsUpdate = parsedAmountUpdate;
      computedDiscountedUpdate = parsedOriginalUpdate - parsedAmountUpdate;
    } else if (computedDiscountedUpdate === null || Number.isNaN(computedDiscountedUpdate)) {
      computedDiscountedUpdate = parsedOriginalUpdate;
    }

    if (computedDiscountedUpdate < 0 || Number.isNaN(computedDiscountedUpdate)) {
      computedDiscountedUpdate = parsedOriginalUpdate;
    }

    if (computedSavingsUpdate === 0 && parsedOriginalUpdate > 0 && computedDiscountedUpdate < parsedOriginalUpdate) {
      computedSavingsUpdate = parsedOriginalUpdate - computedDiscountedUpdate;
    }

    computedSavingsUpdate = parseFloat((computedSavingsUpdate || 0).toFixed(2));
    computedDiscountedUpdate = parseFloat(computedDiscountedUpdate.toFixed(2));
    const computedEztUpdate = parseFloat(((computedSavingsUpdate / 100) || 0).toFixed(5));

    finalOriginalPrice = parsedOriginalUpdate;
    finalDiscountedPrice = computedDiscountedUpdate;
    finalSavings = computedSavingsUpdate;
    finalEztEquivalent = computedEztUpdate;
    
    // Build dynamic UPDATE query
    const updateFields = [];
    const updateValues = [partnerId, offerId];
    let paramIndex = 3;
    
    if (title !== undefined) { updateFields.push(`title = $${paramIndex++}`); updateValues.push(title); }
    if (description !== undefined) { updateFields.push(`description = $${paramIndex++}`); updateValues.push(description); }
    if (finalServiceType !== undefined) { updateFields.push(`service_type = $${paramIndex++}`); updateValues.push(finalServiceType); }
    if (discount_percentage !== undefined) { updateFields.push(`discount_percentage = $${paramIndex++}`); updateValues.push(finalDiscountPercentage); }
    if (discount_amount !== undefined) { updateFields.push(`discount_amount = $${paramIndex++}`); updateValues.push(finalDiscountAmount); }
    if (finalOriginalPrice !== undefined) { updateFields.push(`original_price = $${paramIndex++}`); updateValues.push(parsedOriginalUpdate); }
    if (finalDiscountedPrice !== undefined) { updateFields.push(`discounted_price = $${paramIndex++}`); updateValues.push(finalDiscountedPrice !== null ? finalDiscountedPrice : parsedOriginalUpdate); }
    if (offer_type !== undefined) { updateFields.push(`offer_type = $${paramIndex++}`); updateValues.push(finalOfferType); }
    if (terms_conditions !== undefined) { updateFields.push(`terms_conditions = $${paramIndex++}`); updateValues.push(finalTermsConditions); }
    if (finalImageUrl !== undefined && finalImageUrl !== null) { updateFields.push(`image_url = $${paramIndex++}`); updateValues.push(finalImageUrl); }
    if (start_date !== undefined) { updateFields.push(`start_date = $${paramIndex++}`); updateValues.push(start_date); }
    if (end_date !== undefined) { updateFields.push(`end_date = $${paramIndex++}`); updateValues.push(end_date); }
    if (is_active !== undefined) { updateFields.push(`is_active = $${paramIndex++}`); updateValues.push(finalIsActive); }
    if (is_trending !== undefined) {
      updateFields.push(`is_trending = $${paramIndex++}`);
      updateValues.push(finalIsTrending);

      // If partner explicitly unchecks Trending, also clear promoted flags
      if (finalIsTrending === false) {
        updateFields.push(`is_promoted = $${paramIndex++}`);
        updateValues.push(false);
        updateFields.push(`featured_request_pending = $${paramIndex++}`);
        updateValues.push(false);
      }
    }
    if (max_redemptions !== undefined) { updateFields.push(`max_redemptions = $${paramIndex++}`); updateValues.push(finalMaxRedemptions); }
    if (processedApplicableDays !== null) { updateFields.push(`applicable_days = $${paramIndex++}`); updateValues.push(processedApplicableDays); }
    if (applicable_categories !== undefined) { updateFields.push(`applicable_categories = $${paramIndex++}`); updateValues.push(finalApplicableCategories ? JSON.stringify(finalApplicableCategories) : null); }
    if (min_purchase_amount !== undefined) { updateFields.push(`min_purchase_amount = $${paramIndex++}`); updateValues.push(finalMinPurchaseAmount); }
    if (promo_code !== undefined) { updateFields.push(`promo_code = $${paramIndex++}`); updateValues.push(finalPromoCode); }
    if (finalMenuItemId !== undefined) { updateFields.push(`menu_item_id = $${paramIndex++}`); updateValues.push(finalMenuItemId); }
    if (finalApplicableMenuItems !== undefined) { updateFields.push(`applicable_menu_items = $${paramIndex++}`); updateValues.push(finalApplicableMenuItems); }
    if (finalDiscountAppliesTo !== undefined) { updateFields.push(`discount_applies_to = $${paramIndex++}`); updateValues.push(finalDiscountAppliesTo); }
    if (finalSavings !== undefined && finalSavings !== null) { updateFields.push(`savings = $${paramIndex++}`); updateValues.push(finalSavings); }
    if (finalEztEquivalent !== undefined && finalEztEquivalent !== null) { updateFields.push(`ezt_equivalent = $${paramIndex++}`); updateValues.push(finalEztEquivalent); }
    
    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    
    const result = await client.query(`
      UPDATE partner_offers 
      SET ${updateFields.join(', ')}
      WHERE id = $2 AND partner_id = $1
      RETURNING *
    `, updateValues);
    
    await client.query('COMMIT');

    const updatedOffer = result.rows[0];
    res.status(200).json({
      success: true,
      message: "Offer updated successfully",
      data: updatedOffer,
      offer: updatedOffer
    });
  } catch (err) {
    await client.query('ROLLBACK');
    logError("Offer update error:", err);
    errorResponse(res, 500, "Failed to update offer: " + (err.message || err.toString()));
  } finally {
    client.release();
  }
});

// Delete offer
app.delete("/api/v1/partners/:partnerId/offers/:offerId", async (req, res) => {
  try {
    const { partnerId, offerId } = req.params;
    
    const result = await pool.query(
      `DELETE FROM partner_offers WHERE id = $2 AND partner_id = $1 RETURNING *`,
      [partnerId, offerId]
    );
    
    if (result.rows.length === 0) {
      return errorResponse(res, 404, "Offer not found");
    }
    
    successResponse(res, 200, "Offer deleted successfully");
  } catch (err) {
    logError("Offer deletion error:", err);
    errorResponse(res, 500, "Failed to delete offer");
  }
});

// Redeem offer (increment redemption counter)
app.post("/api/v1/offers/:offerId/redeem", async (req, res) => {
  try {
    const { offerId } = req.params;
    
    const result = await pool.query(`
      UPDATE partner_offers 
      SET current_redemptions = current_redemptions + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 
        AND is_active = true
        AND start_date <= CURRENT_TIMESTAMP
        AND end_date >= CURRENT_TIMESTAMP
        AND (max_redemptions IS NULL OR current_redemptions < max_redemptions)
      RETURNING *
    `, [offerId]);
    
    if (result.rows.length === 0) {
      return errorResponse(res, 400, "Offer not available or redemption limit reached");
    }
    
    successResponse(res, 200, "Offer redeemed successfully", result.rows[0]);
    
    try {
      const redeemedOffer = result.rows[0];
      const offerEzt = redeemedOffer.ezt_equivalent || (redeemedOffer.savings / 100) || 0;
      const normalizedRedeem = parseFloat(Number(offerEzt).toFixed(2));
      if (normalizedRedeem > 0) {
        await pool.query(`
          INSERT INTO token_ledger (offer_id, change_type, ledger_type, amount, description, source)
          VALUES ($1, 'debit', 'offer_redemption', $2, $3, 'redemption')
        `, [offerId, normalizedRedeem, `EZT redeemed by user for offer ${redeemedOffer.title || redeemedOffer.id}`]);
        log(`🧾 EZT debit logged: ${normalizedRedeem} EZT redeemed for offer ${redeemedOffer.title || redeemedOffer.id}`);
      }
    } catch (redeemErr) {
      logError("⚠️ EZT ledger redemption sync failed:", redeemErr.message);
    }
  } catch (err) {
    logError("Offer redemption error:", err);
    errorResponse(res, 500, "Failed to redeem offer");
  }
});

// Update Order Status
app.put("/api/v1/partners/:id/orders/:orderId", async (req, res) => {
  try {
    const { id, orderId } = req.params;
    const { status, order_notes } = req.body;
    
    if (!status) {
      return errorResponse(res, 400, "Status is required");
    }

    const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return errorResponse(res, 400, "Invalid status");
    }

    const result = await pool.query(
      `UPDATE orders 
       SET status = $3, order_notes = COALESCE($4, order_notes), updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND partner_id = $1 
       RETURNING *`,
      [id, orderId, status, order_notes]
    );

    if (result.rows.length === 0) {
      return errorResponse(res, 404, "Order not found");
    }

    successResponse(res, 200, "Order updated successfully", result.rows[0]);
  } catch (err) {
    logError("❌ Order update error:", err);
    errorResponse(res, 500, "Failed to update order");
  }
});

// Get Partner Dashboard Stats
app.get("/api/v1/partners/:id/dashboard", async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get partner info
    const partnerResult = await pool.query(
      `SELECT * FROM partners WHERE id = $1`,
      [id]
    );

    if (partnerResult.rows.length === 0) {
      return errorResponse(res, 404, "Partner not found");
    }

    // Get menu items count
    const menuResult = await pool.query(
      `SELECT COUNT(*) as count FROM menu_items WHERE partner_id = $1`,
      [id]
    );

    // Get orders stats
    const ordersResult = await pool.query(
      `SELECT 
         COUNT(*) as total_orders,
         COUNT(CASE WHEN DATE(created_at) = CURRENT_DATE THEN 1 END) as today_orders,
         SUM(total_amount) as total_revenue
       FROM orders WHERE partner_id = $1`,
      [id]
    );

    // Get recent orders
    const recentOrdersResult = await pool.query(
      `SELECT * FROM orders WHERE partner_id = $1 ORDER BY created_at DESC LIMIT 5`,
      [id]
    );

    const stats = {
      partner: partnerResult.rows[0],
      menu_items_count: parseInt(menuResult.rows[0].count),
      total_orders: parseInt(ordersResult.rows[0].total_orders || 0),
      today_orders: parseInt(ordersResult.rows[0].today_orders || 0),
      total_revenue: parseFloat(ordersResult.rows[0].total_revenue || 0),
      recent_orders: recentOrdersResult.rows
    };

    successResponse(res, 200, "Dashboard stats retrieved successfully", stats);
  } catch (err) {
    logError("❌ Dashboard stats error:", err);
    errorResponse(res, 500, "Failed to retrieve dashboard stats");
  }
});

// ============================================
// PARTNER AUTHENTICATION
// ============================================

// Migration endpoint to fix demo accounts (one-time use)
app.post("/api/v1/partners/auth/migrate-demo", async (req, res) => {
  try {
    // Create partner_auth table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS partner_auth (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Get all demo partners
    const demoPartners = await pool.query(
      `SELECT * FROM partners WHERE email LIKE '%@demo.com'`
    );

    const saltRounds = 12;
    const demoPasswordHash = await bcrypt.hash('partner123', saltRounds);

    for (const partner of demoPartners.rows) {
      // Check if auth record already exists
      const existingAuth = await pool.query(
        `SELECT id FROM partner_auth WHERE partner_id = $1`,
        [partner.id]
      );

      if (existingAuth.rows.length === 0) {
        // Create auth record for demo account
        await pool.query(
          `INSERT INTO partner_auth (partner_id, password_hash)
           VALUES ($1, $2)`,
          [partner.id, demoPasswordHash]
        );
        console.log(`✅ Added auth for demo partner: ${partner.name}`);
      }
    }

    successResponse(res, 200, "Demo accounts migrated successfully");
  } catch (err) {
    logError("❌ Demo migration error:", err);
    errorResponse(res, 500, "Migration failed");
  }
});

// Partner Login
app.post("/api/v1/partners/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return errorResponse(res, 400, "Email and password are required");
    }

    // Find partner by email (case-insensitive)
    const partnerResult = await pool.query(
      `SELECT * FROM partners WHERE LOWER(email) = LOWER($1)`,
      [email]
    );

    if (partnerResult.rows.length === 0) {
      return errorResponse(res, 401, "Invalid credentials");
    }

    const partner = partnerResult.rows[0];

    if (!partner.is_active) {
      return errorResponse(res, 403, "Your account is pending approval by the Super Admin. You'll receive an email once you're approved.");
    }

    // Check if partner has a stored password hash
    const authResult = await pool.query(
      `SELECT password_hash FROM partner_auth WHERE partner_id = $1`,
      [partner.id]
    );
    
    if (authResult.rows.length === 0) {
      // No password set yet - this shouldn't happen for genuine partners
      return errorResponse(res, 401, "Account not properly set up. Please contact support.");
    }
    
    const passwordHash = authResult.rows[0].password_hash;
    
    // Compare password with hash
    const isValidPassword = await bcrypt.compare(password, passwordHash);
    if (!isValidPassword) {
      return errorResponse(res, 401, "Invalid credentials");
    }

    // Generate JWT token for partner
    const token = jwt.sign(
      { 
        partnerId: partner.id, 
        email: partner.email, 
        type: 'partner' 
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    successResponse(res, 200, "Login successful", {
      token,
      partner: {
        id: partner.id,
        name: partner.name,
        email: partner.email,
        category_id: partner.category_id
      }
    });
  } catch (err) {
    logError("❌ Partner login error:", err);
    errorResponse(res, 500, "Login failed");
  }
});
// Partner Registration
app.post("/api/v1/partners/auth/register", async (req, res) => {
  try {
    const { 
      name, 
      email, 
      password, 
      category_id, 
      address, 
      phone_number,
      partner_discount_percentage = 10 
    } = req.body;
    
    if (!name || !email || !password || !category_id) {
      return errorResponse(res, 400, "Name, email, password, and category_id are required");
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return errorResponse(res, 400, "Invalid email format");
    }

    // Validate password strength
    if (password.length < 6) {
      return errorResponse(res, 400, "Password must be at least 6 characters long");
    }

    // Check if partner already exists
    const existingPartner = await pool.query(
      `SELECT id FROM partners WHERE email = $1`,
      [email]
    );

    if (existingPartner.rows.length > 0) {
      return errorResponse(res, 400, "Partner with this email already exists");
    }

    // Create partner_auth table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS partner_auth (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Hash the password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Start a transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Create new partner
      const partnerResult = await client.query(
        `INSERT INTO partners (name, email, category_id, address, phone_number, partner_discount_percentage, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, false)
         RETURNING *`,
        [name, email, category_id, address, phone_number, partner_discount_percentage]
      );

      const newPartner = partnerResult.rows[0];

      // Store password hash
      await client.query(
        `INSERT INTO partner_auth (partner_id, password_hash)
         VALUES ($1, $2)`,
        [newPartner.id, passwordHash]
      );

      await client.query('COMMIT');

      successResponse(res, 201, "Partner registration submitted for approval", {
        pendingApproval: true,
        partner: {
          id: newPartner.id,
          name: newPartner.name,
          email: newPartner.email,
          category_id: newPartner.category_id,
          is_active: newPartner.is_active
        }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (err) {
    logError("❌ Partner registration error:", err);
    if (err.code === '23503') {
      errorResponse(res, 400, "Invalid category_id");
    } else if (err.code === '23505') {
      errorResponse(res, 400, "Email already exists");
    } else {
      errorResponse(res, 500, "Registration failed");
    }
  }
});

// Partner Authentication Middleware
const authenticatePartner = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return errorResponse(res, 401, "Access token required");
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (decoded.type !== 'partner') {
      return errorResponse(res, 401, "Invalid token type");
    }

    req.partnerId = decoded.partnerId;
    req.partnerEmail = decoded.email;
    next();
  } catch (err) {
    errorResponse(res, 401, "Invalid or expired token");
  }
};

// ============================================
// ROOT
// ============================================

// Root route removed - static file middleware will serve index.html from public directory
// app.get("/", (req, res) => res.send("✅ Elizian Backend is running successfully"));

// Service Categories API
app.get("/api/v1/service-categories", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, slug, description, icon
      FROM service_categories
      ORDER BY name ASC;
    `);
    successResponse(res, 200, 'Service categories retrieved successfully', result.rows);
  } catch (err) {
    logError('Service categories error:', err);
    errorResponse(res, 500, 'Failed to fetch service categories', err.message);
  }
});

// Categories API (for partners)
app.get("/api/v1/categories", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, slug, description
      FROM categories
      WHERE is_active = true
      ORDER BY display_order ASC;
    `);
    successResponse(res, 200, 'Categories retrieved successfully', result.rows);
  } catch (err) {
    logError('Categories error:', err);
    errorResponse(res, 500, 'Failed to fetch categories', err.message);
  }
});

// Get food menu categories for restaurant menus
app.get("/api/v1/food-categories", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, slug, description, display_order
      FROM food_menu_categories
      WHERE is_active = true
      ORDER BY display_order ASC;
    `);
    successResponse(res, 200, 'Food categories retrieved successfully', result.rows);
  } catch (err) {
    logError('Food categories error:', err);
    errorResponse(res, 500, 'Failed to fetch food categories', err.message);
  }
});

// Get dish categories (Veg/Non-Veg)
app.get("/api/v1/dish-categories", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, slug, description
      FROM dish_categories
      WHERE is_active = true
      ORDER BY name ASC;
    `);
    successResponse(res, 200, 'Dish categories retrieved successfully', result.rows);
  } catch (err) {
    logError('Dish categories error:', err);
    errorResponse(res, 500, 'Failed to fetch dish categories', err.message);
  }
});

// Get beverage categories (Alcoholic/Non-Alcoholic)
app.get("/api/v1/beverage-categories", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, slug, description
      FROM beverage_categories
      WHERE is_active = true
      ORDER BY name ASC;
    `);
    successResponse(res, 200, 'Beverage categories retrieved successfully', result.rows);
  } catch (err) {
    logError('Beverage categories error:', err);
    errorResponse(res, 500, 'Failed to fetch beverage categories', err.message);
  }
});

// Get event categories for events (V2 Taxonomy)
app.get("/api/v1/event-categories", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT ec.id, ec.name, ec.slug, ec.description, ec.icon, ec.color, ec.display_order,
             COUNT(DISTINCT esc.id) as subcategory_count
      FROM event_categories ec
      LEFT JOIN event_subcategories esc ON ec.id = esc.category_id AND esc.is_active = true
      WHERE ec.is_active = true
      GROUP BY ec.id, ec.name, ec.slug, ec.description, ec.icon, ec.color, ec.display_order
      ORDER BY ec.display_order ASC;
    `);
    successResponse(res, 200, 'Event categories retrieved successfully', result.rows);
  } catch (err) {
    logError('Event categories error:', err);
    errorResponse(res, 500, 'Failed to fetch event categories', err.message);
  }
});

// Get event subcategories (V2 Taxonomy)
app.get("/api/v1/event-subcategories", async (req, res) => {
  try {
    const { category_id } = req.query;
    let query = `
      SELECT es.id, es.name, es.slug, es.description, es.display_order,
             ec.name as category_name, ec.slug as category_slug
      FROM event_subcategories es
      JOIN event_categories ec ON es.category_id = ec.id
      WHERE es.is_active = true
    `;
    const params = [];
    
    if (category_id) {
      query += ` AND es.category_id = $1`;
      params.push(category_id);
    }
    
    query += ` ORDER BY ec.display_order ASC, es.display_order ASC`;
    
    const result = await pool.query(query, params);
    successResponse(res, 200, 'Event subcategories retrieved successfully', result.rows);
  } catch (err) {
    logError('Event subcategories error:', err);
    errorResponse(res, 500, 'Failed to fetch event subcategories', err.message);
  }
});

// Get event tags (V2 Taxonomy)
app.get("/api/v1/event-tags", async (req, res) => {
  try {
    const { tag_type } = req.query;
    let query = `
      SELECT id, name, slug, tag_type, description
      FROM event_tags
      WHERE is_active = true
    `;
    const params = [];
    
    if (tag_type) {
      query += ` AND tag_type = $1`;
      params.push(tag_type);
    }
    
    query += ` ORDER BY tag_type ASC, name ASC`;
    
    const result = await pool.query(query, params);
    successResponse(res, 200, 'Event tags retrieved successfully', result.rows);
  } catch (err) {
    logError('Event tags error:', err);
    errorResponse(res, 500, 'Failed to fetch event tags', err.message);
  }
});

// Get event taxonomy (V2 - Complete taxonomy with filters)
app.get("/api/v1/events/taxonomy", async (req, res) => {
  try {
    const categories = await pool.query(`
      SELECT ec.*, 
             COUNT(DISTINCT esc.id) as subcategory_count
      FROM event_categories ec
      LEFT JOIN event_subcategories esc ON ec.id = esc.category_id AND esc.is_active = true
      WHERE ec.is_active = true
      GROUP BY ec.id
      ORDER BY ec.display_order ASC, ec.name ASC
    `);

    const tags = await pool.query(`
      SELECT et.*, COUNT(etm.event_id) as usage_count
      FROM event_tags et
      LEFT JOIN event_tag_mappings etm ON et.id = etm.tag_id
      WHERE et.is_active = true
      GROUP BY et.id
      ORDER BY usage_count DESC, et.name ASC
    `);

    // Event attributes constants
    const attributes = {
      formats: ['In-person', 'Virtual/Online', 'Hybrid (In-person + Virtual)'],
      durations: ['Under 2 hours', '2-4 hours', '4-8 hours', 'Full day', 'Multi-day'],
      audiences: ['All ages', 'Kids (0-12)', 'Teens (13-17)', 'Adults (18+)', 'Seniors (65+)', 'Families'],
      price_ranges: ['Free', '₹0-500', '₹500-2000', '₹2000-5000', '₹5000+'],
      capacities: ['Under 50', '50-200', '200-500', '500-2000', '2000+'],
      atmospheres: ['Formal', 'Casual', 'Party/Festive', 'Professional', 'Relaxed'],
      accessibility: ['Wheelchair accessible', 'Hearing assistance available', 'Visual assistance available', 'Sign language interpreter', 'Sensory-friendly']
    };

    successResponse(res, 200, 'Event taxonomy retrieved successfully', {
      categories: categories.rows,
      tags: tags.rows,
      attributes: attributes
    });

  } catch (err) {
    logError('Taxonomy fetch error:', err);
    errorResponse(res, 500, 'Failed to fetch taxonomy', err.message);
  }
});

// Service Subcategories API
app.get("/api/v1/service-subcategories", async (req, res) => {
  try {
    const { category_id } = req.query;
    
    let query = `
      SELECT ss.id, ss.name, ss.slug, ss.description, ss.icon, ss.display_order,
             sc.name as category_name, sc.slug as category_slug
      FROM service_subcategories ss
      JOIN service_categories sc ON ss.service_category_id = sc.id
      WHERE ss.is_active = true
    `;
    
    const params = [];
    if (category_id) {
      query += ` AND ss.service_category_id = $1`;
      params.push(category_id);
    }
    
    query += ` ORDER BY ss.display_order ASC, ss.name ASC`;
    
    const result = await pool.query(query, params);
    successResponse(res, 200, 'Service subcategories retrieved successfully', result.rows);
  } catch (err) {
    logError('Service subcategories error:', err);
    errorResponse(res, 500, 'Failed to fetch service subcategories', err.message);
  }
});

// Professionals API
app.get("/api/v1/professionals", async (req, res) => {
  try {
    const { specialization, partner_id } = req.query;
    
    let query = `
      SELECT p.id, p.first_name, p.last_name, p.email, p.phone, p.specialization,
             p.experience_years, p.qualifications, p.bio, p.profile_image_url,
             p.consultation_fee, p.rating, p.total_reviews, p.is_active,
             pt.name as partner_name, pt.address as partner_address
      FROM professionals p
      JOIN partners pt ON p.partner_id = pt.id
      WHERE p.is_active = true
    `;
    
    const params = [];
    let paramCount = 0;
    
    if (specialization) {
      paramCount++;
      query += ` AND p.specialization ILIKE $${paramCount}`;
      params.push(`%${specialization}%`);
    }
    
    if (partner_id) {
      paramCount++;
      query += ` AND p.partner_id = $${paramCount}`;
      params.push(partner_id);
    }
    
    query += ` ORDER BY p.rating DESC, p.total_reviews DESC`;
    
    const result = await pool.query(query, params);
    successResponse(res, 200, 'Professionals retrieved successfully', result.rows);
  } catch (err) {
    logError('Professionals error:', err);
    errorResponse(res, 500, 'Failed to fetch professionals', err.message);
  }
});

// Professional Details API
app.get("/api/v1/professionals/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT p.*, pt.name as partner_name, pt.address as partner_address, pt.phone as partner_phone
      FROM professionals p
      JOIN partners pt ON p.partner_id = pt.id
      WHERE p.id = $1 AND p.is_active = true
    `, [id]);
    
    if (result.rows.length === 0) {
      return errorResponse(res, 404, 'Professional not found');
    }
    
    successResponse(res, 200, 'Professional details retrieved successfully', result.rows[0]);
  } catch (err) {
    logError('Professional details error:', err);
    errorResponse(res, 500, 'Failed to fetch professional details', err.message);
  }
});

// Available Time Slots API
app.get("/api/v1/professionals/:id/availability", async (req, res) => {
  try {
    const { id } = req.params;
    const { date } = req.query;
    
    if (!date) {
      return errorResponse(res, 400, 'Date parameter is required');
    }
    
    const appointmentDate = new Date(date);
    const dayOfWeek = appointmentDate.getDay(); // 0=Sunday, 1=Monday, etc.
    
    // Get available time slots for the professional on the given day
    const slotsResult = await pool.query(`
      SELECT ts.id, ts.start_time, ts.end_time, ts.is_available
      FROM time_slots ts
      WHERE ts.professional_id = $1 AND ts.day_of_week = $2 AND ts.is_available = true
      ORDER BY ts.start_time
    `, [id, dayOfWeek]);
    
    // Get booked appointments for the given date
    const appointmentsResult = await pool.query(`
      SELECT start_time, end_time
      FROM appointments
      WHERE professional_id = $1 AND appointment_date = $2 AND status IN ('scheduled', 'confirmed')
    `, [id, date]);
    
    // Filter out booked slots
    const bookedSlots = appointmentsResult.rows.map(apt => ({
      start: apt.start_time,
      end: apt.end_time
    }));
    
    const availableSlots = slotsResult.rows.filter(slot => {
      return !bookedSlots.some(booked => 
        slot.start_time >= booked.start && slot.start_time < booked.end
      );
    });
    
    successResponse(res, 200, 'Available time slots retrieved successfully', availableSlots);
  } catch (err) {
    logError('Time slots error:', err);
    errorResponse(res, 500, 'Failed to fetch time slots', err.message);
  }
});

// Book Appointment API
app.post("/api/v1/appointments", async (req, res) => {
  try {
    const { 
      professional_id, service_id, appointment_date, 
      start_time, end_time, notes, total_amount 
    } = req.body;
    
    // Check if user is authenticated
    let customer_id = null;
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (token) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        customer_id = decoded.id;
      }
    } catch (error) {
      // Token is invalid or not provided - customer_id remains null
      log('⚠️ No valid authentication token provided for appointment booking');
    }
    
    if (!professional_id || !appointment_date || !start_time || !end_time) {
      return errorResponse(res, 400, 'Required fields missing');
    }
    
    // Check if slot is still available
    const slotCheck = await pool.query(`
      SELECT id FROM appointments 
      WHERE professional_id = $1 AND appointment_date = $2 AND start_time = $3 
      AND status IN ('scheduled', 'confirmed')
    `, [professional_id, appointment_date, start_time]);
    
    if (slotCheck.rows.length > 0) {
      return errorResponse(res, 409, 'Time slot is no longer available');
    }
    
    const result = await pool.query(`
      INSERT INTO appointments (customer_id, professional_id, service_id, appointment_date, 
                              start_time, end_time, total_amount, final_amount, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8)
      RETURNING *
    `, [customer_id, professional_id, service_id, appointment_date, start_time, end_time, total_amount, notes]);
    
    successResponse(res, 201, 'Appointment booked successfully', result.rows[0]);
  } catch (err) {
    logError('Appointment booking error:', err);
    errorResponse(res, 500, 'Failed to book appointment', err.message);
  }
});

// Customer Registration API
app.post("/api/v1/customers", async (req, res) => {
  try {
    const { 
      email, phone, first_name, last_name, date_of_birth, 
      gender, address, city, pincode 
    } = req.body;
    
    if (!email || !phone || !first_name || !last_name) {
      return errorResponse(res, 400, 'Required fields missing');
    }
    
    const result = await pool.query(`
      INSERT INTO customers (email, phone, first_name, last_name, date_of_birth, 
                           gender, address, city, pincode)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [email, phone, first_name, last_name, date_of_birth, gender, address, city, pincode]);
    
    successResponse(res, 201, 'Customer registered successfully', result.rows[0]);
  } catch (err) {
    if (err.code === '23505') { // Unique constraint violation
      return errorResponse(res, 409, 'Email or phone number already exists');
    }
    logError('Customer registration error:', err);
    errorResponse(res, 500, 'Failed to register customer', err.message);
  }
});

app.get("/api/v1", (req, res) =>
  res.json({
    success: true,
    message: "Elizian API v1 is active",
    available_endpoints: [
      "/api/v1/auth/send-otp",
      "/api/v1/auth/verify-otp",
      "/api/v1/auth/register",
      "/api/v1/auth/login",
      "/api/v1/user/profile (requires authentication)",
      "/api/v1/categories",
      "/api/v1/categories (POST - create category)",
      "/api/v1/categories/:id (DELETE - delete category)",
      "/api/v1/partners",
      "/api/v1/partners (POST - create partner)",
      "/api/v1/partners/:id (GET - get single partner)",
      "/api/v1/partners/:id (PUT - update partner)",
      "/api/v1/partners/:id (DELETE - delete partner)",
      "/api/v1/partners/:id/dashboard (GET - partner dashboard stats)",
      "/api/v1/partners/:id/menu (GET/POST - menu items)",
      "/api/v1/partners/:id/menu/:itemId (PUT/DELETE - menu item)",
      "/api/v1/partners/:id/orders (GET - partner orders)",
      "/api/v1/partners/:id/orders/:orderId (PUT - update order status)",
      "/api/v1/test-db",
    ],
  })
);

// ============================================
// STATIC FILE SERVING FOR FRONTEND
// ============================================

// Serve static files from assets folder
app.use('/assets', express.static(path.join(__dirname, '../frontend/assets')));
app.use('/images', express.static(path.join(__dirname, '../frontend/public/images')));

// Serve uploaded files with explicit CORS headers
app.use('/uploads', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static(path.join(__dirname, '../frontend/public/uploads')));

// Serve static files from public directory (for development)
app.use(express.static(path.join(__dirname, '../frontend/public')));

// Serve static files from the React app build directory
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/build')));
  
  // Handle React routing, return all requests to React app
  app.get('/*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/build', 'index.html'));
  });
}

// ============================================
// ERROR HANDLER
// ============================================

app.use((err, req, res, next) => {
  logError("Error:", err.stack);
  errorResponse(res, 500, "Internal server error");
});

// ============================================
// EVENT MANAGEMENT ENDPOINTS (Attendize-inspired)
// ============================================

// Get membership tier token percentage
const getTokenPercentage = (membershipTier) => {
  const percentages = {
    'Ather': 1,
    'Nova': 2,
    'Luminar': 3,
    'Valiant': 4,
    'Echelon': 5
  };
  return percentages[membershipTier] || 1;
};

// Award EZT tokens to user based on transaction (supports 5 decimal places)
// Formula: EZT earned = (amount_spent * tier_percentage) / 100 / 100
// Where 100 is the EZT value (₹100 = 1 EZT)
const awardTokens = async (userId, amountSpent, transactionId = null, description = '') => {
  try {
    // Get user's current tier
    const userResult = await pool.query(
      `SELECT u.current_tier_id, u.total_tokens_earned, u.available_tokens, t.name as tier_name, t.token_earning_percentage
       FROM users u
       LEFT JOIN tiers t ON u.current_tier_id = t.id
       WHERE u.id = $1`,
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      logError('❌ User not found for token award:', userId);
      return 0;
    }
    
    const user = userResult.rows[0];
    let tierName = user.tier_name || 'Ather';
    let tokenPercentage = parseFloat(user.token_earning_percentage) || 1.0;
    
    // If user has no tier, assign Ather (default)
    if (!user.current_tier_id) {
      const baseTier = await pool.query("SELECT id, name FROM tiers WHERE LOWER(name) IN ('ather', 'aether') ORDER BY name LIMIT 1");
      if (baseTier.rows.length > 0) {
        await pool.query('UPDATE users SET current_tier_id = $1 WHERE id = $2', [baseTier.rows[0].id, userId]);
        tierName = baseTier.rows[0].name || 'Ather';
        tokenPercentage = 1.0;
      }
    }
    
    // Calculate EZT earned: (amount_spent * tier_percentage) / 100 / 100
    // Example: ₹1000 spent at 2% tier = (1000 * 2) / 100 / 100 = 0.2 EZT
    const eztEarned = parseFloat((amountSpent * tokenPercentage) / 100 / 100).toFixed(5);
    const eztEarnedDecimal = parseFloat(eztEarned);
    
    if (eztEarnedDecimal > 0) {
      // Update user's token balance (supports 5 decimal places)
      await pool.query(
        `UPDATE users 
         SET available_tokens = available_tokens + $1,
             total_tokens_earned = total_tokens_earned + $1
         WHERE id = $2`,
        [eztEarnedDecimal, userId]
      );
      
      // Record in token ledger
      const balanceBefore = parseFloat(user.available_tokens || 0);
      const balanceAfter = balanceBefore + eztEarnedDecimal;
      
      await pool.query(
        `INSERT INTO token_ledger (user_id, transaction_id, amount, ledger_type, balance_before, balance_after, description)
         VALUES ($1, $2, $3, 'earned', $4, $5, $6)`,
        [userId, transactionId, eztEarnedDecimal, balanceBefore, balanceAfter, description || `Earned from purchase (${tierName} tier ${tokenPercentage}%)`]
      );
      
      // Update tier progress and check for tier upgrade
      await updateTierProgress(userId, amountSpent);
      
      log(`✅ Awarded ${eztEarned} EZT to user ${userId} (${tierName} tier, ${tokenPercentage}%)`);
    }
    
    return eztEarnedDecimal;
  } catch (error) {
    logError('❌ Error awarding tokens:', error);
    return 0;
  }
};

// Update tier progress and promote user if they reach next tier
const updateTierProgress = async (userId, amountSpent) => {
  try {
    // Get user's current tier and total spend
    const userResult = await pool.query(
      `SELECT u.current_tier_id, u.total_tokens_earned, t.level as current_level, t.min_spend_required as current_min_spend
       FROM users u
       LEFT JOIN tiers t ON u.current_tier_id = t.id
       WHERE u.id = $1`,
      [userId]
    );
    
    if (userResult.rows.length === 0) return;
    
    const user = userResult.rows[0];
    const currentLevel = user.current_level || 1;
    
    // Calculate total lifetime spend from transactions
    const spendResult = await pool.query(
      `SELECT COALESCE(SUM(bill_amount), 0) as total_spend
       FROM transactions
       WHERE user_id = $1 AND payment_status = 'completed'`,
      [userId]
    );
    
    const totalSpend = parseFloat(spendResult.rows[0].total_spend || 0);
    
    // Get all tiers ordered by level
    const tiersResult = await pool.query(
      'SELECT id, name, level, min_spend_required FROM tiers ORDER BY level DESC'
    );
    
    // Find the highest tier the user qualifies for
    let newTierId = user.current_tier_id;
    let newTierName = 'Ather';
    
    for (const tier of tiersResult.rows) {
      if (totalSpend >= parseFloat(tier.min_spend_required || 0)) {
        newTierId = tier.id;
        newTierName = tier.name;
        break;
      }
    }
    
    // If tier changed, update user and record promotion
    if (newTierId !== user.current_tier_id) {
      const oldTierResult = await pool.query('SELECT name FROM tiers WHERE id = $1', [user.current_tier_id]);
      const oldTierName = oldTierResult.rows[0]?.name || 'Ather';
      
      await pool.query(
        `UPDATE users SET current_tier_id = $1 WHERE id = $2`,
        [newTierId, userId]
      );
      
      // Update tier_progress table
      await pool.query(
        `INSERT INTO tier_progress (user_id, current_tier_id, previous_tier_id, total_spend, promoted_at)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
         ON CONFLICT (user_id) 
         DO UPDATE SET 
           previous_tier_id = tier_progress.current_tier_id,
           current_tier_id = $2,
           total_spend = $4,
           promoted_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP`,
        [userId, newTierId, user.current_tier_id, totalSpend]
      );
      
      log(`🎉 User ${userId} promoted from ${oldTierName} to ${newTierName} (Total spend: ₹${totalSpend})`);
    } else {
      // Update tier_progress with current spend
      await pool.query(
        `INSERT INTO tier_progress (user_id, current_tier_id, total_spend, updated_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
         ON CONFLICT (user_id) 
         DO UPDATE SET total_spend = $3, updated_at = CURRENT_TIMESTAMP`,
        [userId, newTierId, totalSpend]
      );
    }
  } catch (error) {
    logError('❌ Error updating tier progress:', error);
    }
};
// Redeem EZT tokens at checkout (₹100 per EZT, supports 5 decimal places)
const redeemTokens = async (userId, eztAmount, transactionId = null, description = '') => {
  try {
    // Get user's current token balance
    const userResult = await pool.query(
      'SELECT available_tokens, total_tokens_spent FROM users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      throw new Error('User not found');
    }
    
    const availableTokens = parseFloat(userResult.rows[0].available_tokens || 0);
    const eztToRedeem = parseFloat(eztAmount);
    
    if (eztToRedeem > availableTokens) {
      throw new Error(`Insufficient EZT balance. Available: ${availableTokens.toFixed(5)}, Required: ${eztToRedeem.toFixed(5)}`);
    }
    
    // Calculate discount amount (1 EZT = ₹100)
    const discountAmount = eztToRedeem * 100;
    
      // Update user's token balance
    const balanceBefore = availableTokens;
    const balanceAfter = availableTokens - eztToRedeem;
    
      await pool.query(
      `UPDATE users 
       SET available_tokens = available_tokens - $1,
           total_tokens_spent = total_tokens_spent + $1
       WHERE id = $2`,
      [eztToRedeem, userId]
      );
      
    // Record in token ledger
      await pool.query(
      `INSERT INTO token_ledger (user_id, transaction_id, amount, ledger_type, balance_before, balance_after, description)
       VALUES ($1, $2, $3, 'spent', $4, $5, $6)`,
      [userId, transactionId, -eztToRedeem, balanceBefore, balanceAfter, description || `Redeemed for discount (₹${discountAmount.toFixed(2)})`]
      );
      
    log(`✅ Redeemed ${eztToRedeem.toFixed(5)} EZT from user ${userId} (₹${discountAmount.toFixed(2)} discount)`);
    
    return {
      eztRedeemed: eztToRedeem,
      discountAmount: discountAmount,
      balanceBefore: balanceBefore,
      balanceAfter: balanceAfter
    };
  } catch (error) {
    logError('❌ Error redeeming tokens:', error);
    throw error;
  }
};

// Create event
app.post("/api/v1/events", async (req, res) => {
  try {
    const {
      venue_id, title, description, start_time, end_time, booking_cap,
      price_per_ticket, status = 'active', image_url, image_base64, image_filename
    } = req.body;

    if (!title || !start_time) {
      return errorResponse(res, 400, "Title and start time are required");
    }

    // Disallow past-dated events (timezone-safe direct Date comparison)
    if (new Date(start_time) < new Date()) {
      return errorResponse(res, 400, "Start time cannot be in the past");
    }

    // Resolve final image URL
    let finalImageUrl = image_url || null;
    try {
      if (!finalImageUrl && image_base64) {
        if (process.env.VERCEL) {
          return errorResponse(res, 500, "Local file storage not supported on Vercel");
        }
        // Ensure uploads directory exists
        const uploadsDir = path.join(__dirname, '../frontend/public/uploads/events');
        fs.mkdirSync(uploadsDir, { recursive: true });

        // Parse data URL or raw base64
        let base64Data = image_base64;
        let extension = 'jpg';
        const dataUrlMatch = /^data:(.*?);base64,(.*)$/.exec(image_base64);
        if (dataUrlMatch) {
          const mime = dataUrlMatch[1] || 'image/jpeg';
          base64Data = dataUrlMatch[2];
          if (mime.includes('png')) extension = 'png';
          else if (mime.includes('webp')) extension = 'webp';
          else if (mime.includes('jpeg') || mime.includes('jpg')) extension = 'jpg';
        }

        const safeName = (image_filename && image_filename.replace(/[^a-zA-Z0-9-_\.]/g, '')) || `event_${Date.now()}.${extension}`;
        const targetPath = path.join(uploadsDir, safeName);
        fs.writeFileSync(targetPath, Buffer.from(base64Data, 'base64'));
        finalImageUrl = `/uploads/events/${safeName}`;
      }
    } catch (fileErr) {
      logError('❌ Image upload error:', fileErr);
    }

    const result = await pool.query(
      `INSERT INTO events (venue_id, title, description, start_time, end_time,
        booking_cap, price_per_ticket, status, image_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [venue_id, title, description, start_time, end_time,
        booking_cap, price_per_ticket, status, finalImageUrl]
    );

    successResponse(res, 201, "Event created successfully", result.rows[0]);
  } catch (err) {
    logError("❌ Event creation error:", err);
    errorResponse(res, 500, "Failed to create event");
  }
});

// Get all events
app.get("/api/v1/events", async (req, res) => {
  try {
    const { status = 'active', include_expired = 'false' } = req.query;
    
    // Events table is source of truth, merge data from menu_items if available
    let query = `
      SELECT 
        e.id,
        e.title,
        e.description,
        e.start_time,
        e.end_time,
        e.venue_id,
        e.status,
        e.created_at,
        e.updated_at,
        COALESCE(mi.image_url, e.image_url) as image_url,
        COALESCE(mi.price, e.price_per_ticket) as price_per_ticket,
        COALESCE(e.booking_cap, mi.max_capacity) as booking_cap,
        COALESCE(mi.organizer_name, p.name) as organizer_name,
        p.email as organizer_email,
        p.phone_number as organizer_phone
      FROM events e
      LEFT JOIN menu_items mi ON mi.partner_id = e.venue_id AND mi.name = e.title AND mi.service_type = 'events'
      LEFT JOIN partners p ON e.venue_id = p.id
      WHERE e.status = 'active'
        AND (
          -- If end_time exists, check if it's in the future
          (e.end_time IS NOT NULL AND e.end_time > CURRENT_TIMESTAMP)
          OR
          -- If no end_time, check if start_time is today or in the future
          (e.end_time IS NULL AND e.start_time >= CURRENT_DATE)
        )
      ORDER BY e.start_time ASC
    `;
    
    const result = await pool.query(query);
    
    // Enrich with lifecycle status
    const enrichedEvents = enrichWithLifecycleStatus(result.rows);
    
    // Filter out expired events on the backend
    const activeEvents = enrichedEvents.filter(event => {
      if (include_expired === 'true') return true;
      return event.computed_status !== 'expired';
    });
    
    successResponse(res, 200, "Events retrieved successfully", activeEvents);
  } catch (err) {
    logError("❌ Events fetch error:", err);
    errorResponse(res, 500, "Failed to fetch events");
  }
});

// Get single event
app.get("/api/v1/events/:id", async (req, res) => {
  try {
    const { id } = req.params;
    console.log('🔍 Fetching event with ID:', id);
    
    const result = await pool.query(`
      SELECT e.*, p.name as organizer_name, p.email as organizer_email, p.phone_number as organizer_phone
      FROM events e
      LEFT JOIN partners p ON e.venue_id = p.id
      WHERE e.id = $1
    `, [id]);
    
    console.log('📊 Query result:', result.rows.length, 'rows');
    
    if (result.rows.length === 0) {
      console.log('❌ Event not found');
      return errorResponse(res, 404, "Event not found");
    }
    
    // Get ticket sales count (if event_tickets table exists)
    let soldTickets = 0;
    try {
    const ticketCount = await pool.query(
      'SELECT COUNT(*) as sold_tickets FROM event_tickets WHERE event_id = $1 AND status = $2',
      [id, 'active']
    );
      soldTickets = parseInt(ticketCount.rows[0].sold_tickets);
    } catch (err) {
      // event_tickets table doesn't exist, use default values
      console.log('⚠️ event_tickets table not found, using default values');
      soldTickets = 0;
    }
    
    const event = result.rows[0];
    event.sold_tickets = soldTickets;
    event.available_tickets = event.booking_cap ? event.booking_cap - soldTickets : null;
    
    console.log('✅ Event found:', event.title);
    successResponse(res, 200, "Event retrieved successfully", event);
  } catch (err) {
    console.error('💥 Event fetch error:', err);
    logError("❌ Event fetch error:", err);
    errorResponse(res, 500, "Failed to fetch event");
  }
});

// Purchase event ticket
app.post("/api/v1/events/:id/tickets", async (req, res) => {
  try {
    const { id } = req.params;
    const { attendee_name, attendee_email, attendee_phone, payment_method = 'online' } = req.body;
    
    // Check if user is authenticated
    let user_id = null;
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (token) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        user_id = decoded.id;
      }
    } catch (error) {
      // Token is invalid or not provided - user_id remains null
      log('⚠️ No valid authentication token provided for ticket purchase');
    }
    
    if (!attendee_name || !attendee_email) {
      return errorResponse(res, 400, "Attendee name and email are required");
    }
    
    // Get event details
    const eventResult = await pool.query('SELECT * FROM events WHERE id = $1 AND status = $2', [id, 'active']);
    if (eventResult.rows.length === 0) {
      return errorResponse(res, 404, "Event not found or inactive");
    }
    
    const event = eventResult.rows[0];
    
    // LIFECYCLE CHECK: Verify event hasn't expired
    if (event.end_time && new Date(event.end_time) < new Date()) {
      return res.status(400).json({
        success: false,
        message: "This event has expired and tickets are no longer available.",
        lifecycle_status: 'expired',
        end_time: event.end_time
      });
    }
    
    // Check capacity
    if (event.capacity) {
      const ticketCount = await pool.query(
        'SELECT COUNT(*) as sold FROM event_tickets WHERE event_id = $1 AND status = $2',
        [id, 'active']
      );
      
      if (parseInt(ticketCount.rows[0].sold) >= event.capacity) {
        return errorResponse(res, 400, "Event is sold out");
      }
    }
    
    // Calculate ticket price (use price_per_ticket from events table, default to 0 for free events)
    let ticketPrice = parseFloat(event.price_per_ticket) || 0;
    
    // Check for early bird pricing (if columns exist)
    if (event.early_bird_price && event.early_bird_end_date) {
      const today = new Date().toISOString().split('T')[0];
      if (today <= event.early_bird_end_date) {
        ticketPrice = parseFloat(event.early_bird_price) || ticketPrice;
      }
    }
    
    // Generate ticket code and QR code
    const ticketCode = `TKT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const qrCode = `https://eznet.app/ticket/${ticketCode}`;
    
    // Create ticket
    const result = await pool.query(
      `INSERT INTO event_tickets (event_id, user_id, ticket_code, qr_code, attendee_name, 
        attendee_email, attendee_phone, price_paid, payment_method, payment_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [id, user_id, ticketCode, qrCode, attendee_name, attendee_email, attendee_phone, 
        ticketPrice, payment_method, payment_method === 'offline' ? 'pending' : 'paid']
    );
    
    const ticket = result.rows[0];
    
    // Award tokens if user is logged in
    if (user_id) {
      const tokensEarned = await awardTokens(
        user_id, 
        ticketPrice, 
        'event_ticket_purchase', 
        id, 
        null, 
        `Ticket purchase for ${event.title}`
      );
      ticket.tokens_earned = tokensEarned;
    }
    
    successResponse(res, 201, "Ticket purchased successfully", ticket);
  } catch (err) {
    logError("❌ Ticket purchase error:", err);
    errorResponse(res, 500, "Failed to purchase ticket");
  }
});

// Get user's tickets
app.get("/api/v1/users/:id/tickets", async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT et.*, e.title as event_title, e.start_time, e.end_time,
             p.name as organizer_name
      FROM event_tickets et
      JOIN events e ON et.event_id = e.id
      LEFT JOIN partners p ON e.venue_id = p.id
      WHERE et.user_id = $1
      ORDER BY e.start_time DESC
    `, [id]);
    
    successResponse(res, 200, "Tickets retrieved successfully", result.rows);
  } catch (err) {
    logError("❌ Tickets fetch error:", err);
    errorResponse(res, 500, "Failed to fetch tickets");
  }
});

// Check-in ticket (QR code scanner)
app.post("/api/v1/tickets/:ticketCode/checkin", async (req, res) => {
  try {
    const { ticketCode } = req.params;
    
    const result = await pool.query(
      'SELECT et.*, e.title as event_title FROM event_tickets et JOIN events e ON et.event_id = e.id WHERE et.ticket_code = $1',
      [ticketCode]
    );
    
    if (result.rows.length === 0) {
      return errorResponse(res, 404, "Ticket not found");
    }
    
    const ticket = result.rows[0];
    
    if (ticket.status !== 'active') {
      return errorResponse(res, 400, "Ticket is not active");
    }
    
    if (ticket.check_in_time) {
      return errorResponse(res, 400, "Ticket already checked in");
    }
    
    // Update check-in time
    await pool.query(
      'UPDATE event_tickets SET check_in_time = CURRENT_TIMESTAMP WHERE ticket_code = $1',
      [ticketCode]
    );
    
    ticket.check_in_time = new Date().toISOString();
    
    successResponse(res, 200, "Ticket checked in successfully", ticket);
  } catch (err) {
    logError("❌ Check-in error:", err);
    errorResponse(res, 500, "Failed to check in ticket");
  }
});

// Get user's membership and token balance
app.get("/api/v1/users/:id/membership", async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'SELECT * FROM user_membership WHERE user_id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      // Create default membership
      const newMembership = await pool.query(
        'INSERT INTO user_membership (user_id) VALUES ($1) RETURNING *',
        [id]
      );
      successResponse(res, 200, "Membership retrieved successfully", newMembership.rows[0]);
    } else {
      successResponse(res, 200, "Membership retrieved successfully", result.rows[0]);
    }
  } catch (err) {
    logError("❌ Membership fetch error:", err);
    errorResponse(res, 500, "Failed to fetch membership");
  }
});

// Get user's token transactions
app.get("/api/v1/users/:id/token-transactions", async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    
    const result = await pool.query(`
      SELECT tt.*, e.title as event_title, o.id as order_reference
      FROM token_transactions tt
      LEFT JOIN events e ON tt.event_id = e.id
      LEFT JOIN orders o ON tt.order_id = o.id
      WHERE tt.user_id = $1
      ORDER BY tt.created_at DESC
      LIMIT $2 OFFSET $3
    `, [id, limit, offset]);
    
    successResponse(res, 200, "Token transactions retrieved successfully", result.rows);
  } catch (err) {
    logError("❌ Token transactions fetch error:", err);
    errorResponse(res, 500, "Failed to fetch token transactions");
  }
});

// ============================================
// MULTI-TIER PARTNER MANAGEMENT APIs
// ============================================

// Get Organization Hierarchy
app.get("/api/v1/organizations/:id/hierarchy", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      WITH RECURSIVE org_hierarchy AS (
        SELECT id, name, type, parent_org_id, tier_level, organization_code, 0 as level
        FROM partner_organizations 
        WHERE id = $1
        
        UNION ALL
        
        SELECT po.id, po.name, po.type, po.parent_org_id, po.tier_level, po.organization_code, oh.level + 1
        FROM partner_organizations po
        JOIN org_hierarchy oh ON po.parent_org_id = oh.id
      )
      SELECT * FROM org_hierarchy ORDER BY level, tier_level;
    `, [id]);
    
    successResponse(res, 200, "Organization hierarchy retrieved successfully", result.rows);
  } catch (err) {
    logError("Organization hierarchy error:", err);
    errorResponse(res, 500, "Failed to retrieve organization hierarchy");
  }
});

// Get Sub-Organizations
app.get("/api/v1/organizations/:id/sub-organizations", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { type, tier_level } = req.query;
    
    let query = `
      SELECT po.*, 
             COUNT(ps.id) as store_count,
             COUNT(pu.id) as user_count
      FROM partner_organizations po
      LEFT JOIN partner_stores ps ON po.id = ps.organization_id
      LEFT JOIN partner_users pu ON po.id = pu.organization_id
      WHERE po.parent_org_id = $1
    `;
    
    const params = [id];
    
    if (type) {
      query += ` AND po.type = $${params.length + 1}`;
      params.push(type);
    }
    
    if (tier_level) {
      query += ` AND po.tier_level = $${params.length + 1}`;
      params.push(parseInt(tier_level));
    }
    
    query += ` GROUP BY po.id ORDER BY po.tier_level, po.name`;
    
    const result = await pool.query(query, params);
    successResponse(res, 200, "Sub-organizations retrieved successfully", result.rows);
  } catch (err) {
    logError("Sub-organizations error:", err);
    errorResponse(res, 500, "Failed to retrieve sub-organizations");
  }
});

// Get Templates by Organization
app.get("/api/v1/organizations/:id/templates", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { template_type } = req.query;
    
    let query = `
      SELECT st.*, pu.user_type as created_by_type
      FROM standardization_templates st
      LEFT JOIN partner_users pu ON st.created_by = pu.id
      WHERE st.organization_id = $1
    `;
    
    const params = [id];
    
    if (template_type) {
      query += ` AND st.template_type = $${params.length + 1}`;
      params.push(template_type);
    }
    
    query += ` ORDER BY st.template_type, st.template_name`;
    
    const result = await pool.query(query, params);
    successResponse(res, 200, "Templates retrieved successfully", result.rows);
  } catch (err) {
    logError("Templates error:", err);
    errorResponse(res, 500, "Failed to retrieve templates");
  }
});

// Get Approval Requests
app.get("/api/v1/organizations/:id/approval-requests", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.query;
    
    let query = `
      SELECT ar.*, 
             pu1.user_type as requester_type,
             pu2.user_type as approver_type,
             aw.workflow_type
      FROM approval_requests ar
      JOIN approval_workflows aw ON ar.workflow_id = aw.id
      JOIN partner_users pu1 ON ar.requester_id = pu1.id
      LEFT JOIN partner_users pu2 ON ar.approver_id = pu2.id
      WHERE aw.organization_id = $1
    `;
    
    const params = [id];
    
    if (status) {
      query += ` AND ar.status = $${params.length + 1}`;
      params.push(status);
    }
    
    query += ` ORDER BY ar.created_at DESC`;
    
    const result = await pool.query(query, params);
    successResponse(res, 200, "Approval requests retrieved successfully", result.rows);
  } catch (err) {
    logError("Approval requests error:", err);
    errorResponse(res, 500, "Failed to retrieve approval requests");
  }
});

// Get Stores by Organization
app.get("/api/v1/organizations/:id/stores", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { store_type } = req.query;
    
    let query = `
      SELECT ps.*, 
             pu.user_type as manager_type,
             po.name as organization_name
      FROM partner_stores ps
      JOIN partner_organizations po ON ps.organization_id = po.id
      LEFT JOIN partner_users pu ON ps.local_manager_id = pu.id
      WHERE ps.organization_id = $1 AND ps.is_active = true
    `;
    
    const params = [id];
    
    if (store_type) {
      query += ` AND ps.store_type = $${params.length + 1}`;
      params.push(store_type);
    }
    
    query += ` ORDER BY ps.store_name`;
    
    const result = await pool.query(query, params);
    successResponse(res, 200, "Stores retrieved successfully", result.rows);
  } catch (err) {
    logError("Stores error:", err);
    errorResponse(res, 500, "Failed to retrieve stores");
  }
});

// ============================================
// PASSWORD RECOVERY APIs
// ============================================

// Generate OTP for password recovery
app.post("/api/v1/partners/auth/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return errorResponse(res, 400, "Email is required");
    }

    // Check if partner exists
    const partnerResult = await pool.query(
      "SELECT id, name, email FROM partners WHERE LOWER(email) = LOWER($1)",
      [email]
    );

    if (partnerResult.rows.length === 0) {
      // In development, be more helpful about email not found
      if (process.env.NODE_ENV === 'development') {
        return errorResponse(res, 404, "Email not found in our system. Please check if you registered with a different email address.");
      }
      // In production, don't reveal if email exists or not for security
      return successResponse(res, 200, "If the email exists, a recovery code has been sent");
    }

    const partner = partnerResult.rows[0];

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Store OTP in database
    await pool.query(
      `INSERT INTO partner_otps (partner_id, otp, type, expires_at, is_used) 
       VALUES ($1, $2, 'password_recovery', $3, false)`,
      [partner.id, otp, otpExpiry]
    );

    // Send email with OTP
    const emailResult = await sendPasswordRecoveryEmail(partner.email, otp, partner.name);
    
    if (emailResult.success) {
      log(`✅ Password recovery email sent to ${partner.email}`);
    } else {
      log(`⚠️ Email failed, but OTP generated: ${otp}`);
      log(`❌ Email error: ${emailResult.error}`);
    }

    successResponse(res, 200, "Recovery code sent to your email", {
      message: "If the email exists, a recovery code has been sent",
      // In development, include OTP for testing if email fails
      ...(process.env.NODE_ENV === 'development' && !emailResult.success && { otp })
    });
  } catch (err) {
    logError("❌ Forgot password error:", err);
    errorResponse(res, 500, "Failed to process password recovery request");
  }
});

// Verify OTP and reset password
app.post("/api/v1/partners/auth/reset-password", async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return errorResponse(res, 400, "Email, OTP, and new password are required");
    }

    if (newPassword.length < 6) {
      return errorResponse(res, 400, "Password must be at least 6 characters long");
    }

    // Verify OTP
    const otpResult = await pool.query(
      `SELECT po.*, p.id as partner_id, p.name, p.email 
       FROM partner_otps po
       JOIN partners p ON po.partner_id = p.id
       WHERE LOWER(p.email) = LOWER($1) 
       AND po.otp = $2 
       AND po.type = 'password_recovery'
       AND po.is_used = false
       AND po.expires_at > NOW()
       ORDER BY po.created_at DESC
       LIMIT 1`,
      [email, otp]
    );

    if (otpResult.rows.length === 0) {
      return errorResponse(res, 400, "Invalid or expired recovery code");
    }

    const otpRecord = otpResult.rows[0];

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password in partner_auth table
    await pool.query(
      "UPDATE partner_auth SET password_hash = $1, updated_at = NOW() WHERE partner_id = $2",
      [hashedPassword, otpRecord.partner_id]
    );

    // Mark OTP as used
    await pool.query(
      "UPDATE partner_otps SET is_used = true WHERE id = $1",
      [otpRecord.id]
    );

    // Note: Session invalidation would go here if partner_sessions table exists
    // For now, we'll rely on JWT token expiration for security

    log(`✅ Password reset successful for ${email}`);

    successResponse(res, 200, "Password reset successfully. Please login with your new password");
  } catch (err) {
    logError("❌ Reset password error:", err);
    errorResponse(res, 500, "Failed to reset password");
  }
});

// Resend OTP
app.post("/api/v1/partners/auth/resend-otp", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return errorResponse(res, 400, "Email is required");
    }

    // Check if partner exists
    const partnerResult = await pool.query(
      "SELECT id, name, email FROM partners WHERE LOWER(email) = LOWER($1)",
      [email]
    );

    if (partnerResult.rows.length === 0) {
      return successResponse(res, 200, "If the email exists, a new recovery code has been sent");
    }

    const partner = partnerResult.rows[0];

    // Check for recent OTP requests (rate limiting)
    const recentOtpResult = await pool.query(
      `SELECT COUNT(*) as count FROM partner_otps 
       WHERE partner_id = $1 
       AND type = 'password_recovery'
       AND created_at > NOW() - INTERVAL '1 minute'`,
      [partner.id]
    );

    if (parseInt(recentOtpResult.rows[0].count) > 0) {
      return errorResponse(res, 429, "Please wait before requesting another code");
    }

    // Generate new OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Store OTP in database
    await pool.query(
      `INSERT INTO partner_otps (partner_id, otp, type, expires_at, is_used) 
       VALUES ($1, $2, 'password_recovery', $3, false)`,
      [partner.id, otp, otpExpiry]
    );

    // Send email with new OTP
    const emailResult = await sendPasswordRecoveryEmail(partner.email, otp, partner.name);
    
    if (emailResult.success) {
      log(`✅ New password recovery email sent to ${partner.email}`);
    } else {
      log(`⚠️ Email failed, but new OTP generated: ${otp}`);
      log(`❌ Email error: ${emailResult.error}`);
    }

    successResponse(res, 200, "New recovery code sent to your email", {
      message: "New recovery code sent to your email",
      // In development, include OTP for testing if email fails
      ...(process.env.NODE_ENV === 'development' && !emailResult.success && { otp })
    });
  } catch (err) {
    logError("❌ Resend OTP error:", err);
    errorResponse(res, 500, "Failed to resend recovery code");
  }
});
// ============================================
// CUSTOMER (USER) PASSWORD RECOVERY APIs
// ============================================
// Customer forgot password
app.post("/api/v1/auth/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return errorResponse(res, 400, "Email is required");
    }

    // Check if user exists
    const userResult = await pool.query(
      "SELECT id, first_name, last_name, email FROM users WHERE LOWER(email) = LOWER($1)",
      [email]
    );

    if (userResult.rows.length === 0) {
      // In development, be more helpful about email not found
      if (process.env.NODE_ENV === 'development') {
        return errorResponse(res, 404, "Email not found in our system. Please check if you registered with a different email address.");
      }
      // In production, don't reveal if email exists or not for security
      return successResponse(res, 200, "If the email exists, a recovery code has been sent");
    }

    const user = userResult.rows[0];

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Store OTP in otp_sessions table
    await pool.query(
      `INSERT INTO otp_sessions (user_id, otp_hash, expires_at, verified, attempts) 
       VALUES ($1, $2, $3, false, 0)`,
      [user.id, await bcrypt.hash(otp, 10), otpExpiry]
    );

    // Send email with OTP
    const emailResult = await sendPasswordRecoveryEmail(user.email, otp, `${user.first_name} ${user.last_name}`);
    
    if (emailResult.success) {
      log(`✅ Password recovery email sent to ${user.email}`);
    } else {
      log(`⚠️ Email failed, but OTP generated: ${otp}`);
      log(`❌ Email error: ${emailResult.error}`);
    }

    successResponse(res, 200, "Recovery code sent to your email", {
      message: "If the email exists, a recovery code has been sent",
      // In development, include OTP for testing if email fails
      ...(process.env.NODE_ENV === 'development' && !emailResult.success && { otp })
    });
  } catch (err) {
    logError("❌ Customer forgot password error:", err);
    errorResponse(res, 500, "Failed to process password recovery request");
  }
});

// Customer reset password
app.post("/api/v1/auth/reset-password", async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return errorResponse(res, 400, "Email, OTP, and new password are required");
    }

    if (newPassword.length < 6) {
      return errorResponse(res, 400, "Password must be at least 6 characters long");
    }

    // Find user
    const userResult = await pool.query(
      "SELECT id FROM users WHERE LOWER(email) = LOWER($1)",
      [email]
    );

    if (userResult.rows.length === 0) {
      return errorResponse(res, 404, "User not found");
    }

    const user = userResult.rows[0];

    // Verify OTP
    const otpSessions = await pool.query(
      `SELECT id, otp_hash, verified, attempts, expires_at 
       FROM otp_sessions 
       WHERE user_id = $1 
       AND verified = false
       AND expires_at > NOW()
       AND attempts < 3
       ORDER BY created_at DESC
       LIMIT 1`,
      [user.id]
    );

    if (otpSessions.rows.length === 0) {
      return errorResponse(res, 400, "Invalid or expired recovery code");
    }

    const otpSession = otpSessions.rows[0];

    // Verify OTP hash
    const isOtpValid = await bcrypt.compare(otp, otpSession.otp_hash);

    if (!isOtpValid) {
      // Increment attempts
      await pool.query(
        "UPDATE otp_sessions SET attempts = attempts + 1 WHERE id = $1",
        [otpSession.id]
      );
      return errorResponse(res, 400, "Invalid recovery code");
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password in user_auth_credentials table
    await pool.query(
      "UPDATE user_auth_credentials SET password_hash = $1, updated_at = NOW() WHERE user_id = $2",
      [hashedPassword, user.id]
    );

    // Mark OTP as verified
    await pool.query(
      "UPDATE otp_sessions SET verified = true WHERE id = $1",
      [otpSession.id]
    );

    log(`✅ Customer password reset successful for ${email}`);

    successResponse(res, 200, "Password reset successfully. Please login with your new password");
  } catch (err) {
    logError("❌ Customer reset password error:", err);
    errorResponse(res, 500, "Failed to reset password");
  }
});

// ============================================
// GET EVENTS FROM MENU ITEMS (For Partner Console Events)
// ============================================

app.get("/api/v1/eznet/menu-items-as-events", async (req, res) => {
  try {
    const { status = 'available' } = req.query;
    
    // Get menu items where service_type = 'events'
    const result = await pool.query(`
      SELECT 
        mi.id,
        mi.name as title,
        mi.description,
        mi.price,
        mi.is_available as status,
        mi.max_capacity,
        mi.created_at,
        mi.event_date as start_time,
        mi.event_time,
        p.id as venue_id,
        p.name as venue_name,
        p.address as venue_address,
        p.latitude,
        p.longitude
      FROM menu_items mi
      JOIN partners p ON mi.partner_id = p.id
      WHERE mi.service_type = 'events' 
      AND mi.is_available = true
      ORDER BY mi.created_at DESC
    `);
    
    successResponse(res, 200, "Menu items loaded as events", result.rows);
  } catch (err) {
    logError("❌ Get menu items as events error:", err);
    errorResponse(res, 500, "Failed to retrieve menu items as events", err.message);
  }
});

// ============================================
// BOOK MENU ITEM AS EVENT (Customer Booking)
// ============================================

app.post("/api/v1/eznet/book-menu-item-event", authenticateToken, async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { menu_item_id, num_tickets, special_requests } = req.body;
    const userId = req.userId;

    if (!menu_item_id || !num_tickets || num_tickets <= 0) {
      return errorResponse(res, 400, "Menu item ID and valid number of tickets are required");
    }

    await client.query('BEGIN');

    // Get menu item details
    const menuItemResult = await client.query(
      `SELECT mi.*, p.name as venue_name, p.address as venue_address
       FROM menu_items mi
       JOIN partners p ON mi.partner_id = p.id
       WHERE mi.id = $1 AND mi.service_type = 'events' AND mi.is_available = true`,
      [menu_item_id]
    );

    const menuItem = menuItemResult.rows[0];

    if (!menuItem) {
      await client.query('ROLLBACK');
      return errorResponse(res, 404, "Event not found or not available");
    }

    // Check if event has passed
    if (menuItem.event_date && new Date(menuItem.event_date) < new Date()) {
      await client.query('ROLLBACK');
      return errorResponse(res, 400, "Cannot book for past events");
    }

    // Check available capacity
    const bookingsResult = await client.query(
      `SELECT COALESCE(SUM(num_tickets), 0) as booked_tickets 
       FROM event_bookings 
       WHERE menu_item_id = $1 AND status IN ('pending', 'confirmed')`,
      [menu_item_id]
    );

    const bookedTickets = parseInt(bookingsResult.rows[0].booked_tickets);
    const availableTickets = (menuItem.max_capacity || 999) - bookedTickets;

    if (num_tickets > availableTickets) {
      await client.query('ROLLBACK');
      return errorResponse(res, 400, `Only ${availableTickets} tickets available`);
    }

    // Calculate total price
    const totalPrice = (parseFloat(menuItem.price) || 0) * num_tickets;

    // Generate booking reference
    const bookingRef = `EB${Date.now()}${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

    // Create booking in event_bookings table
    const bookingResult = await client.query(
      `INSERT INTO event_bookings 
       (user_id, menu_item_id, partner_id, num_tickets, total_price, booking_reference, special_requests, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
       RETURNING *`,
      [userId, menu_item_id, menuItem.partner_id, num_tickets, totalPrice, bookingRef, special_requests || null]
    );

    const booking = bookingResult.rows[0];

    await client.query('COMMIT');

    successResponse(res, 201, "Booking created successfully", {
      ...booking,
      event_title: menuItem.name,
      venue_name: menuItem.venue_name,
      venue_address: menuItem.venue_address
    });

  } catch (err) {
    await client.query('ROLLBACK');
    logError("❌ Create menu item booking error:", err);
    errorResponse(res, 500, "Failed to create booking");
  } finally {
    client.release();
  }
});

// ============================================
// EZNET EVENTS ROUTES
// ============================================

// Import events routes
const eventsRoutes = require('./routes/eznet/events');
const subcategoriesRoutes = require('./routes/subcategories');
const serviceTypesRoutes = require('./routes/serviceTypes');

// Mount events routes
app.use('/api/v1/eznet/events', eventsRoutes);

// Mount subcategories routes (ISO/ISIC aligned)
app.use('/api/v1/subcategories', subcategoriesRoutes);

// Mount service types routes (virtual/computed)
app.use('/api/v1/service-types', serviceTypesRoutes);

// ============================================
// MULTI-TIER PARTNER MANAGEMENT ROUTES
// ============================================

// Import multi-tier routes
const multiTierRoutes = require('./multi_tier_apis');
const { sendPasswordRecoveryEmail, sendWelcomeEmail } = require('./emailService');

// Mount multi-tier routes
app.use('/api/v1', multiTierRoutes);

// ============================================
// HEALTH/READINESS ENDPOINTS
// ============================================

// Health check
app.get('/api/v1/healthz', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Keep legacy healthz endpoint for backward compatibility
app.get('/healthz', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.get('/readyz', async (req, res) => {
  try {
    const client = await pool.connect();
    client.release();
    return res.status(200).json({ status: 'ready' });
  } catch (e) {
    return res.status(503).json({ status: 'degraded', error: 'db_unavailable' });
  }
});

// ============================================
// CENTRALIZED ERROR HANDLER
// ============================================

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  logError('Unhandled error:', { requestId: req.requestId, message: err.message, stack: err.stack });
  if (res.headersSent) return; 
  res.status(err.status || 500).json({
    success: false,
    error: 'internal_error',
    message: isProduction ? 'An unexpected error occurred' : err.message,
    requestId: req.requestId
  });
});

// ============================================
// SERVER START + GRACEFUL SHUTDOWN
// ============================================

// ============================================
// PROCESS MANAGEMENT & ERROR HANDLING
// ============================================

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logError('💥 Uncaught Exception:', error);
  logError('Stack:', error.stack);
  // Don't exit immediately, log and continue
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logError('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit immediately, log and continue
});

// Handle process warnings
process.on('warning', (warning) => {
  logError('⚠️ Process Warning:', warning.name, warning.message);
  logError('Stack:', warning.stack);
});

// Graceful shutdown handlers
let server;
const gracefulShutdown = async (signal) => {
  log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
  
  try {
    // Close database connections
    if (pool) {
  await pool.end();
      log('✅ Database connections closed');
    }
    
    // Close server
    if (server) {
      server.close(() => {
        log('✅ HTTP server closed');
  process.exit(0);
});
    } else {
      process.exit(0);
    }
  } catch (error) {
    logError('❌ Error during shutdown:', error);
    process.exit(1);
  }
};

// Register signal handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGHUP', () => gracefulShutdown('SIGHUP'));

// ============================================
// SCHEDULED TASKS (Cron Jobs)
// ============================================

// Auto-cancel pending bookings after 10 minutes
if (!process.env.VERCEL) {
  cron.schedule('*/5 * * * *', async () => { // Run every 5 minutes
    try {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      
      const result = await pool.query(
        `UPDATE bookings 
         SET status = 'cancelled',
             cancelled_at = CURRENT_TIMESTAMP,
             cancellation_reason = 'Auto-cancelled: No confirmation within 10 minutes'
         WHERE status = 'pending'
         AND created_at < $1
         RETURNING id, deal_id, slot_id, num_tickets`,
        [tenMinutesAgo]
      );

      if (result.rows.length > 0) {
        log(`🔄 Auto-cancelled ${result.rows.length} pending bookings`);
        
        // Release slots for cancelled bookings
        for (const booking of result.rows) {
          if (booking.slot_id) {
            await pool.query(
              `UPDATE deal_slots 
               SET booked = GREATEST(0, booked - $1),
                   is_available = CASE WHEN (capacity - GREATEST(0, booked - $1)) > 0 THEN true ELSE false END,
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = $2`,
              [booking.num_tickets || 1, booking.slot_id]
            );
          }
        }
      }
    } catch (error) {
      logError('❌ Error in auto-cancel bookings cron job:', error);
    }
  });
} else {
  log('⏸️ Auto-cancel bookings cron disabled on Vercel');
}

if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  server = app.listen(PORT, () => {
    log(`✅ Elizian Backend running on port ${PORT}`);
    log(`📊 Process PID: ${process.pid}`);
    log(`🔄 Auto-restart enabled: ${process.env.NODE_ENV === 'development' ? 'Yes' : 'No'}`);
    log(`⏰ Auto-cancel pending bookings: Enabled (runs every 5 minutes)`);
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      logError(`❌ Port ${PORT} is already in use`);
      process.exit(1);
    } else {
      logError('❌ Server error:', error);
    }
  });
} else {
  log('🚀 Express app exported for Vercel serverless (no local listener)');
}

// ============================================
// BOOKINGS SYSTEM (Dedicated Bookings Table)
// ============================================

// Check deal availability (slots/tickets)
app.get("/api/v1/deals/:dealId/availability", authenticateToken, async (req, res) => {
  try {
    const { dealId } = req.params;
    const { date, time_slot } = req.query;

    // Get deal information
    const dealResult = await pool.query(
      `SELECT po.*, p.name as partner_name, p.id as partner_id, c.name as category_name
       FROM partner_offers po
       JOIN partners p ON po.partner_id = p.id
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE po.id = $1 AND po.is_active = true
       AND (po.start_date IS NULL OR po.start_date <= CURRENT_TIMESTAMP)
       AND (po.end_date IS NULL OR po.end_date >= CURRENT_TIMESTAMP)`,
      [dealId]
    );

    if (dealResult.rows.length === 0) {
      return errorResponse(res, 404, "Deal not found or not available");
    }

    const deal = dealResult.rows[0];

    // If date and time_slot provided, check specific slot availability
    if (date && time_slot) {
      const slotResult = await pool.query(
        `SELECT id, capacity, booked, price, is_available
         FROM deal_slots
         WHERE deal_id = $1 AND date = $2 AND time_slot = $3
         FOR UPDATE`,
        [dealId, date, time_slot]
      );

      if (slotResult.rows.length === 0) {
        return successResponse(res, 200, "Slot availability retrieved", {
          available: false,
          message: "Slot not found",
          deal: {
            id: deal.id,
            title: deal.title,
            partner_name: deal.partner_name
          }
        });
      }

      const slot = slotResult.rows[0];
      const available = slot.capacity - slot.booked;

      return successResponse(res, 200, "Slot availability retrieved", {
        available: available > 0 && slot.is_available,
        available_count: Math.max(0, available),
        capacity: slot.capacity,
        booked: slot.booked,
        price: parseFloat(slot.price || deal.discounted_price || deal.original_price || 0),
        slot_id: slot.id,
        deal: {
          id: deal.id,
          title: deal.title,
          partner_name: deal.partner_name,
          category: deal.category_name
        }
      });
    }

    // Get all available slots for the deal
    const slotsResult = await pool.query(
      `SELECT id, date, time_slot, capacity, booked, price, is_available,
              (capacity - booked) as available_count
       FROM deal_slots
       WHERE deal_id = $1 
       AND date >= CURRENT_DATE
       AND is_available = true
       AND (capacity - booked) > 0
       ORDER BY date, time_slot`,
      [dealId]
    );

    return successResponse(res, 200, "Deal availability retrieved", {
      deal: {
        id: deal.id,
        title: deal.title,
        partner_name: deal.partner_name,
        category: deal.category_name,
        base_price: parseFloat(deal.discounted_price || deal.original_price || 0)
      },
      slots: slotsResult.rows.map(slot => ({
        id: slot.id,
        date: slot.date,
        time_slot: slot.time_slot,
        available_count: parseInt(slot.available_count),
        capacity: slot.capacity,
        booked: slot.booked,
        price: parseFloat(slot.price || deal.discounted_price || deal.original_price || 0)
      })),
      has_slots: slotsResult.rows.length > 0
    });
  } catch (err) {
    logError("❌ Deal availability check error:", err);
    errorResponse(res, 500, "Failed to check availability", err.message);
  }
});
// Create booking for deal
app.post("/api/v1/deals/:dealId/book", authenticateToken, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await ensureSystemSettingsTable();
    await ensureVouchersTable();
    await ensureOrdersTable();
    const { dealId } = req.params;
    const { 
      date, 
      time_slot, 
      quantity = 1, 
      special_requests,
      slot_id 
    } = req.body;
    const user_id = req.userId;

    if (!date) {
      return errorResponse(res, 400, "Date is required for booking");
    }

    // Ensure bookings table has required EZT/fiat columns (idempotent)
    try {
      await pool.query(`
        DO $$ 
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'bookings' AND column_name = 'fiat_amount'
          ) THEN
            ALTER TABLE bookings ADD COLUMN fiat_amount NUMERIC(12, 2) DEFAULT 0;
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'bookings' AND column_name = 'ezt_redeemed'
          ) THEN
            ALTER TABLE bookings ADD COLUMN ezt_redeemed NUMERIC(15, 5) DEFAULT 0;
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'bookings' AND column_name = 'reward_eligible'
          ) THEN
            ALTER TABLE bookings ADD COLUMN reward_eligible BOOLEAN DEFAULT false;
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'bookings' AND column_name = 'reward_credited'
          ) THEN
            ALTER TABLE bookings ADD COLUMN reward_credited BOOLEAN DEFAULT false;
          END IF;
        END $$;
      `);
    } catch (alterErr) {
      logError('⚠️ Failed to ensure bookings columns exist:', alterErr.message || alterErr);
    }

    await client.query('BEGIN');

    // Get deal information with row lock
    const dealResult = await client.query(
      `SELECT po.*, p.name as partner_name, p.id as partner_id, p.category_id, c.name as category_name
       FROM partner_offers po
       JOIN partners p ON po.partner_id = p.id
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE po.id = $1
         AND po.is_active = true
         AND (
           (po.service_type = 'events' AND (
             $2::date >= DATE(COALESCE(po.start_date, $2::timestamp))
             AND ($2::date <= DATE(COALESCE(po.end_date, COALESCE(po.start_date, $2::timestamp))))
           ))
           OR (
             (po.service_type IS DISTINCT FROM 'events' OR po.service_type IS NULL)
             AND (po.start_date IS NULL OR po.start_date <= CURRENT_TIMESTAMP)
             AND (po.end_date IS NULL OR po.end_date >= CURRENT_TIMESTAMP)
           )
         )
       FOR UPDATE OF po`,
      [dealId, date]
    );

    if (dealResult.rows.length === 0) {
      logError('❌ Booking aborted: deal not found or inactive', {
        dealId,
        user_id,
        date,
        time_slot,
        quantity,
        reason: 'Deal query returned 0 rows'
      });
      await client.query('ROLLBACK');
      return errorResponse(res, 404, "Deal not found or not available");
    }

    const deal = dealResult.rows[0];

    // Check slot availability if slot_id provided
    let slot = null;
    const unitOriginalPrice = parseFloat(
      deal.original_price || deal.price || deal.base_price || deal.menu_price || deal.item_price || deal.discounted_price || 0
    );
    let unitDiscountedPrice = parseFloat(
      deal.discounted_price || deal.price || deal.base_price || deal.menu_price || deal.item_price || unitOriginalPrice
    );
    
    let slotPrice = unitDiscountedPrice;
    
    if (slot_id) {
      const slotResult = await client.query(
        `SELECT id, capacity, booked, price, is_available, date, time_slot
         FROM deal_slots
         WHERE id = $1 AND deal_id = $2
         FOR UPDATE`,
        [slot_id, dealId]
      );

      if (slotResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return errorResponse(res, 404, "Slot not found");
      }

      slot = slotResult.rows[0];
      
      if (!slot.is_available) {
        await client.query('ROLLBACK');
        return errorResponse(res, 400, "Slot is not available");
      }

      const available = slot.capacity - slot.booked;
      if (quantity > available) {
        await client.query('ROLLBACK');
        return errorResponse(res, 400, `Only ${available} slots available`);
      }

      slotPrice = parseFloat(slot.price || slotPrice);
      unitDiscountedPrice = slotPrice;
    } else if (time_slot) {
      // Check if slot exists, create if needed
      const slotResult = await client.query(
        `SELECT id, capacity, booked, price, is_available
         FROM deal_slots
         WHERE deal_id = $1 AND date = $2 AND time_slot = $3
         FOR UPDATE`,
        [dealId, date, time_slot]
      );

      if (slotResult.rows.length > 0) {
        slot = slotResult.rows[0];
        const available = slot.capacity - slot.booked;
        if (quantity > available) {
          await client.query('ROLLBACK');
          return errorResponse(res, 400, `Only ${available} slots available`);
        }
        slotPrice = parseFloat(slot.price || slotPrice);
        unitDiscountedPrice = slotPrice;
      }
    }

    // Calculate pricing and EZT-funded discount
    const calculatedUnitDiscountAmount = (() => {
      const explicitDiscount = parseFloat(deal.discount_amount || 0);
      if (explicitDiscount > 0) return explicitDiscount;
      const percent = parseFloat(deal.discount_percentage || 0);
      if (percent > 0 && unitOriginalPrice > 0) return (unitOriginalPrice * percent) / 100;
      if (unitOriginalPrice > 0 && unitDiscountedPrice > 0) {
        return Math.max(0, unitOriginalPrice - unitDiscountedPrice);
      }
      return 0;
    })();
    
    const unitDiscountAmount = Math.min(calculatedUnitDiscountAmount, unitOriginalPrice);
    const totalOriginalAmount = unitOriginalPrice * quantity;
    const totalDiscountAmount = Math.min(unitDiscountAmount * quantity, totalOriginalAmount);
    const fiatAmount = Math.max(0, totalOriginalAmount - totalDiscountAmount);
    const eztRequired = parseFloat((totalDiscountAmount / 100).toFixed(5));

    if (eztRequired > 0) {
      // Lock user row and ensure balance
      const balanceResult = await client.query(
        'SELECT available_tokens, total_tokens_spent FROM users WHERE id = $1 FOR UPDATE',
        [user_id]
      );

      if (balanceResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return errorResponse(res, 404, "User token balance not found");
      }

      const availableTokens = parseFloat(balanceResult.rows[0].available_tokens || 0);
      if (availableTokens < eztRequired) {
        await client.query('ROLLBACK');
        return errorResponse(res, 400, `Insufficient EZT balance. Available: ${availableTokens.toFixed(5)}, Required: ${eztRequired.toFixed(5)}`);
      }

      const balanceAfter = availableTokens - eztRequired;

      await client.query(
        `UPDATE users 
         SET available_tokens = available_tokens - $1,
             total_tokens_spent = total_tokens_spent + $1
         WHERE id = $2`,
        [eztRequired, user_id]
      );

      await client.query(
        `INSERT INTO token_ledger (user_id, transaction_id, amount, ledger_type, balance_before, balance_after, description)
         VALUES ($1, NULL, $2, 'spent', $3, $4, $5)`,
        [
          user_id,
          -eztRequired,
          availableTokens,
          balanceAfter,
          `Redeemed for discount on Booking ${dealId}`
        ]
      );
    }

    // Get commission percentage (fallback to 10% if settings table or key missing)
    let commission_percentage = 10.0;
    try {
      const tableCheck = await client.query(
        "SELECT to_regclass('public.system_settings') AS table_name"
      );
      if (tableCheck.rows[0]?.table_name) {
        const settingsResult = await client.query(
          "SELECT setting_value FROM system_settings WHERE setting_key = 'commission_percentage'"
        );
        if (settingsResult.rows.length > 0) {
          commission_percentage = parseFloat(settingsResult.rows[0].setting_value) || 10.0;
        }
      }
    } catch (settingsError) {
      logError('⚠️ Commission settings lookup failed:', settingsError.message || settingsError);
      commission_percentage = 10.0;
    }

    const finalAmount = fiatAmount;
    const partner_earning = finalAmount - (finalAmount * commission_percentage / 100);

    // Generate booking reference (timestamp + user suffix + extra randomness to avoid collisions)
    const userSuffix = (user_id || '').toString().replace(/-/g, '').slice(-6).toUpperCase();
    const bookingRef = `DB${Date.now()}${userSuffix}${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // Create booking
    const bookingResult = await client.query(
      `INSERT INTO bookings (
        user_id, partner_id, deal_id, slot_id, booking_date, booking_time,
        num_tickets, num_guests, total_price, special_requests, status, booking_reference,
        fiat_amount, ezt_redeemed, reward_eligible
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *`,
      [
        user_id, 
        deal.partner_id, 
        dealId, 
        slot?.id || null,
        date, 
        time_slot || null,
        quantity, 
        quantity, // num_guests same as quantity for now
        finalAmount, 
        special_requests || null, 
        'confirmed', // Auto-confirm since no payment gateway
        bookingRef,
        finalAmount,
        eztRequired,
        finalAmount > 0
      ]
    );

    const booking = bookingResult.rows[0];

    // Update slot booked count if slot exists
    if (slot) {
      await client.query(
        `UPDATE deal_slots 
         SET booked = booked + $1, 
             updated_at = CURRENT_TIMESTAMP,
             is_available = CASE WHEN (capacity - booked - $1) > 0 THEN true ELSE false END
         WHERE id = $2`,
        [quantity, slot.id]
      );
    }

    // Get user's current tier for transaction record
    const userTierResult = await client.query(
      'SELECT current_tier_id FROM users WHERE id = $1',
      [user_id]
    );
    const userTierId = userTierResult.rows[0]?.current_tier_id || null;

    // Create transaction record
    const transactionResult = await client.query(
      `INSERT INTO transactions (
        user_id, partner_id, category_id, bill_amount, discount_percentage, discount_amount,
        amount_after_discount, tokens_redeemed, tokens_earned, user_tier_at_transaction,
        payment_status, transaction_type, app2_transaction_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *`,
      [
        user_id, 
        deal.partner_id, 
        deal.category_id, 
        totalOriginalAmount,
        totalOriginalAmount > 0 ? (totalDiscountAmount / totalOriginalAmount) * 100 : 0,
        totalDiscountAmount,
        finalAmount,
        eztRequired,
        0, // Will be calculated after commit
        userTierId,
        'completed',
        'booking',
        bookingRef
      ]
    );

    const transaction = transactionResult.rows[0];

    await client.query(
      'UPDATE transactions SET net_token_change = $1 WHERE id = $2',
      [-eztRequired, transaction.id]
    );

    await client.query('COMMIT');
    client.release();

    // Update deal redemption count
    await pool.query(
      'UPDATE partner_offers SET current_redemptions = COALESCE(current_redemptions, 0) + 1 WHERE id = $1',
      [dealId]
    );

    const customerProfile = await getUserProfile(user_id);
    const voucher = await createVoucherForBooking(booking, deal, user_id, quantity);
    const orderRecord = await createPartnerOrderRecord(
      booking,
      deal,
      customerProfile,
      quantity,
      finalAmount,
      special_requests,
      totalOriginalAmount,
      totalDiscountAmount,
      eztRequired
    );

    const sanitizedVoucher = voucher
      ? {
          code: voucher.code,
          status: voucher.status,
          qr_code_data: voucher.qr_code_data,
          qr_code_url: voucher.qr_code_url,
          expires_at: voucher.expires_at,
          redeemed_at: voucher.redeemed_at
        }
      : null;

    // Log partner notification (can be extended to email/webhook)
    log(`📧 Partner notification: New booking ${bookingRef} for ${deal.partner_name} - Deal: ${deal.title}, Amount: ₹${finalAmount.toFixed(2)}`);

    log(`✅ Booking created: ${bookingRef} for deal ${deal.title} by user ${user_id}`);

    successResponse(res, 201, "Booking confirmed successfully", {
      ...booking,
      deal_title: deal.title,
      partner_name: deal.partner_name,
      ezt_earned: 0,
      ezt_redeemed: eztRequired,
      final_amount: finalAmount,
      fiat_amount: finalAmount,
      reward_eligible: booking.reward_eligible,
      transaction_id: transaction.id,
      voucher: sanitizedVoucher,
      order_id: orderRecord?.id || null,
      customer_name: customerProfile?.fullName || customerProfile?.first_name || null
    });

  } catch (err) {
    await client.query('ROLLBACK');
    client.release();
    logError("❌ Deal booking error:", err);
    logError("❌ Error details:", {
      message: err.message,
      code: err.code,
      detail: err.detail,
      constraint: err.constraint,
      table: err.table,
      column: err.column,
      stack: err.stack
    });
    
    // Provide more specific error messages
    let errorMessage = err.message || "Failed to create booking";
    
    if (err.code === '23503') { // Foreign key violation
      errorMessage = `Database constraint error: ${err.detail || err.message}. Please check if the deal, partner, or user exists.`;
    } else if (err.code === '23502') { // Not null violation
      errorMessage = `Missing required field: ${err.column || 'unknown'}. ${err.message}`;
    } else if (err.code === '23505') { // Unique violation
      errorMessage = `Duplicate booking: ${err.detail || err.message}`;
    } else if (err.message) {
      errorMessage = err.message;
    }
    
    errorResponse(res, 500, "Failed to create booking", errorMessage);
  }
});

// Create booking
app.post("/api/v1/bookings", authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { event_id, offer_id, num_tickets = 1, special_requests } = req.body;
    const user_id = req.userId;

    if (!event_id && !offer_id) {
      return errorResponse(res, 400, "Either event_id or offer_id is required");
    }

    await client.query('BEGIN');

    let bookingData = { user_id, num_tickets, special_requests };
    let amount = 0;
    let partner_id = null;
    let commission_percentage = 10.0;

    // Get commission percentage from system settings
    const settingsResult = await client.query(
      "SELECT setting_value FROM system_settings WHERE setting_key = 'commission_percentage'"
    );
    if (settingsResult.rows.length > 0) {
      commission_percentage = parseFloat(settingsResult.rows[0].setting_value) || 10.0;
    }

    if (event_id) {
      // Event booking
      const eventResult = await client.query(
        'SELECT e.*, p.id as partner_id FROM events e LEFT JOIN partners p ON e.venue_id = p.id WHERE e.id = $1 AND e.status = $2',
        [event_id, 'active']
      );

      if (eventResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return errorResponse(res, 404, "Event not found or not active");
      }

      const event = eventResult.rows[0];
      partner_id = event.partner_id;

      // Check if event has passed
      if (event.start_time && new Date(event.start_time) < new Date()) {
        await client.query('ROLLBACK');
        return errorResponse(res, 400, "Cannot book for past events");
      }

      // Check available tickets (booking_cap - booked tickets)
      const bookedResult = await client.query(
        `SELECT COUNT(*) as booked_count FROM bookings 
         WHERE event_id = $1 AND status IN ('pending', 'confirmed', 'redeemed')`,
        [event_id]
      );
      const bookedCount = parseInt(bookedResult.rows[0].booked_count || 0);
      const availableTickets = (event.booking_cap || 0) - bookedCount;

      if (num_tickets > availableTickets) {
        await client.query('ROLLBACK');
        return errorResponse(res, 400, `Only ${availableTickets} tickets available`);
      }

      amount = (parseFloat(event.price_per_ticket) || 0) * num_tickets;
      bookingData.event_id = event_id;
      bookingData.status = 'confirmed';
    } else if (offer_id) {
      // Offer booking
      const offerResult = await client.query(
        `SELECT po.*, p.id as partner_id FROM partner_offers po 
         JOIN partners p ON po.partner_id = p.id 
         WHERE po.id = $1 AND po.is_active = true 
         AND po.start_date <= CURRENT_TIMESTAMP AND po.end_date >= CURRENT_TIMESTAMP`,
        [offer_id]
      );

      if (offerResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return errorResponse(res, 404, "Offer not found or expired");
      }

      const offer = offerResult.rows[0];
      partner_id = offer.partner_id;

      // Check redemptions limit
      if (offer.max_redemptions && (offer.current_redemptions || 0) >= offer.max_redemptions) {
        await client.query('ROLLBACK');
        return errorResponse(res, 400, "Offer redemption limit reached");
      }

      amount = parseFloat(offer.discounted_price || offer.original_price || 0);
      bookingData.offer_id = offer_id;
      bookingData.status = 'confirmed';
    }

    // Handle EZT token redemption if provided
    const { ezt_to_redeem } = req.body;
    let eztRedeemed = 0;
    let eztDiscount = 0;
    let finalAmount = amount;
    
    if (ezt_to_redeem && parseFloat(ezt_to_redeem) > 0) {
      try {
        const redeemResult = await redeemTokens(user_id, parseFloat(ezt_to_redeem), null, `Redeemed for ${event_id ? 'event' : 'offer'} booking`);
        eztRedeemed = redeemResult.eztRedeemed;
        eztDiscount = redeemResult.discountAmount;
        finalAmount = Math.max(0, amount - eztDiscount); // Final amount after EZT discount
      } catch (redeemError) {
        await client.query('ROLLBACK');
        return errorResponse(res, 400, `EZT redemption failed: ${redeemError.message}`);
      }
    }

    const partner_earning = finalAmount - (finalAmount * commission_percentage / 100);

    // Create booking
    const bookingResult = await client.query(
      `INSERT INTO bookings (user_id, event_id, offer_id, booking_date, status, amount, 
        commission_percentage, partner_earning, num_tickets, special_requests)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [user_id, bookingData.event_id || null, bookingData.offer_id || null, bookingData.status,
       finalAmount, commission_percentage, partner_earning, num_tickets, special_requests || null]
    );

    const booking = bookingResult.rows[0];
    
    // Get user's current tier for transaction record
    const userTierResult = await client.query(
      'SELECT current_tier_id FROM users WHERE id = $1',
      [user_id]
    );
    const userTierId = userTierResult.rows[0]?.current_tier_id || null;
    
    // Get category_id from partner
    const categoryResult = await client.query(
      'SELECT category_id FROM partners WHERE id = $1',
      [partner_id]
    );
    const categoryId = categoryResult.rows[0]?.category_id || null;
    
    // Create transaction record
    const transactionResult = await client.query(
      `INSERT INTO transactions (
        user_id, partner_id, category_id, bill_amount, discount_percentage, discount_amount,
        amount_after_discount, tokens_redeemed, tokens_earned, user_tier_at_transaction,
        payment_status, transaction_type
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        user_id, partner_id, categoryId, amount, // bill_amount is original amount
        eztDiscount > 0 ? (eztDiscount / amount * 100) : 0, // discount_percentage
        eztDiscount, // discount_amount
        finalAmount, // amount_after_discount
        eztRedeemed, // tokens_redeemed
        0, // tokens_earned (will be calculated after commit)
        userTierId, // user_tier_at_transaction
        'completed', // payment_status
        'purchase' // transaction_type
      ]
    );
    
    const transaction = transactionResult.rows[0];

    // Update offer redemption count if offer booking
    if (offer_id) {
      await client.query(
        'UPDATE partner_offers SET current_redemptions = COALESCE(current_redemptions, 0) + 1 WHERE id = $1',
        [offer_id]
      );
    }

    await client.query('COMMIT');
    
    // Award EZT tokens after transaction commit (based on final amount paid after EZT discount)
    const eztEarned = await awardTokens(user_id, finalAmount, transaction.id, `Earned from ${event_id ? 'event' : 'offer'} booking`);
    
    // Update transaction with earned tokens (outside transaction to avoid deadlock)
    await pool.query(
      'UPDATE transactions SET tokens_earned = $1, net_token_change = $2 WHERE id = $3',
      [eztEarned, eztEarned - eztRedeemed, transaction.id]
    );

    // Award loyalty points
    const multiplierResult = await pool.query(
      "SELECT setting_value FROM system_settings WHERE setting_key = 'loyalty_multiplier'"
    );
    const multiplier = parseFloat(multiplierResult.rows[0]?.setting_value || 1);
    const pointsEarned = Math.floor((amount / 100) * multiplier);

    if (pointsEarned > 0) {
      // Get current balance
      const balanceResult = await pool.query(
        'SELECT points_balance FROM loyalty_points WHERE user_id = $1 ORDER BY last_updated DESC LIMIT 1',
        [user_id]
      );
      const currentBalance = parseFloat(balanceResult.rows[0]?.points_balance || 0);
      const newBalance = currentBalance + pointsEarned;

      await pool.query(
        `INSERT INTO loyalty_points (user_id, booking_id, points_earned, points_balance, transaction_type, description)
         VALUES ($1, $2, $3, $4, 'earned', 'Points earned from booking')`,
        [user_id, booking.id, pointsEarned, newBalance]
      );

      booking.points_earned = pointsEarned;
    }

    successResponse(res, 201, "Booking created successfully", booking);
  } catch (err) {
    await client.query('ROLLBACK');
    logError("❌ Booking creation error:", err);
    errorResponse(res, 500, "Failed to create booking: " + err.message);
  } finally {
    client.release();
  }
});

// Confirm payment and credit EZT rewards
app.put('/api/v1/bookings/:bookingId/confirm-payment', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { bookingId } = req.params;

    await client.query('BEGIN');

    const bookingResult = await client.query(
      `SELECT id, user_id, partner_id, fiat_amount, ezt_redeemed, reward_eligible, reward_credited, booking_reference
       FROM bookings
       WHERE id = $1
       FOR UPDATE`,
      [bookingId]
    );

    if (bookingResult.rowCount === 0) {
      await client.query('ROLLBACK');
      client.release();
      return errorResponse(res, 404, 'Booking not found');
    }

    const booking = bookingResult.rows[0];

    if (!booking.reward_eligible) {
      await client.query('ROLLBACK');
      client.release();
      return errorResponse(res, 400, 'Booking is not eligible for reward');
    }

    if (booking.reward_credited) {
      await client.query('ROLLBACK');
      client.release();
      return errorResponse(res, 400, 'Reward already credited for this booking');
    }

    const actorRole = await getUserRoleById(req.userId);
    if (actorRole !== 'super_admin') {
      const partnerCheck = await client.query('SELECT partner_id FROM users WHERE id = $1', [req.userId]);
      const actorPartnerId = partnerCheck.rows[0]?.partner_id;
      if (!actorPartnerId || String(actorPartnerId) !== String(booking.partner_id)) {
        await client.query('ROLLBACK');
        client.release();
        return errorResponse(res, 403, 'You are not authorized to confirm this payment');
      }
    }

    const transactionResult = await client.query(
      'SELECT id, tokens_redeemed FROM transactions WHERE app2_transaction_id = $1 LIMIT 1',
      [booking.booking_reference]
    );
    const transaction = transactionResult.rows[0] || null;

    const tierResult = await client.query(
      `SELECT u.available_tokens, u.total_tokens_earned, t.token_earning_percentage
       FROM users u
       LEFT JOIN tiers t ON u.current_tier_id = t.id
       WHERE u.id = $1
       FOR UPDATE`,
      [booking.user_id]
    );

    if (tierResult.rowCount === 0) {
      await client.query('ROLLBACK');
      client.release();
      return errorResponse(res, 404, 'User not found for reward credit');
    }

    const tierRow = tierResult.rows[0];
    const rewardPercent = parseFloat(tierRow.token_earning_percentage || 1.0);
    const fiatAmount = parseFloat(booking.fiat_amount || 0);
    const rewardTokens = parseFloat(((fiatAmount * rewardPercent) / 100 / 100).toFixed(5));

    const balanceBefore = parseFloat(tierRow.available_tokens || 0);
    const balanceAfter = balanceBefore + rewardTokens;

    if (rewardTokens > 0) {
      await client.query(
        `UPDATE users 
         SET available_tokens = available_tokens + $1,
             total_tokens_earned = total_tokens_earned + $1
         WHERE id = $2`,
        [rewardTokens, booking.user_id]
      );

      await client.query(
        `INSERT INTO token_ledger (user_id, transaction_id, amount, ledger_type, change_type, balance_before, balance_after, description, source)
         VALUES ($1, $2, $3, 'reward_credit', 'credit', $4, $5, $6, 'reward')`,
        [
          booking.user_id,
          transaction ? transaction.id : null,
          rewardTokens,
          balanceBefore,
          balanceAfter,
          `Reward for verified payment of Booking ${booking.booking_reference}`
        ]
      );
    }

    await client.query(
      'UPDATE bookings SET reward_credited = true, reward_eligible = false, status = $2 WHERE id = $1',
      [bookingId, 'paid']
    );

    await client.query('COMMIT');
    client.release();

    if (transaction) {
      await pool.query(
        'UPDATE transactions SET tokens_earned = $1, net_token_change = $2, payment_status = $3 WHERE id = $4',
        [
          rewardTokens,
          rewardTokens - parseFloat(transaction.tokens_redeemed || 0),
          'paid',
          transaction.id
        ]
      );
    }

    await updateTierProgress(booking.user_id, fiatAmount);

    successResponse(res, 200, 'Reward credited successfully', {
      booking_id: bookingId,
      reward_tokens: rewardTokens,
      fiat_amount: fiatAmount,
      reward_percent: rewardPercent
    });
  } catch (error) {
    await client.query('ROLLBACK');
    client.release();
    logError('❌ Confirm payment error:', error);
    errorResponse(res, 500, 'Failed to confirm payment', error.message);
  }
});

// Get user bookings
app.get("/api/v1/bookings", authenticateToken, async (req, res) => {
  try {
    const user_id = req.userId;
    const { status } = req.query;

    let query = `
      SELECT b.*, 
        e.title as event_title, e.start_time as event_start, e.image_url as event_image,
        po.title as offer_title, po.image_url as offer_image,
        p.name as partner_name
      FROM bookings b
      LEFT JOIN events e ON b.event_id = e.id
      LEFT JOIN partner_offers po ON b.offer_id = po.id
      LEFT JOIN partners p ON (e.venue_id = p.id OR po.partner_id = p.id)
      WHERE b.user_id = $1
    `;
    const params = [user_id];

    if (status) {
      query += ` AND b.status = $2`;
      params.push(status);
    }

    query += ` ORDER BY b.booking_date DESC`;

    const result = await pool.query(query, params);
    successResponse(res, 200, "Bookings retrieved successfully", result.rows);
  } catch (err) {
    logError("❌ Bookings fetch error:", err);
    errorResponse(res, 500, "Failed to fetch bookings");
  }
});
// ============================================
// VOUCHER SYSTEM (QR Vouchers)
// ============================================
// Generate voucher for booking
app.post("/api/v1/bookings/:bookingId/vouchers", authenticateToken, async (req, res) => {
  try {
    const { bookingId } = req.params;
    const user_id = req.userId;

    // Verify booking ownership
    const bookingResult = await pool.query(
      `SELECT b.*, e.id as event_id, e.venue_id as partner_id_from_event,
        po.partner_id as partner_id_from_offer
       FROM bookings b
       LEFT JOIN events e ON b.event_id = e.id
       LEFT JOIN partner_offers po ON b.offer_id = po.id
       WHERE b.id = $1 AND b.user_id = $2 AND b.status = 'confirmed'`,
      [bookingId, user_id]
    );

    if (bookingResult.rows.length === 0) {
      return errorResponse(res, 404, "Booking not found or not confirmed");
    }

    const booking = bookingResult.rows[0];
    const partner_id = booking.partner_id_from_event || booking.partner_id_from_offer;

    // Check if voucher already exists
    const existingVoucher = await pool.query(
      'SELECT * FROM vouchers WHERE booking_id = $1 AND status = $2',
      [bookingId, 'active']
    );

    if (existingVoucher.rows.length > 0) {
      return successResponse(res, 200, "Voucher already exists", existingVoucher.rows[0]);
    }

    // Generate unique voucher code
    const voucherCode = `VCH-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    // Get voucher expiry from settings
    const expiryResult = await pool.query(
      "SELECT setting_value FROM system_settings WHERE setting_key = 'voucher_expiry_days'"
    );
    const expiryDays = parseInt(expiryResult.rows[0]?.setting_value || 30);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiryDays);

    // Generate QR code data
    const qrData = {
      voucher_code: voucherCode,
      booking_id: bookingId,
      event_id: booking.event_id,
      offer_id: booking.offer_id,
      partner_id: partner_id,
      user_id: user_id,
      amount: booking.amount,
      created_at: new Date().toISOString()
    };

    // Generate QR code image
    if (process.env.VERCEL) {
      return errorResponse(res, 500, "Local file storage not supported on Vercel");
    }
    const uploadsDir = path.join(__dirname, '../frontend/public/uploads/vouchers');
    fs.mkdirSync(uploadsDir, { recursive: true });
    const qrImagePath = path.join(uploadsDir, `qr_${voucherCode}.png`);
    await QRCode.toFile(qrImagePath, JSON.stringify(qrData), {
      errorCorrectionLevel: 'H',
      type: 'png',
      width: 400
    });

    const qr_code_url = `/uploads/vouchers/qr_${voucherCode}.png`;

    // Create voucher
    const voucherResult = await pool.query(
      `INSERT INTO vouchers (booking_id, event_id, partner_id, code, qr_code_url, qr_code_data, 
        status, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [bookingId, booking.event_id || null, partner_id, voucherCode, qr_code_url,
       JSON.stringify(qrData), 'active', expiresAt]
    );

    const voucher = voucherResult.rows[0];

    // TODO: Send email notification with QR code

    successResponse(res, 201, "Voucher generated successfully", voucher);
  } catch (err) {
    logError("❌ Voucher generation error:", err);
    errorResponse(res, 500, "Failed to generate voucher: " + err.message);
  }
});

// Redeem voucher (Partner QR Scanner)
app.post("/api/v1/vouchers/:code/redeem", authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { code } = req.params;
    const partner_id = req.userId; // Assuming partner login sets userId

    // Get voucher
    const voucherResult = await client.query(
      `SELECT v.*, b.user_id, b.status as booking_status
       FROM vouchers v
       JOIN bookings b ON v.booking_id = b.id
       WHERE v.code = $1`,
      [code]
    );

    if (voucherResult.rows.length === 0) {
      return errorResponse(res, 404, "Voucher not found");
    }

    const voucher = voucherResult.rows[0];

    // Verify voucher belongs to this partner
    if (voucher.partner_id !== partner_id) {
      return errorResponse(res, 403, "This voucher does not belong to your partner");
    }

    // Check voucher status
    if (voucher.status !== 'active') {
      return errorResponse(res, 400, `Voucher is ${voucher.status}`);
    }

    // Check expiry
    if (voucher.expires_at && new Date(voucher.expires_at) < new Date()) {
      await client.query(
        'UPDATE vouchers SET status = $1 WHERE id = $2',
        ['expired', voucher.id]
      );
      return errorResponse(res, 400, "Voucher has expired");
    }

    // Check booking status
    if (voucher.booking_status !== 'confirmed') {
      return errorResponse(res, 400, "Booking is not confirmed");
    }

    await client.query('BEGIN');

    // Redeem voucher
    await client.query(
      `UPDATE vouchers 
       SET status = $1, redeemed_by_partner_id = $2, redeemed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      ['redeemed', partner_id, voucher.id]
    );

    // Update booking status
    await client.query(
      'UPDATE bookings SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['redeemed', voucher.booking_id]
    );

    await client.query('COMMIT');

    // TODO: Send redemption confirmation email to user

    successResponse(res, 200, "Voucher redeemed successfully", {
      voucher_code: voucher.code,
      redeemed_at: new Date().toISOString()
    });
  } catch (err) {
    await client.query('ROLLBACK');
    logError("❌ Voucher redemption error:", err);
    errorResponse(res, 500, "Failed to redeem voucher: " + err.message);
  } finally {
    client.release();
  }
});

// Get voucher by code (for validation)
app.get("/api/v1/vouchers/:code", async (req, res) => {
  try {
    const { code } = req.params;

    const result = await pool.query(
      `SELECT v.*, 
              b.user_id,
              b.amount,
              b.deal_id,
              e.title as event_title,
              po.title as offer_title
       FROM vouchers v
       JOIN bookings b ON v.booking_id = b.id
       LEFT JOIN events e ON v.event_id = e.id
       LEFT JOIN partner_offers po ON b.deal_id = po.id
       WHERE v.code = $1`,
      [code]
    );

    if (result.rows.length === 0) {
      return errorResponse(res, 404, "Voucher not found");
    }

    successResponse(res, 200, "Voucher retrieved successfully", result.rows[0]);
  } catch (err) {
    logError("❌ Voucher fetch error:", err);
    errorResponse(res, 500, "Failed to fetch voucher");
  }
});

// Get partner's vouchers
app.get("/api/v1/partners/:id/vouchers", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.query;

    let query = `
      SELECT v.*, 
             b.user_id, 
             b.amount, 
             b.deal_id,
             e.title as event_title, 
             po.title as offer_title,
             u.first_name || ' ' || u.last_name as user_name
      FROM vouchers v
      JOIN bookings b ON v.booking_id = b.id
      LEFT JOIN events e ON v.event_id = e.id
      LEFT JOIN partner_offers po ON b.deal_id = po.id
      LEFT JOIN users u ON b.user_id = u.id
      WHERE v.partner_id = $1
    `;
    const params = [id];

    if (status) {
      query += ` AND v.status = $2`;
      params.push(status);
    }

    query += ` ORDER BY v.created_at DESC`;

    const result = await pool.query(query, params);
    successResponse(res, 200, "Vouchers retrieved successfully", result.rows);
  } catch (err) {
    logError("❌ Vouchers fetch error:", err);
    errorResponse(res, 500, "Failed to fetch vouchers");
  }
});

// ============================================
// AUTOMATED ARCHIVING SYSTEM
// ============================================

// Archive expired offers/events (cron job runs daily at 2 AM)
async function archiveExpiredItems() {
  try {
    log('🔄 Starting automated archiving process...');
    
    // Get archive threshold from settings
    const settingsResult = await pool.query(
      "SELECT setting_value FROM system_settings WHERE setting_key = 'archive_expired_after_days'"
    );
    const archiveAfterDays = parseInt(settingsResult.rows[0]?.setting_value || 7);
    const archiveThreshold = new Date();
    archiveThreshold.setDate(archiveThreshold.getDate() - archiveAfterDays);

    // Archive expired offers
    const expiredOffers = await pool.query(
      `SELECT id FROM partner_offers 
       WHERE end_date < $1 
       AND is_active = true
       AND id NOT IN (SELECT offer_id FROM archives WHERE offer_id IS NOT NULL)`,
      [archiveThreshold]
    );

    for (const offer of expiredOffers.rows) {
      await pool.query(
        `INSERT INTO archives (offer_id, archived_on, reason, can_reactivate)
         VALUES ($1, CURRENT_TIMESTAMP, 'Automatically archived after expiry', true)`,
        [offer.id]
      );
      await pool.query(
        'UPDATE partner_offers SET is_active = false WHERE id = $1',
        [offer.id]
      );
    }

    // Archive expired events
    const expiredEvents = await pool.query(
      `SELECT id FROM events 
       WHERE (start_time < $1 OR end_time < $1)
       AND status = 'active'
       AND id NOT IN (SELECT event_id FROM archives WHERE event_id IS NOT NULL)`,
      [archiveThreshold]
    );

    for (const event of expiredEvents.rows) {
      await pool.query(
        `INSERT INTO archives (event_id, archived_on, reason, can_reactivate)
         VALUES ($1, CURRENT_TIMESTAMP, 'Automatically archived after event date', true)`,
        [event.id]
      );
      await pool.query(
        "UPDATE events SET status = 'completed' WHERE id = $1",
        [event.id]
      );
    }

    log(`✅ Archived ${expiredOffers.rows.length} offers and ${expiredEvents.rows.length} events`);
  } catch (err) {
    logError('❌ Archiving error:', err);
  }
}

// Schedule archiving (daily at 2 AM)
if (process.env.VERCEL) {
  log('⏸️ Automated archiving cron disabled on Vercel');
} else if (process.env.NODE_ENV === 'production' || process.env.ENABLE_ARCHIVING === 'true') {
  cron.schedule('0 2 * * *', archiveExpiredItems);
  log('📅 Automated archiving scheduled (daily at 2 AM)');
}

// ============================================
// ADMIN ENDPOINTS - DASHBOARD & OVERVIEW
// ============================================

app.get("/api/v1/admin/dashboard", authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { range = '30' } = req.query;
    const rangeDays = Math.min(Math.max(parseInt(range, 10) || 30, 1), 180);
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    startDate.setDate(startDate.getDate() - (rangeDays - 1));

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const startDateISO = startDate.toISOString().slice(0, 10);

    const [
      totalUsersResult,
      newUsersTodayResult,
      totalPartnersResult,
      pendingPartnersResult,
      dealsResult,
      adminProfileResult
    ] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS count FROM users`),
      pool.query(`SELECT COUNT(*)::int AS count FROM users WHERE created_at >= $1`, [todayStart]),
      pool.query(`SELECT COUNT(*)::int AS count FROM partners`),
      pool.query(`SELECT COUNT(*)::int AS count FROM partners WHERE is_active = false`),
      pool.query(`
        SELECT
          COUNT(*)::int AS total_deals,
          COUNT(*) FILTER (WHERE is_active = true AND (end_date IS NULL OR end_date >= NOW()))::int AS active_deals,
          COUNT(*) FILTER (WHERE is_promoted = true)::int AS promoted_deals
        FROM partner_offers
      `),
      pool.query(`SELECT last_login FROM users WHERE id = $1`, [req.userId])
    ]);

    let activeSessions = 0;
    try {
      const sessionsResult = await pool.query(`SELECT COUNT(*)::int AS count FROM user_sessions WHERE expires_at > NOW()`);
      activeSessions = sessionsResult.rows[0]?.count || 0;
    } catch (sessionError) {
      if (sessionError.code !== '42P01') {
        log('⚠️ Active sessions query failed:', sessionError.message);
      }
    }

    let totalRevenue = 0;
    let revenueChart = [];
    try {
      const revenueResult = await pool.query(
        `SELECT booking_date::date AS date, COALESCE(SUM(fiat_amount), 0)::numeric AS amount
         FROM bookings
         WHERE booking_date >= $1
         GROUP BY booking_date::date
         ORDER BY booking_date::date ASC`,
        [startDateISO]
      );
      revenueChart = revenueResult.rows.map((row) => ({
        date: row.date,
        amount: parseFloat(row.amount || 0)
      }));
      totalRevenue = revenueChart.reduce((sum, point) => sum + point.amount, 0);
    } catch (revenueError) {
      if (revenueError.code !== '42P01') {
        logError('❌ Revenue chart error:', revenueError);
      }
    }

    let recentActivity = [];
    try {
      const activityResult = await pool.query(`
        SELECT 
          al.action,
          al.entity_type,
          al.entity_id,
          al.meta,
          al.created_at,
          al.actor_role,
          al.actor_user_id,
          COALESCE(ua.first_name || ' ' || ua.last_name, ua.email, 'System') AS actor_name,
          CASE
            WHEN al.entity_type = 'offer' THEN po.title
            WHEN al.entity_type = 'partner' THEN pr.name
            WHEN al.entity_type = 'user' THEN ue.first_name || ' ' || ue.last_name
            ELSE NULL
          END AS entity_name
        FROM audit_log al
        LEFT JOIN users ua ON al.actor_user_id = ua.id
        LEFT JOIN partner_offers po ON al.entity_type = 'offer' AND po.id = al.entity_id
        LEFT JOIN partners pr ON al.entity_type = 'partner' AND pr.id = al.entity_id
        LEFT JOIN users ue ON al.entity_type = 'user' AND ue.id = al.entity_id
        ORDER BY al.created_at DESC
        LIMIT 10
      `);

      recentActivity = activityResult.rows.map((row) => {
        // Parse meta if it's a JSON string
        let meta = row.meta;
        if (typeof meta === 'string') {
          try {
            meta = JSON.parse(meta);
          } catch (e) {
            meta = {};
          }
        }
        if (!meta || typeof meta !== 'object') {
          meta = {};
        }

        // Extract actor name - ensure it's always a string
        let actorName = row.actor_name || 'System';
        if (meta.actor) {
          if (typeof meta.actor === 'string') {
            actorName = meta.actor;
          } else if (typeof meta.actor === 'object' && meta.actor.name) {
            actorName = meta.actor.name;
          } else if (typeof meta.actor === 'object' && meta.actor.email) {
            actorName = meta.actor.email;
          }
        }

        // Format entity name - prioritize SQL join result
        let entityName = row.entity_name;
        
        // Fallback to meta.entity if SQL join didn't return a name
        if (!entityName || entityName.trim() === '') {
          if (meta.entity) {
            if (typeof meta.entity === 'string') {
              entityName = meta.entity;
            } else if (typeof meta.entity === 'object') {
              entityName = meta.entity.offer_title || meta.entity.partner_name || meta.entity.title;
            }
          }
        }
        
        // Last resort: use entity_type#entity_id format
        if (!entityName || entityName.trim() === '') {
          if (row.entity_id) {
            entityName = `${row.entity_type || 'entity'}#${row.entity_id}`;
          }
        }

        // Generate description
        let description = '';
        const action = row.action || 'system_event';
        const actionLabel = action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        
        if (action === 'feature_toggle') {
          const isPromoted = meta.next?.is_promoted || meta.is_promoted;
          const wasPromoted = meta.previous?.is_promoted;
          if (isPromoted && !wasPromoted) {
            description = `${actorName} promoted offer "${entityName}"`;
          } else if (!isPromoted && wasPromoted) {
            description = `${actorName} removed offer "${entityName}" from trending`;
          } else {
            description = `${actorName} toggled feature for "${entityName}"`;
          }
        } else if (action === 'partner_approved' || action === 'partner_approval') {
          description = `${actorName} approved partner "${entityName}"`;
        } else if (action === 'partner_rejected' || action === 'partner_rejection') {
          description = `${actorName} rejected partner "${entityName}"`;
        } else if (action === 'offer_created') {
          description = `${actorName} created offer "${entityName}"`;
        } else if (action === 'offer_updated') {
          description = `${actorName} updated offer "${entityName}"`;
        } else if (action === 'user_created') {
          description = `${actorName} created user "${entityName}"`;
        } else {
          description = `${actorName} performed ${actionLabel} on ${entityName || row.entity_type || 'entity'}`;
        }

        return {
          type: action,
          entity: entityName || `${row.entity_type || 'entity'}#${row.entity_id || 'unknown'}`,
          meta: meta,
          actor: actorName, // Always a string now
          actor_role: row.actor_role || 'system',
          description: description,
          timestamp: row.created_at
        };
      });
    } catch (auditError) {
      if (auditError.code !== '42P01') {
        log('⚠️ audit_log table not available, using fallback activity feed');
      }

      try {
        const fallbackResult = await pool.query(`
          SELECT * FROM (
            SELECT 'booking' AS type, booking_reference AS entity, fiat_amount::text AS meta, created_at
            FROM bookings
            ORDER BY created_at DESC
            LIMIT 5
          ) AS bookings
          UNION ALL
          SELECT * FROM (
            SELECT 'partner_offer' AS type, title AS entity, status::text AS meta, updated_at AS created_at
            FROM partner_offers
            ORDER BY updated_at DESC
            LIMIT 5
          ) AS offers
          ORDER BY created_at DESC
          LIMIT 10
        `);
        recentActivity = fallbackResult.rows.map((row) => ({
          type: row.type,
          entity: row.entity,
          meta: row.meta,
          actor: 'System',
          actor_role: 'system',
          description: `System recorded ${row.type.replace(/_/g, ' ')}: ${row.entity}`,
          timestamp: row.created_at
        }));
      } catch (fallbackError) {
        logError('❌ Fallback activity feed error:', fallbackError);
      }
    }

    successResponse(res, 200, "Dashboard metrics retrieved successfully", {
      total_users: totalUsersResult.rows[0]?.count || 0,
      new_users_today: newUsersTodayResult.rows[0]?.count || 0,
      total_partners: totalPartnersResult.rows[0]?.count || 0,
      pending_partners: pendingPartnersResult.rows[0]?.count || 0,
      total_deals: dealsResult.rows[0]?.total_deals || 0,
      active_deals: dealsResult.rows[0]?.active_deals || 0,
      promoted_deals: dealsResult.rows[0]?.promoted_deals || 0,
      total_revenue: totalRevenue,
      active_sessions: activeSessions,
      recent_activity: recentActivity,
      revenue_chart: revenueChart,
      last_login: adminProfileResult.rows[0]?.last_login || null
    });
  } catch (err) {
    logError("❌ Admin dashboard error:", err);
    errorResponse(res, 500, "Failed to retrieve dashboard metrics", err.message);
  }
});

// ============================================
// ADMIN ENDPOINTS - PARTNER & DEAL MANAGEMENT
// ============================================

app.get("/api/v1/admin/partners", authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { status = 'all' } = req.query;
    const normalizedStatus = status ? status.toLowerCase() : 'all';

    const params = [];
    let whereClause = '';

    if (normalizedStatus === 'approved') {
      params.push(true);
      whereClause = 'WHERE p.is_active = $1';
    } else if (normalizedStatus === 'pending' || normalizedStatus === 'suspended') {
      params.push(false);
      whereClause = 'WHERE p.is_active = $1';
    }

    const partnersResult = await pool.query(
      `
      SELECT
        p.id,
        p.name,
        p.email,
        p.phone_number,
        p.address,
        p.is_active,
        p.approved_for_featured,
        p.created_at,
        COALESCE(offer_stats.active_deals, 0)::int AS active_deals,
        COALESCE(offer_stats.promoted_deals, 0)::int AS promoted_deals,
        COALESCE(booking_stats.total_bookings, 0)::int AS total_bookings,
        COALESCE(booking_stats.revenue, 0)::numeric AS revenue
      FROM partners p
      LEFT JOIN (
        SELECT 
          partner_id,
          COUNT(*) FILTER (WHERE is_active = true)::int AS active_deals,
          COUNT(*) FILTER (WHERE is_promoted = true)::int AS promoted_deals
        FROM partner_offers
        GROUP BY partner_id
      ) AS offer_stats ON offer_stats.partner_id = p.id
      LEFT JOIN (
        SELECT 
          partner_id,
          COUNT(*)::int AS total_bookings,
          COALESCE(SUM(fiat_amount), 0)::numeric AS revenue
        FROM bookings
        GROUP BY partner_id
      ) AS booking_stats ON booking_stats.partner_id = p.id
      ${whereClause}
      ORDER BY p.created_at DESC
      `,
      params
    );

    const partners = partnersResult.rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      phone_number: row.phone_number,
      address: row.address,
      status: row.is_active ? 'approved' : 'pending',
      approved_for_featured: row.approved_for_featured,
      active_deals: row.active_deals,
      promoted_deals: row.promoted_deals,
      total_bookings: row.total_bookings,
      revenue: parseFloat(row.revenue || 0)
    }));

    successResponse(res, 200, "Partners retrieved successfully", partners);
  } catch (err) {
    logError("❌ Admin partners fetch error:", err);
    errorResponse(res, 500, "Failed to retrieve partners", err.message);
  }
});

app.patch("/api/v1/admin/partners/:id/status", authenticateToken, requireSuperAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { action } = req.body || {};

    if (!['approve', 'reject', 'suspend', 'toggle'].includes(action)) {
      return errorResponse(res, 400, "Invalid action provided");
    }

    const currentResult = await client.query(
      `SELECT id, name, is_active FROM partners WHERE id = $1`,
      [id]
    );

    if (currentResult.rowCount === 0) {
      return errorResponse(res, 404, "Partner not found");
    }

    const current = currentResult.rows[0];
    let nextActiveState = current.is_active;

    switch (action) {
      case 'approve':
        nextActiveState = true;
        break;
      case 'reject':
        nextActiveState = false;
        break;
      case 'suspend':
      case 'toggle':
        nextActiveState = !current.is_active;
        break;
      default:
        nextActiveState = current.is_active;
    }

    const updated = await client.query(
      `UPDATE partners
       SET is_active = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, name, email, phone_number, address, is_active, approved_for_featured`,
      [nextActiveState, id]
    );

    await writeAudit(req.userId, 'super_admin', 'partner_status_update', 'partner', id, {
      previous: { is_active: current.is_active },
      next: { is_active: nextActiveState },
      action
    });

    successResponse(res, 200, "Partner status updated successfully", updated.rows[0]);
  } catch (err) {
    logError("❌ Admin partner status update error:", err);
    errorResponse(res, 500, "Failed to update partner", err.message);
  } finally {
    client.release();
  }
});

app.get("/api/v1/admin/deals", authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const {
      search = '',
      status = 'all',
      promo = 'all'
    } = req.query;

    const searchTerm = search.trim().toLowerCase();
    const normalizedStatus = status ? status.toLowerCase() : 'all';
    const normalizedPromo = promo ? promo.toLowerCase() : 'all';

    const filters = [];
    const params = [];
    let idx = 1;

    if (searchTerm) {
      filters.push(`(LOWER(po.title) LIKE $${idx} OR LOWER(p.name) LIKE $${idx})`);
      params.push(`%${searchTerm}%`);
      idx += 1;
    }

    if (normalizedStatus === 'active') {
      filters.push(`po.is_active = true AND (po.end_date IS NULL OR po.end_date >= NOW())`);
    } else if (normalizedStatus === 'pending') {
      filters.push(`(po.is_active = false OR po.start_date > NOW())`);
    } else if (normalizedStatus === 'expired') {
      filters.push(`po.end_date IS NOT NULL AND po.end_date < NOW()`);
    }

    if (normalizedPromo === 'promoted') {
      filters.push(`po.is_promoted = true`);
    } else if (normalizedPromo === 'expiring') {
      filters.push(`po.end_date BETWEEN NOW() AND (NOW() + INTERVAL '3 day')`);
    } else if (normalizedPromo === 'pending_trending') {
      filters.push(`po.featured_request_pending = true`);
    }

    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const dealsResult = await pool.query(
      `
      SELECT
        po.id,
        po.partner_id,
        po.title,
        po.description,
        po.original_price,
        po.discounted_price,
        po.discount_percentage,
        po.discount_amount,
        po.start_date,
        po.end_date,
        po.is_active,
        po.is_promoted,
        po.featured_request_pending,
        po.max_redemptions,
        po.current_redemptions,
        po.service_type,
        p.name AS partner_name,
        p.email AS partner_email
      FROM partner_offers po
      JOIN partners p ON p.id = po.partner_id
      ${whereClause}
      ORDER BY po.featured_request_pending DESC, po.created_at DESC
      LIMIT 200
      `,
      params
    );

    const now = new Date();
    const deals = dealsResult.rows.map((deal) => {
      const endDate = deal.end_date ? new Date(deal.end_date) : null;
      let statusLabel = 'active';
      if (!deal.is_active || (deal.start_date && new Date(deal.start_date) > now)) {
        statusLabel = 'pending';
      } else if (endDate && endDate < now) {
        statusLabel = 'expired';
      }

      return {
        id: deal.id,
        partner_id: deal.partner_id,
        partner_name: deal.partner_name,
        title: deal.title,
        description: deal.description,
        original_price: parseFloat(deal.original_price || 0),
        discounted_price: parseFloat(deal.discounted_price || 0),
        discount_percentage: parseFloat(deal.discount_percentage || 0),
        discount_amount: parseFloat(deal.discount_amount || 0),
        start_date: deal.start_date,
        end_date: deal.end_date,
        status: statusLabel,
        is_promoted: deal.is_promoted,
        featured_request_pending: deal.featured_request_pending,
        max_redemptions: deal.max_redemptions,
        current_redemptions: deal.current_redemptions,
        service_type: deal.service_type
      };
    });

    successResponse(res, 200, "Deals retrieved successfully", deals);
  } catch (err) {
    logError("❌ Admin deals fetch error:", err);
    errorResponse(res, 500, "Failed to retrieve deals", err.message);
  }
});
app.patch("/api/v1/admin/deals/:id/status", authenticateToken, requireSuperAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { action } = req.body || {};

    if (!['approve', 'reject', 'pause', 'resume', 'toggle'].includes(action)) {
      return errorResponse(res, 400, "Invalid action provided");
    }

    const dealResult = await client.query(
      `SELECT id, partner_id, title, is_active, featured_request_pending
       FROM partner_offers
       WHERE id = $1`,
      [id]
    );

    if (dealResult.rowCount === 0) {
      return errorResponse(res, 404, "Deal not found");
    }

    const deal = dealResult.rows[0];
    let nextActiveState = deal.is_active;
    let nextFeaturedPending = deal.featured_request_pending;

    switch (action) {
      case 'approve':
        nextActiveState = true;
        nextFeaturedPending = false;
        break;
      case 'reject':
        nextActiveState = false;
        nextFeaturedPending = false;
        break;
      case 'pause':
        nextActiveState = false;
        break;
      case 'resume':
        nextActiveState = true;
        break;
      case 'toggle':
        nextActiveState = !deal.is_active;
        break;
      default:
        break;
    }

    const updated = await client.query(
      `UPDATE partner_offers
       SET is_active = $1,
           featured_request_pending = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *
      `,
      [nextActiveState, nextFeaturedPending, id]
    );

    await writeAudit(req.userId, 'super_admin', 'deal_status_update', 'offer', id, {
      previous: {
        is_active: deal.is_active,
        featured_request_pending: deal.featured_request_pending
      },
      next: {
        is_active: nextActiveState,
        featured_request_pending: nextFeaturedPending
      },
      action
    });

    successResponse(res, 200, "Deal status updated successfully", updated.rows[0]);
  } catch (err) {
    logError("❌ Admin deal status update error:", err);
    errorResponse(res, 500, "Failed to update deal", err.message);
  } finally {
    client.release();
  }
});

app.get("/api/v1/admin/activity", authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { type = 'all' } = req.query;
    const normalizedType = type ? type.toLowerCase() : 'all';

    let activityRows = [];
    try {
      const activityResult = await pool.query(
        `
        SELECT 
          al.action,
          al.entity_type,
          al.entity_id,
          al.meta,
          al.actor_role,
          al.actor_user_id,
          al.created_at,
          COALESCE(ua.first_name || ' ' || ua.last_name, ua.email, 'System') AS actor_name,
          CASE
            WHEN al.entity_type = 'offer' THEN po.title
            WHEN al.entity_type = 'partner' THEN pr.name
            WHEN al.entity_type = 'user' THEN ue.first_name || ' ' || ue.last_name
            ELSE NULL
          END AS entity_name
        FROM audit_log al
        LEFT JOIN users ua ON al.actor_user_id = ua.id
        LEFT JOIN partner_offers po ON al.entity_type = 'offer' AND po.id = al.entity_id
        LEFT JOIN partners pr ON al.entity_type = 'partner' AND pr.id = al.entity_id
        LEFT JOIN users ue ON al.entity_type = 'user' AND ue.id = al.entity_id
        ORDER BY al.created_at DESC
        LIMIT 50
        `
      );
      activityRows = activityResult.rows.map((row) => {
        // Parse meta if it's a JSON string
        let meta = row.meta;
        if (typeof meta === 'string') {
          try {
            meta = JSON.parse(meta);
          } catch (e) {
            meta = {};
          }
        }
        if (!meta || typeof meta !== 'object') {
          meta = {};
        }

        // Extract actor name - ensure it's always a string
        let actorName = row.actor_name || 'System';
        if (meta.actor) {
          if (typeof meta.actor === 'string') {
            actorName = meta.actor;
          } else if (typeof meta.actor === 'object' && meta.actor.name) {
            actorName = meta.actor.name;
          } else if (typeof meta.actor === 'object' && meta.actor.email) {
            actorName = meta.actor.email;
          }
        }

        // Format entity name - prioritize SQL join result
        let entityName = row.entity_name;
        
        // Fallback to meta.entity if SQL join didn't return a name
        if (!entityName || entityName.trim() === '') {
          if (meta.entity) {
            if (typeof meta.entity === 'string') {
              entityName = meta.entity;
            } else if (typeof meta.entity === 'object') {
              entityName = meta.entity.offer_title || meta.entity.partner_name || meta.entity.title;
            }
          }
        }
        
        // Last resort: use entity_type#entity_id format
        if (!entityName || entityName.trim() === '') {
          if (row.entity_id) {
            entityName = `${row.entity_type || 'entity'}#${row.entity_id}`;
          }
        }

        // Generate description (same logic as dashboard endpoint)
        let description = '';
        const action = row.action || 'system_event';
        const actionLabel = action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        
        if (action === 'feature_toggle') {
          const isPromoted = meta.next?.is_promoted || meta.is_promoted;
          const wasPromoted = meta.previous?.is_promoted;
          if (isPromoted && !wasPromoted) {
            description = `${actorName} promoted offer "${entityName}"`;
          } else if (!isPromoted && wasPromoted) {
            description = `${actorName} removed offer "${entityName}" from trending`;
          } else {
            description = `${actorName} toggled feature for "${entityName}"`;
          }
        } else if (action === 'partner_approved' || action === 'partner_approval') {
          description = `${actorName} approved partner "${entityName}"`;
        } else if (action === 'partner_rejected' || action === 'partner_rejection') {
          description = `${actorName} rejected partner "${entityName}"`;
        } else if (action === 'offer_created') {
          description = `${actorName} created offer "${entityName}"`;
        } else if (action === 'offer_updated') {
          description = `${actorName} updated offer "${entityName}"`;
        } else if (action === 'user_created') {
          description = `${actorName} created user "${entityName}"`;
        } else {
          description = `${actorName} performed ${actionLabel} on ${entityName || row.entity_type || 'entity'}`;
        }

        return {
          type: row.action,
          entity: entityName || 'Unknown',
          meta: meta,
          actor: actorName, // Always a string
          actor_role: row.actor_role || 'system',
          description: description, // Add description field
          created_at: row.created_at
        };
      });
    } catch (auditError) {
      if (auditError.code !== '42P01') {
        log('⚠️ audit_log table unavailable, building synthetic activity feed');
      }

      const syntheticResult = await pool.query(
        `
        SELECT 'booking' AS type, booking_reference AS entity, CONCAT('₹', fiat_amount) AS meta, created_at
        FROM bookings
        ORDER BY created_at DESC
        LIMIT 20
        `
      );

      const offerResult = await pool.query(
        `
        SELECT 'deal' AS type, title AS entity, 
               CASE WHEN is_promoted THEN 'promoted' ELSE COALESCE(status, 'updated') END AS meta, 
               updated_at AS created_at
        FROM partner_offers
        ORDER BY updated_at DESC
        LIMIT 20
        `
      );

      activityRows = [...syntheticResult.rows, ...offerResult.rows]
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 40);
    }

    const filtered = normalizedType === 'all'
      ? activityRows
      : activityRows.filter((entry) => {
          if (normalizedType === 'users') return entry.type?.includes('user');
          if (normalizedType === 'partners') return entry.type?.includes('partner') || entry.type === 'deal';
          if (normalizedType === 'deals') return entry.type?.includes('deal');
          if (normalizedType === 'system') return entry.type?.includes('system');
          return true;
        });

    successResponse(res, 200, "Activity feed retrieved successfully", filtered.slice(0, 40));
  } catch (err) {
    logError("❌ Admin activity fetch error:", err);
    errorResponse(res, 500, "Failed to retrieve activity feed", err.message);
  }
});

// ============================================
// ADMIN ENDPOINTS - USER MANAGEMENT
// ============================================

// Get all users (admin only)
app.get("/api/v1/admin/users", authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const {
      limit = 20,
      offset = 0,
      search = '',
      role = 'all',
      status = 'all'
    } = req.query;

    const limitValue = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const offsetValue = Math.max(parseInt(offset, 10) || 0, 0);
    const searchTerm = search.trim().toLowerCase();
    const normalizedRole = role ? role.toLowerCase() : 'all';
    const normalizedStatus = status ? status.toLowerCase() : 'all';

    const buildQuery = (includeRoleJoin = true) => {
      const filters = [];
      const params = [];
      let paramIndex = 1;

      if (searchTerm) {
        filters.push(`(
          LOWER(u.first_name) LIKE $${paramIndex} OR
          LOWER(u.last_name) LIKE $${paramIndex} OR
          LOWER(u.email) LIKE $${paramIndex} OR
          REPLACE(u.phone_number, ' ', '') LIKE $${paramIndex}
        )`);
        params.push(`%${searchTerm}%`);
        paramIndex += 1;
      }

      if (normalizedStatus !== 'all') {
        filters.push(`u.is_active = $${paramIndex}`);
        params.push(normalizedStatus === 'active');
        paramIndex += 1;
      }

      if (normalizedRole !== 'all' && includeRoleJoin) {
        filters.push(`LOWER(r.role_name) = $${paramIndex}`);
        params.push(normalizedRole);
        paramIndex += 1;
      }

      const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
      const roleSelect = includeRoleJoin ? 'COALESCE(r.role_name, \'user\') AS role' : `'user' AS role`;
      const roleJoin = includeRoleJoin ? 'LEFT JOIN roles r ON u.role_id = r.id' : '';

      const dataQuery = `
        SELECT 
          u.id,
          u.email,
          u.first_name,
          u.last_name,
          u.phone_number,
          u.created_at,
          u.is_active,
          ${roleSelect}
        FROM users u
        ${roleJoin}
        ${whereClause}
        ORDER BY u.created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      const countQuery = `
        SELECT COUNT(*)::int AS total
        FROM users u
        ${roleJoin}
        ${whereClause}
      `;

      return { dataQuery, countQuery, params };
    };

    let includeRoleJoin = true;
    let queryBlueprint = buildQuery(includeRoleJoin);
    let dataResult;
    let countResult;

    try {
      dataResult = await pool.query(
        queryBlueprint.dataQuery,
        [...queryBlueprint.params, limitValue, offsetValue]
      );
      countResult = await pool.query(
        queryBlueprint.countQuery,
        queryBlueprint.params
      );
    } catch (roleError) {
      const errorMsg = roleError.message || '';
      const isMissingRoleColumn = roleError.code === '42703' ||
        errorMsg.toLowerCase().includes('role_id') ||
        errorMsg.toLowerCase().includes('does not exist');

      if (!isMissingRoleColumn) {
        throw roleError;
      }

      log('⚠️ role_id column not found, retrying user query without roles join');
      includeRoleJoin = false;
      queryBlueprint = buildQuery(includeRoleJoin);

      if (normalizedRole !== 'all' && normalizedRole !== 'user') {
        return successResponse(res, 200, 'Users retrieved successfully', {
          items: [],
          total: 0,
          limit: limitValue,
          offset: offsetValue
        });
      }

      dataResult = await pool.query(
        queryBlueprint.dataQuery,
        [...queryBlueprint.params, limitValue, offsetValue]
      );
      countResult = await pool.query(
        queryBlueprint.countQuery,
        queryBlueprint.params
      );
    }

    successResponse(res, 200, 'Users retrieved successfully', {
      items: dataResult.rows,
      total: countResult.rows[0]?.total || 0,
      limit: limitValue,
      offset: offsetValue
    });
  } catch (err) {
    logError("❌ Get users error:", err);
    errorResponse(res, 500, "Failed to retrieve users", err.message);
  }
});

// Get active sessions (admin only)
app.get("/api/v1/admin/sessions", authenticateToken, async (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;
    
    // Query user_sessions table if it exists, otherwise return empty array
    let sessions = [];
    try {
      const result = await pool.query(
        `SELECT 
          id,
          user_id,
          access_token as token,
          expires_at,
          device_id,
          device_name,
          ip_address,
          created_at
         FROM user_sessions
         WHERE expires_at > NOW()
         ORDER BY created_at DESC
         LIMIT $1 OFFSET $2`,
        [parseInt(limit), parseInt(offset)]
      );
      sessions = result.rows;
    } catch (sessionError) {
      // If user_sessions table doesn't exist, return empty array
      if (sessionError.code === '42P01') {
        log('⚠️ user_sessions table not found, returning empty sessions list');
        sessions = [];
      } else {
        throw sessionError;
      }
    }

    successResponse(res, 200, 'Sessions retrieved successfully', sessions);
  } catch (err) {
    logError("❌ Get sessions error:", err);
    errorResponse(res, 500, "Failed to retrieve sessions", err.message);
  }
});

// ============================================
// ADMIN ENDPOINTS - ARCHIVING & ANALYTICS
// ============================================

// Manual archive trigger (for testing)
app.post("/api/v1/admin/archive-expired", authenticateToken, async (req, res) => {
  try {
    // Check super admin role
    const { requireRole } = require('./middleware/rbac');
    // This should be wrapped with requireRole('super_admin') but for now just authenticate
    await archiveExpiredItems();
    successResponse(res, 200, "Archiving process completed");
  } catch (err) {
    logError("❌ Manual archiving error:", err);
    errorResponse(res, 500, "Failed to archive expired items");
  }
});

// Get archived items
app.get("/api/v1/admin/archives", authenticateToken, async (req, res) => {
  try {
    const { type, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT a.*, 
        e.title as event_title, e.start_time, e.end_time,
        po.title as offer_title, po.start_date, po.end_date,
        u.first_name || ' ' || u.last_name as archived_by_name
      FROM archives a
      LEFT JOIN events e ON a.event_id = e.id
      LEFT JOIN partner_offers po ON a.offer_id = po.id
      LEFT JOIN users u ON a.archived_by = u.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;

    if (type === 'events') {
      query += ` AND a.event_id IS NOT NULL`;
    } else if (type === 'offers') {
      query += ` AND a.offer_id IS NOT NULL`;
    }

    query += ` ORDER BY a.archived_on DESC LIMIT $${++paramCount} OFFSET $${++paramCount}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);
    successResponse(res, 200, "Archived items retrieved successfully", result.rows);
  } catch (err) {
    logError("❌ Archives fetch error:", err);
    errorResponse(res, 500, "Failed to fetch archives");
  }
});

// Reactivate archived item
app.post("/api/v1/admin/archives/:id/reactivate", authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    const archiveResult = await client.query(
      'SELECT * FROM archives WHERE id = $1 AND can_reactivate = true',
      [id]
    );

    if (archiveResult.rows.length === 0) {
      return errorResponse(res, 404, "Archive not found or cannot be reactivated");
    }

    const archive = archiveResult.rows[0];

    await client.query('BEGIN');

    if (archive.event_id) {
      await client.query(
        "UPDATE events SET status = 'active' WHERE id = $1",
        [archive.event_id]
      );
    }

    if (archive.offer_id) {
      await client.query(
        'UPDATE partner_offers SET is_active = true WHERE id = $1',
        [archive.offer_id]
      );
    }

    await client.query(
      'UPDATE archives SET reactivated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
    );

    await client.query('COMMIT');

    successResponse(res, 200, "Item reactivated successfully");
  } catch (err) {
    await client.query('ROLLBACK');
    logError("❌ Reactivation error:", err);
    errorResponse(res, 500, "Failed to reactivate item");
  } finally {
    client.release();
  }
});

// ============================================
// REVENUE ANALYTICS
// ============================================

// Partner revenue analytics
app.get("/api/v1/partners/:id/analytics", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { period = '30' } = req.query; // days window as string

    const daysWindow = parseInt(period, 10);
    const startDate = Number.isNaN(daysWindow) ? new Date(new Date().setMonth(new Date().getMonth() - 1)) : new Date(Date.now() - daysWindow * 24 * 60 * 60 * 1000);

    const summaryResult = await pool.query(
      `SELECT 
        COUNT(*)::int AS total_bookings,
        COALESCE(SUM(fiat_amount), 0)::numeric AS total_revenue,
        COALESCE(AVG(fiat_amount), 0)::numeric AS avg_order_value,
        COUNT(DISTINCT user_id)::int AS total_customers,
        COUNT(CASE WHEN status = 'redeemed' THEN 1 END)::int AS redeemed_count,
        COUNT(CASE WHEN status = 'completed' THEN 1 END)::int AS completed_count
       FROM bookings
       WHERE partner_id = $1 AND created_at >= $2`,
      [id, startDate]
    );

    const repeatResult = await pool.query(
      `SELECT COUNT(*)::int AS repeat_customers
       FROM (
         SELECT user_id
         FROM bookings
         WHERE partner_id = $1 AND created_at >= $2
         GROUP BY user_id
         HAVING COUNT(*) > 1
       ) t`,
      [id, startDate]
    );

    const trendsResult = await pool.query(
      `SELECT 
        DATE_TRUNC('day', created_at) AS period,
        COUNT(*)::int AS bookings,
        COALESCE(SUM(fiat_amount), 0)::numeric AS revenue
       FROM bookings
       WHERE partner_id = $1 AND created_at >= $2
       GROUP BY period
       ORDER BY period ASC`,
      [id, startDate]
    );

    const topOffersResult = await pool.query(
      `SELECT 
        po.id,
        po.title,
        po.service_type,
        COUNT(b.id)::int AS booking_count,
        COALESCE(SUM(b.fiat_amount), 0)::numeric AS revenue
       FROM bookings b
       JOIN partner_offers po ON b.deal_id = po.id
       WHERE po.partner_id = $1 AND b.created_at >= $2
       GROUP BY po.id, po.title, po.service_type
       ORDER BY revenue DESC
       LIMIT 5`,
      [id, startDate]
    );

    const summary = summaryResult.rows[0] || {};
    const repeatCustomers = repeatResult.rows[0]?.repeat_customers || 0;
    const completionRate = summary.total_bookings
      ? Math.round((summary.completed_count / summary.total_bookings) * 100)
      : 0;
    const repeatRate = summary.total_customers
      ? Math.round((repeatCustomers / summary.total_customers) * 100)
      : 0;

    successResponse(res, 200, "Analytics retrieved successfully", {
      summary: {
        totalBookings: summary.total_bookings || 0,
        totalRevenue: parseFloat(summary.total_revenue || 0),
        avgOrderValue: parseFloat(summary.avg_order_value || 0),
        totalCustomers: summary.total_customers || 0,
        repeatCustomersPercent: repeatRate,
        completionRatePercent: completionRate
      },
      trends: trendsResult.rows.map(row => ({
        period: row.period,
        bookings: row.bookings,
        revenue: parseFloat(row.revenue || 0)
      })),
      top_offers: topOffersResult.rows.map(row => ({
        id: row.id,
        title: row.title,
        service_type: row.service_type,
        booking_count: row.booking_count,
        revenue: parseFloat(row.revenue || 0)
      })),
      period: period
    });
  } catch (err) {
    logError("❌ Analytics fetch error:", err);
    errorResponse(res, 500, "Failed to fetch analytics");
  }
});

// Super admin global analytics
app.get("/api/v1/admin/analytics", authenticateToken, async (req, res) => {
  try {
    const { period = 'month' } = req.query;

    const now = new Date();
    let startDate = new Date();
    
    switch (period) {
      case 'day':
        startDate.setDate(now.getDate() - 1);
        break;
      case 'week':
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(now.getMonth() - 1);
        break;
      case 'year':
        startDate.setFullYear(now.getFullYear() - 1);
        break;
    }

    // Get total users count (all time)
    const totalUsersResult = await pool.query(
      `SELECT COUNT(*) as count FROM users`
    );
    const totalUsers = parseInt(totalUsersResult.rows[0]?.count || 0);

    // Get new users today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const newUsersTodayResult = await pool.query(
      `SELECT COUNT(*) as count FROM users WHERE created_at >= $1`,
      [todayStart]
    );
    const newUsersToday = parseInt(newUsersTodayResult.rows[0]?.count || 0);

    // Get active sessions count
    let activeSessions = 0;
    try {
      const sessionsResult = await pool.query(
        `SELECT COUNT(*) as count FROM user_sessions WHERE expires_at > NOW()`
      );
      activeSessions = parseInt(sessionsResult.rows[0]?.count || 0);
    } catch (sessionsError) {
      // user_sessions table might not exist, that's okay
      if (sessionsError.code !== '42P01') {
        log('⚠️ Error counting sessions:', sessionsError.message);
      }
    }

    // Get total partners count
    const totalPartnersResult = await pool.query(
      `SELECT COUNT(*) as count FROM partners`
    );
    const totalPartners = parseInt(totalPartnersResult.rows[0]?.count || 0);

    // Get pending partners count
    const pendingPartnersResult = await pool.query(
      `SELECT COUNT(*) as count FROM partners WHERE is_active = false OR status = 'pending'`
    );
    const pendingPartners = parseInt(pendingPartnersResult.rows[0]?.count || 0);

    // Get total deals count
    let totalDeals = 0;
    let activeDeals = 0;
    let featuredDeals = 0;
    try {
      const totalDealsResult = await pool.query(
        `SELECT COUNT(*) as count FROM partner_offers`
      );
      totalDeals = parseInt(totalDealsResult.rows[0]?.count || 0);

      const activeDealsResult = await pool.query(
        `SELECT COUNT(*) as count FROM partner_offers 
         WHERE is_active = true AND (end_date IS NULL OR end_date > NOW())`
      );
      activeDeals = parseInt(activeDealsResult.rows[0]?.count || 0);

      const featuredDealsResult = await pool.query(
        `SELECT COUNT(*) as count FROM partner_offers WHERE is_promoted = true`
      );
      featuredDeals = parseInt(featuredDealsResult.rows[0]?.count || 0);
    } catch (dealsError) {
      // partner_offers table might not exist
      if (dealsError.code !== '42P01') {
        log('⚠️ Error counting deals:', dealsError.message);
      }
    }

    // Global summary from bookings
    let globalResult;
    try {
      globalResult = await pool.query(
        `SELECT 
          COUNT(DISTINCT b.user_id) as total_users,
          COUNT(DISTINCT b.id) as total_bookings,
          SUM(b.amount) as total_revenue,
          SUM(b.commission_percentage * b.amount / 100) as total_commission,
          SUM(b.partner_earning) as total_partner_earnings,
          COUNT(DISTINCT v.id) as vouchers_generated,
          COUNT(CASE WHEN v.status = 'redeemed' THEN 1 END) as vouchers_redeemed,
          SUM(lp.points_earned) as total_loyalty_points
         FROM bookings b
         LEFT JOIN vouchers v ON v.booking_id = b.id
         LEFT JOIN loyalty_points lp ON lp.booking_id = b.id
         WHERE b.booking_date >= $1`,
        [startDate]
      );
    } catch (bookingsError) {
      // bookings table might not exist
      if (bookingsError.code === '42P01') {
        globalResult = { rows: [{
          total_users: 0,
          total_bookings: 0,
          total_revenue: 0,
          total_commission: 0,
          total_partner_earnings: 0,
          vouchers_generated: 0,
          vouchers_redeemed: 0,
          total_loyalty_points: 0
        }] };
      } else {
        throw bookingsError;
      }
    }

    // Commission breakdown by partner
    let commissionResult = { rows: [] };
    try {
      commissionResult = await pool.query(
        `SELECT 
          p.id, p.name,
          COUNT(b.id) as bookings,
          SUM(b.amount) as revenue,
          SUM(b.commission_percentage * b.amount / 100) as commission,
          SUM(b.partner_earning) as partner_earnings
         FROM bookings b
         LEFT JOIN events e ON b.event_id = e.id
         LEFT JOIN partner_offers po ON b.offer_id = po.id
         LEFT JOIN partners p ON (e.venue_id = p.id OR po.partner_id = p.id)
         WHERE b.booking_date >= $1 AND p.id IS NOT NULL
         GROUP BY p.id, p.name
         ORDER BY commission DESC`,
        [startDate]
      );
    } catch (commissionError) {
      // bookings table might not exist
      if (commissionError.code !== '42P01') {
        log('⚠️ Error fetching commission breakdown:', commissionError.message);
      }
    }

    successResponse(res, 200, "Global analytics retrieved successfully", {
      global: {
        ...globalResult.rows[0],
        total_users_all_time: totalUsers,
        new_users_today: newUsersToday,
        active_sessions: activeSessions,
        total_partners: totalPartners,
        pending_partners: pendingPartners,
        total_deals: totalDeals,
        active_deals: activeDeals,
        featured_deals: featuredDeals
      },
      commission_breakdown: commissionResult.rows,
      period: period
    });
  } catch (err) {
    logError("❌ Global analytics fetch error:", err);
    errorResponse(res, 500, "Failed to fetch global analytics", err.message);
  }
});

// Get user loyalty balance
app.get("/api/v1/users/:id/loyalty", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT 
        COALESCE(MAX(points_balance), 0) as current_balance,
        SUM(CASE WHEN transaction_type = 'earned' THEN points_earned ELSE 0 END) as total_earned,
        SUM(CASE WHEN transaction_type = 'redeemed' THEN ABS(points_earned) ELSE 0 END) as total_redeemed
       FROM loyalty_points
       WHERE user_id = $1`,
      [id]
    );

    const transactions = await pool.query(
      `SELECT * FROM loyalty_points 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT 50`,
      [id]
    );

    successResponse(res, 200, "Loyalty data retrieved successfully", {
      balance: result.rows[0],
      recent_transactions: transactions.rows
    });
  } catch (err) {
    logError("❌ Loyalty fetch error:", err);
    errorResponse(res, 500, "Failed to fetch loyalty data");
  }
});

// Kiwity integration endpoint
app.get("/api/v1/external/kiwity/loyalty/:user_id", authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.params;

    const result = await pool.query(
      `SELECT 
        COALESCE(MAX(points_balance), 0) as loyalty_points,
        SUM(CASE WHEN transaction_type = 'earned' THEN points_earned ELSE 0 END) as total_points_earned
       FROM loyalty_points
       WHERE user_id = $1`,
      [user_id]
    );

    successResponse(res, 200, "Loyalty data for Kiwity sync", result.rows[0] || { loyalty_points: 0, total_points_earned: 0 });
  } catch (err) {
    logError("❌ Kiwity sync error:", err);
    errorResponse(res, 500, "Failed to sync loyalty data");
  }
});

// System settings management
app.get("/api/v1/admin/settings", authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT setting_key, setting_value FROM system_settings');
    const settingsMap = result.rows.reduce((acc, row) => {
      acc[row.setting_key] = row.setting_value;
      return acc;
    }, {});

    const parseNumber = (value, fallback = 0) => {
      const parsed = parseFloat(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    };

    const parseBoolean = (value, fallback = false) => {
      if (value === undefined || value === null) return fallback;
      if (typeof value === 'boolean') return value;
      return ['true', '1', 'yes', 'on'].includes(String(value).toLowerCase());
    };

    successResponse(res, 200, "Settings retrieved successfully", {
      platform_name: settingsMap.platform_name || 'Elizian',
      default_commission: parseNumber(settingsMap.default_commission, 10),
      max_promoted: parseNumber(settingsMap.max_promoted_deals, 12),
      deal_approval_required: parseBoolean(settingsMap.deal_approval_required, true),
      partner_auto_approval: parseBoolean(settingsMap.partner_auto_approval, false),
      loyalty_points: parseNumber(settingsMap.loyalty_points_per_txn, 1),
      loyalty_rupees: parseNumber(settingsMap.loyalty_rupees_per_point, 100)
    });
  } catch (err) {
    logError("❌ Settings fetch error:", err);
    errorResponse(res, 500, "Failed to fetch settings");
  }
});
app.put("/api/v1/admin/settings", authenticateToken, requireSuperAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      platform_name,
      default_commission,
      max_promoted,
      deal_approval_required,
      partner_auto_approval,
      loyalty_points,
      loyalty_rupees
    } = req.body || {};

    const updates = [
      { key: 'platform_name', value: platform_name },
      { key: 'default_commission', value: default_commission },
      { key: 'max_promoted_deals', value: max_promoted },
      { key: 'deal_approval_required', value: deal_approval_required },
      { key: 'partner_auto_approval', value: partner_auto_approval },
      { key: 'loyalty_points_per_txn', value: loyalty_points },
      { key: 'loyalty_rupees_per_point', value: loyalty_rupees }
    ].filter((entry) => entry.value !== undefined && entry.value !== null);

    await client.query('BEGIN');

    for (const setting of updates) {
      await client.query(
        `INSERT INTO system_settings (setting_key, setting_value, updated_by, updated_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
         ON CONFLICT (setting_key)
         DO UPDATE SET setting_value = $2, updated_by = $3, updated_at = CURRENT_TIMESTAMP`,
        [setting.key, String(setting.value), req.userId]
      );
    }

    await client.query('COMMIT');
    successResponse(res, 200, "Settings updated successfully");
  } catch (err) {
    await client.query('ROLLBACK');
    logError("❌ Settings update error:", err);
    errorResponse(res, 500, "Failed to update settings");
  } finally {
    client.release();
  }
});

// Legacy single-setting update endpoint (kept for backward compatibility)
app.put("/api/v1/admin/settings/:key", authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    await pool.query(
      `INSERT INTO system_settings (setting_key, setting_value, updated_by, updated_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (setting_key)
       DO UPDATE SET setting_value = $2, updated_by = $3, updated_at = CURRENT_TIMESTAMP`,
      [key, String(value), req.userId]
    );

    successResponse(res, 200, "Setting updated successfully");
  } catch (err) {
    logError("❌ Settings update error:", err);
    errorResponse(res, 500, "Failed to update setting");
  }
});

// Keep process alive
setInterval(() => {
  // Heartbeat to keep process alive
  if (process.uptime() > 0) {
    // Process is healthy
  }
}, 30000); // Every 30 seconds

// Export the Express app for Vercel serverless
module.exports = app;