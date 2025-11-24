const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const voucherRepository = require('../repositories/voucherRepository');
const bookingRepository = require('../repositories/bookingRepository');
const settingsRepository = require('../repositories/settingsRepository');
const { AppError } = require('../../utils/response');
const { logError } = require('../../utils/logger');
const { getPool } = require('../config/db');

const pool = getPool();

/**
 * Generate a unique voucher code with collision detection
 * @returns {Promise<string>} Unique voucher code
 */
async function generateUniqueVoucherCode() {
  const MAX_RETRIES = 5;
  
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // Generate code: VCH-YYYYMMDD-RANDOM8
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomPart = Math.random().toString(36).substring(2, 10).toUpperCase();
    const code = `VCH-${datePart}-${randomPart}`;
    
    // Check if code already exists
    const existing = await voucherRepository.getVoucherByCode(code);
    
    if (!existing) {
      return code;
    }
    
    // Collision detected, retry with increased randomness
    logError(`⚠️ Voucher code collision detected on attempt ${attempt + 1}: ${code}`);
  }
  
  // If all retries fail, use UUID as fallback
  const { v4: uuidv4 } = require('uuid');
  const fallbackCode = `VCH-${uuidv4().split('-')[0].toUpperCase()}`;
  logError(`⚠️ Using fallback UUID-based voucher code: ${fallbackCode}`);
  return fallbackCode;
}

// Generate QR code for voucher
async function generateQRCode(voucherData) {
  try {
    const qrPayload = JSON.stringify({
      voucher_code: voucherData.voucher_code,
      booking_id: voucherData.booking_id,
      partner_id: voucherData.partner_id,
      amount: voucherData.amount,
      created_at: voucherData.created_at
    });
    
    // Always generate data URL (works everywhere)
    const qrDataUrl = await QRCode.toDataURL(qrPayload, {
      errorCorrectionLevel: 'H',
      width: 400,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    
    // On Vercel or serverless, only use data URL
    if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
      return { 
        qr_code_url: null, 
        qr_code_data: qrDataUrl 
      };
    }
    
    // On local/traditional hosting, also save file
    try {
      const uploadsDir = path.join(__dirname, '..', '..', 'uploads', 'vouchers');
      fs.mkdirSync(uploadsDir, { recursive: true });
      
      const filename = `qr_${voucherData.voucher_code}.png`;
      const qrImagePath = path.join(uploadsDir, filename);
      
      await QRCode.toFile(qrImagePath, qrPayload, {
        errorCorrectionLevel: 'H',
        type: 'png',
        width: 400,
        margin: 2
      });
      
      const qr_code_url = `/uploads/vouchers/${filename}`;
      
      return { 
        qr_code_url, 
        qr_code_data: qrDataUrl // Store both for redundancy
      };
    } catch (fileError) {
      // File creation failed, fall back to data URL only
      logError('⚠️ QR code file creation failed, using data URL only:', fileError);
      return { 
        qr_code_url: null, 
        qr_code_data: qrDataUrl 
      };
    }
  } catch (err) {
    logError('❌ QR code generation failed:', err);
    throw new AppError(500, 'Failed to generate QR code');
  }
}

// Create voucher for a booking
// Uses transaction to ensure atomicity and prevent race conditions
async function createVoucherForBooking(bookingId, userId) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Verify booking ownership and get details (with row lock)
    const booking = await voucherRepository.getBookingForVoucher(bookingId, userId, client);

    if (!booking) {
      await client.query('ROLLBACK');
      throw new AppError(
        404, 
        "Booking not found or you don't have permission to access it."
      );
    }
    
    // Check validation errors from repository
    if (!booking.can_create_voucher) {
      await client.query('ROLLBACK');
      const errorMsg = booking.validation_errors?.join('; ') || 
        "Booking is not eligible for voucher creation.";
      throw new AppError(400, errorMsg);
    }

    // Check if voucher already exists (from repository query)
    if (booking.has_existing_voucher) {
      const existingVoucher = await voucherRepository.getVoucherByBookingId(bookingId);
      if (existingVoucher) {
        await client.query('COMMIT');
        logError('✅ Returning existing voucher:', {
          voucher_code: existingVoucher.code,
          booking_id: bookingId
        });
        return existingVoucher;
      }
    }

    // Amount validation already done in repository, but double-check
    if (!booking.amount || booking.amount <= 0) {
      await client.query('ROLLBACK');
      throw new AppError(
        400,
        "Cannot create voucher: booking has no value. Amount must be greater than zero."
      );
    }

  // Determine partner_id with clear precedence and validation
  let partner_id = null;
  let partner_source = '';

  // Priority 1: Direct booking partner_id (most reliable)
  if (booking.partner_id) {
    partner_id = booking.partner_id;
    partner_source = 'direct';
  }
  // Priority 2: Partner from offer (for deal bookings)
  else if (booking.deal_id && booking.partner_id_from_offer) {
    partner_id = booking.partner_id_from_offer;
    partner_source = 'offer';
  }
  // Priority 3: Partner from event (for event bookings)
  else if (booking.event_id && booking.partner_id_from_event) {
    partner_id = booking.partner_id_from_event;
    partner_source = 'event';
  }

  if (!partner_id) {
    logError('Voucher creation failed - no partner_id:', {
      booking_id: bookingId,
      has_partner_id: !!booking.partner_id,
      has_event_id: !!booking.event_id,
      has_deal_id: !!booking.deal_id,
      has_partner_from_event: !!booking.partner_id_from_event,
      has_partner_from_offer: !!booking.partner_id_from_offer
    });
    throw new AppError(400, "Cannot create voucher: booking has no associated partner. Please contact support.");
  }

  // Validate that partner exists and is active
  const partnerCheck = await pool.query(
    'SELECT id, name, is_active FROM partners WHERE id = $1',
    [partner_id]
  );

  if (partnerCheck.rowCount === 0) {
    throw new AppError(400, `Cannot create voucher: partner (${partner_id}) not found`);
  }

  if (!partnerCheck.rows[0].is_active) {
    throw new AppError(400, `Cannot create voucher: partner "${partnerCheck.rows[0].name}" is not active`);
  }

  logError('✅ Partner validated for voucher:', {
    partner_id,
    source: partner_source,
    partner_name: partnerCheck.rows[0].name
  });

  logError('✅ Creating new voucher for booking:', {
    booking_id: bookingId,
    user_id: userId,
    amount: booking.amount
  });

  // Generate unique voucher code
  const voucherCode = await generateUniqueVoucherCode();

  // Get voucher expiry from settings
  const expiryDays = parseInt(await settingsRepository.getSystemSetting('voucher_expiry_days') || 30, 10);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiryDays);

  // Generate QR code data
  const qrData = {
    voucher_code: voucherCode,
    booking_id: bookingId,
    event_id: booking.event_id || null,
    deal_id: booking.deal_id || null,
    partner_id: partner_id,
    user_id: userId,
    amount: booking.amount,
    created_at: new Date().toISOString()
  };

  // Generate QR code
  const { qr_code_url, qr_code_data } = await generateQRCode(qrData);

    // Create voucher (using transaction client for atomicity)
    // The createVoucher function will handle ON CONFLICT if another request created it concurrently
    const voucher = await voucherRepository.createVoucher({
      booking_id: bookingId,
      event_id: booking.event_id || null,
      partner_id: partner_id,
      code: voucherCode,
      qr_code_url,
      qr_code_data,
      status: 'active',
      expires_at: expiresAt
    }, client); // Pass client for transaction

    // If voucher creation returned null (shouldn't happen with ON CONFLICT, but safety check)
    if (!voucher) {
      // Another request created it - fetch existing
      const existingVoucher = await voucherRepository.getVoucherByBookingId(bookingId);
      if (existingVoucher) {
        await client.query('COMMIT');
        logError('✅ Concurrent request created voucher, returning existing:', {
          voucher_code: existingVoucher.code,
          booking_id: bookingId
        });
        return existingVoucher;
      }
      await client.query('ROLLBACK');
      throw new AppError(500, 'Failed to create voucher. Please try again.');
    }

    await client.query('COMMIT');
    
    logError('✅ Voucher created successfully:', {
      voucher_code: voucher.code,
      booking_id: bookingId,
      partner_id: partner_id
    });

    return voucher;
    
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      logError('❌ CRITICAL: Rollback failed:', rollbackErr);
    }
    
    // Re-throw AppErrors
    if (err instanceof AppError) {
      throw err;
    }
    
    // Wrap unknown errors
    logError('❌ Voucher creation error:', {
      error: err.message,
      code: err.code,
      bookingId,
      userId
    });
    throw new AppError(500, 'Voucher creation failed. Please try again.');
    
  } finally {
    try {
      client.release();
    } catch (releaseErr) {
      logError('❌ Failed to release database client:', releaseErr);
    }
  }
}

// Redeem voucher
async function redeemVoucher(code, partnerId) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Lock the voucher row for update (prevents race conditions)
    const voucherResult = await client.query(
      `SELECT v.*, 
              b.user_id,
              COALESCE(b.total_price, b.fiat_amount, 0) as amount,
              b.deal_id,
              b.status as booking_status,
              e.title as event_title,
              po.title as offer_title,
              NOW() as current_time
       FROM vouchers v
       JOIN bookings b ON v.booking_id = b.id
       LEFT JOIN events e ON v.event_id = e.id
       LEFT JOIN partner_offers po ON b.deal_id = po.id
       WHERE v.code = $1
       FOR UPDATE OF v`, // Lock voucher row
      [code]
    );
    
    if (voucherResult.rowCount === 0) {
      await client.query('ROLLBACK');
      throw new AppError(404, "Voucher not found");
    }
    
    const voucher = voucherResult.rows[0];
    
    // Verify voucher belongs to this partner
    if (voucher.partner_id !== partnerId) {
      await client.query('ROLLBACK');
      throw new AppError(403, "This voucher does not belong to your partner account");
    }
    
    // Check voucher status
    if (voucher.status === 'redeemed') {
      await client.query('ROLLBACK');
      throw new AppError(400, "Voucher has already been redeemed");
    }
    
    if (voucher.status === 'expired') {
      await client.query('ROLLBACK');
      throw new AppError(400, "Voucher has expired");
    }
    
    if (voucher.status === 'cancelled') {
      await client.query('ROLLBACK');
      throw new AppError(400, "Voucher has been cancelled");
    }
    
    if (voucher.status !== 'active') {
      await client.query('ROLLBACK');
      throw new AppError(400, `Voucher cannot be redeemed (status: ${voucher.status})`);
    }
    
    // Check expiry using database time (prevents clock skew issues)
    if (voucher.expires_at && new Date(voucher.expires_at) < new Date(voucher.current_time)) {
      // Mark as expired
      await client.query(
        `UPDATE vouchers SET status = 'expired', updated_at = NOW() WHERE id = $1`,
        [voucher.id]
      );
      await client.query('ROLLBACK');
      throw new AppError(400, "Voucher has expired");
    }
    
    // Check booking status
    if (voucher.booking_status !== 'confirmed') {
      await client.query('ROLLBACK');
      throw new AppError(
        400, 
        `Cannot redeem voucher: booking status is "${voucher.booking_status}". Booking must be confirmed.`
      );
    }
    
    // All validations passed - redeem the voucher
    await client.query(
      `UPDATE vouchers 
       SET status = 'redeemed',
           redeemed_by_partner_id = $1,
           redeemed_at = NOW(),
           updated_at = NOW()
       WHERE id = $2`,
      [partnerId, voucher.id]
    );
    
    // Update booking status if possible
    try {
      const bookingUpdate = await client.query(
        `UPDATE bookings 
         SET status = 'redeemed', 
             updated_at = NOW() 
         WHERE id = $1 AND status = 'confirmed'`,
        [voucher.booking_id]
      );
      
      if (bookingUpdate.rowCount > 0) {
        logError('✅ Booking status updated to redeemed');
      } else {
        logError('⚠️ Booking status not updated (may already be in different state)');
      }
    } catch (bookingErr) {
      // Log but don't fail - booking status update is optional
      logError('⚠️ Could not update booking status:', {
        error: bookingErr.message,
        booking_id: voucher.booking_id
      });
      
      // If it's a critical error (not just unsupported status), consider rolling back
      if (bookingErr.code !== '42P01' && bookingErr.code !== '42703') {
        // Not a "column/table doesn't exist" error - might be serious
        await client.query('ROLLBACK');
        throw new AppError(500, 'Failed to update booking status during redemption');
      }
    }
    
    await client.query('COMMIT');
    
    return {
      success: true,
      voucher_code: voucher.code,
      booking_id: voucher.booking_id,
      amount: voucher.amount,
      event_title: voucher.event_title || voucher.offer_title || 'Service',
      redeemed_at: new Date().toISOString(),
      redeemed_by_partner_id: partnerId
    };
    
  } catch (err) {
    try {
      await client.query('ROLLBACK');
      logError('✅ Transaction rolled back');
    } catch (rollbackErr) {
      logError('❌ CRITICAL: Rollback failed:', rollbackErr);
    }
    
    // Re-throw AppErrors
    if (err instanceof AppError) {
      throw err;
    }
    
    // Wrap unknown errors
    logError('❌ Voucher redemption error:', {
      error: err.message,
      code: err.code,
      voucherCode: code,
      partnerId
    });
    throw new AppError(500, 'Voucher redemption failed. Please try again.');
    
  } finally {
    try {
      client.release();
    } catch (releaseErr) {
      logError('❌ Failed to release database client:', releaseErr);
    }
  }
}

// Get voucher by code
async function getVoucherByCode(code) {
  const voucher = await voucherRepository.getVoucherByCode(code);
  if (!voucher) {
    throw new AppError(404, "Voucher not found");
  }
  return voucher;
}

// List vouchers by partner
async function listVouchersByPartner(partnerId, filters = {}) {
  return await voucherRepository.listVouchersByPartner(partnerId, filters);
}

// Validate voucher before redemption (pre-check)
async function validateVoucherForRedemption(code, partnerId = null) {
  return await voucherRepository.validateVoucherForRedemption(code, partnerId);
}

// Mark expired vouchers (for scheduled job)
async function markExpiredVouchers() {
  return await voucherRepository.markExpiredVouchers();
}

// Get voucher statistics for a partner
async function getVoucherStats(partnerId) {
  return await voucherRepository.getVoucherStats(partnerId);
}

module.exports = {
  createVoucherForBooking,
  redeemVoucher,
  getVoucherByCode,
  listVouchersByPartner,
  validateVoucherForRedemption,
  markExpiredVouchers,
  getVoucherStats
};

