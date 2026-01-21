const partnerRepository = require('../repositories/partnerRepository');
const partnerAuthRepository = require('../repositories/partnerAuthRepository');
const { createToken } = require('../../utils/jwt');
const { AppError } = require('../../utils/response');
const { logError } = require('../../utils/logger');
const { getPool } = require('../config/db');
const { writeAudit } = require('../utils/audit');
const {uploadToS3} = require('../../utils/s3Bucket')

const pool = getPool();

// List partners
async function listPartners(filters = {}) {
  return await partnerRepository.listPartners(filters);
}

// Get partner by ID
async function getPartnerById(partnerId) {
  const partner = await partnerRepository.getPartnerById(partnerId);
  if (!partner) {
    throw new AppError(404, "Partner not found");
  }
  return partner;
}

// Create partner (admin only)
async function createPartner(partnerData, actorUserId, actorRole) {
  // Check if partner with email already exists
  const existing = await partnerRepository.getPartnerByEmail(partnerData.email);
  if (existing) {
    throw new AppError(400, "Partner with this email already exists");
  }

  const normalizedIsActive = Boolean(partnerData.is_active);
  const partner = await partnerRepository.createPartner({
    ...partnerData,
    is_active: normalizedIsActive,
    status: normalizedIsActive ? 'active' : 'pending'
  });
  
  // Log audit trail
  await writeAudit(actorUserId, actorRole, 'partner_create', 'partner', partner.id, {
    partner_name: partnerData.name,
    category_id: partnerData.category_id,
    is_active: partnerData.is_active
  });

  return partner;
}

// Update partner
async function updatePartner(partnerId, updates) {
  const partner = await partnerRepository.getPartnerById(partnerId);
  if (!partner) {
    throw new AppError(404, "Partner not found");
  }

  return await partnerRepository.updatePartner(partnerId, updates);
}

// Delete partner
async function deletePartner(partnerId) {
  const partner = await partnerRepository.getPartnerById(partnerId);
  if (!partner) {
    throw new AppError(404, "Partner not found");
  }

  await partnerRepository.deletePartner(partnerId);
  return { deleted: true, id: partnerId };
}

// Partner login
async function loginPartner(email, password) {
  if (!email || !password) {
    throw new AppError(400, "Email and password are required");
  }

  // Normalize email (lowercase)
  const normalizedEmail = email.toLowerCase().trim();

  const partner = await partnerRepository.getPartnerByEmail(normalizedEmail);
  
  // Don't reveal if partner exists or is inactive - use generic error
  if (!partner) {
    logError(`[Partner Login] Failed login attempt for: ${normalizedEmail}`);
    throw new AppError(401, "Invalid email or password");
  }

  if (!partner.is_active) {
    logError(`[Partner Login] Inactive account login attempt: ${partner.id} (${normalizedEmail})`);
    throw new AppError(401, "Invalid email or password");
  }

  const auth = await partnerAuthRepository.getPartnerAuth(partner.id);
  const isValidPassword = auth ? await partnerAuthRepository.comparePassword(password, auth.password_hash) : false;
  
  if (!auth || !isValidPassword) {
    logError(`[Partner Login] Invalid credentials for partner: ${partner.id} (${normalizedEmail})`);
    throw new AppError(401, "Invalid email or password");
  }

  // Generate JWT token
  const token = createToken({
    partnerId: partner.id,
    email: partner.email,
    type: 'partner'
  }, { expiresIn: '24h' });

  return {
    token,
    partner: {
      id: partner.id,
      name: partner.name,
      email: partner.email,
      category_id: partner.category_id
    }
  };
}

// Partner registration
async function registerPartner(registrationData) {
  const {
    name,
    email,
    password,
    category_id,
    address,
    phone_number,
    partner_discount_percentage = 10
  } = registrationData;

  if (!name || !email || !password || !category_id) {
    throw new AppError(400, "Name, email, password, and category_id are required");
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new AppError(400, "Invalid email format");
  }

  // Validate password strength
  const PASSWORD_MIN_LENGTH = 8;
  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    throw new AppError(400, "Password must be at least 8 characters long");
  }

  // Check if partner already exists
  const existingPartner = await partnerRepository.getPartnerByEmail(email);
  if (existingPartner) {
    throw new AppError(400, "Partner with this email already exists");
  }

  // Hash password
  const passwordHash = await partnerAuthRepository.hashPassword(password);

  // Start transaction - use client for all queries
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create partner using client (not pool)
    // New partners start with status='pending' and is_active=false
    const partnerResult = await client.query(
      `INSERT INTO partners (name, email, category_id, address, phone_number, 
       partner_discount_percentage, is_active, status) 
       VALUES ($1, $2, $3, $4, $5, $6, false, 'pending') 
       RETURNING *`,
      [name, email, category_id, address, phone_number, partner_discount_percentage]
    );
    const partner = partnerResult.rows[0];

    // Ensure partner_auth table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS partner_auth (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create auth record using client
    await client.query(
      `INSERT INTO partner_auth (partner_id, password_hash)
       VALUES ($1, $2)
       RETURNING *`,
      [partner.id, passwordHash]
    );

    await client.query('COMMIT');

    return {
      pendingApproval: true,
      partner: {
        id: partner.id,
        name: partner.name,
        email: partner.email
      }
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Get partner dashboard
async function getPartnerDashboard(partnerId) {
  const stats = await partnerRepository.getPartnerDashboardStats(partnerId);
  if (!stats) {
    throw new AppError(404, "Partner not found");
  }
  return stats;
}

// Get partner analytics
async function getPartnerAnalytics(partnerId, period = '30') {
  const daysWindow = parseInt(period, 10) || 30;
  return await partnerRepository.getPartnerAnalytics(partnerId, daysWindow);
}

// Get partner rewards analytics
async function getPartnerRewardsAnalytics(partnerId) {
  const { getPool } = require('../config/db');
  const pool = getPool();
  
  try {
    // Get all bookings for this partner with rewards data
    const bookingsResult = await pool.query(
      `SELECT 
        b.id,
        b.ezt_earned,
        b.points_earned,
        b.user_tier_at_booking,
        b.created_at,
        u.first_name || ' ' || u.last_name as customer_name,
        u.phone_number as customer_phone,
        u.current_tier_name as customer_tier
      FROM bookings b
      INNER JOIN partner_offers po ON b.deal_id = po.id
      LEFT JOIN users u ON b.user_id = u.id
      WHERE po.partner_id = $1
      ORDER BY b.created_at DESC
      LIMIT 100`,
      [partnerId]
    );
    
    const bookings = bookingsResult.rows;
    
    // Calculate totals
    const totalEztDistributed = bookings.reduce((sum, b) => sum + parseFloat(b.ezt_earned || 0), 0);
    const totalLoyaltyPoints = bookings.reduce((sum, b) => sum + parseFloat(b.points_earned || 0), 0);
    
    // Get customer tiers distribution
    const customerTiers = {};
    bookings.forEach(booking => {
      const tier = booking.customer_tier || booking.user_tier_at_booking || 'Ather';
      customerTiers[tier] = (customerTiers[tier] || 0) + 1;
    });
    
    // Calculate average tier (weighted)
    const tierValues = { 'Ather': 1, 'Nova': 2, 'Luminar': 3, 'Valiant': 4, 'Echelon': 5 };
    let avgTier = 'N/A';
    if (Object.keys(customerTiers).length > 0) {
      const totalCustomers = Object.values(customerTiers).reduce((a, b) => a + b, 0);
      const avgTierValue = Object.entries(customerTiers).reduce((sum, [tier, count]) => {
        return sum + (tierValues[tier] || 1) * count;
      }, 0) / totalCustomers;
      const tierIndex = Math.round(avgTierValue) - 1;
      avgTier = Object.keys(tierValues)[Math.max(0, Math.min(tierIndex, 4))] || 'Ather';
    }
    
    // Recent bookings with rewards (last 10)
    const recentBookings = bookings.slice(0, 10).map(b => ({
      id: b.id,
      customer_name: b.customer_name || 'Guest',
      customer_phone: b.customer_phone || null,
      customer_tier: b.customer_tier || b.user_tier_at_booking || 'Ather',
      ezt_earned: parseFloat(b.ezt_earned || 0),
      loyalty_points_earned: parseFloat(b.points_earned || 0),
      created_at: b.created_at
    }));
    
    return {
      total_ezt_distributed: totalEztDistributed,
      total_loyalty_points: totalLoyaltyPoints,
      avg_customer_tier: avgTier,
      customer_tiers_distribution: customerTiers,
      recent_bookings: recentBookings
    };
  } catch (error) {
    logError('Error in getPartnerRewardsAnalytics:', error);
    throw error;
  }
}

// Update partner menu images (scrollable menu viewer)
async function updatePartnerMenuImages(partnerId, menuImages = []) {
  const partner = await partnerRepository.getPartnerById(partnerId);
  if (!partner) {
    throw new AppError(404, "Partner not found");
  }
  const normalized = Array.isArray(menuImages) ? menuImages : [];
  const imageS3Urls = await uploadToS3(normalized)
  const updated = await partnerRepository.updatePartnerMenuImages(partnerId, imageS3Urls);
  return parseMenuImages(updated);
}

async function getPartnerWithMenuImages(partnerId) {
  const partner = await partnerRepository.getPartnerWithMenuImages(partnerId);
  if (!partner) {
    throw new AppError(404, "Partner not found");
  }
  return parseMenuImages(partner);
}

function parseMenuImages(partner) {
  if (!partner) return partner;
  let images = partner.menu_images || [];
  if (typeof images === 'string') {
    try {
      images = JSON.parse(images);
    } catch {
      images = [];
    }
  }
  if (!Array.isArray(images)) {
    images = [];
  }
  return { ...partner, menu_images: images };
}

module.exports = {
  listPartners,
  getPartnerById,
  createPartner,
  updatePartner,
  deletePartner,
  loginPartner,
  registerPartner,
  getPartnerDashboard,
  getPartnerAnalytics,
  getPartnerRewardsAnalytics,
  updatePartnerMenuImages,
  getPartnerWithMenuImages
};

