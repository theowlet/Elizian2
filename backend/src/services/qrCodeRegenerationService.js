/**
 * QR Code Regeneration Service
 * Regenerates QR codes for bookings that don't have them
 */

const { getPool } = require('../config/db');
const { generateAndUploadQRCode } = require('../utils/qrCodeGenerator');
const bookingRepository = require('../repositories/bookingRepository');
const { AppError } = require('../utils/response');
const { log, logError } = require('../utils/logger');

const pool = getPool();

/**
 * Regenerate QR code for a booking
 * @param {string} bookingId - Booking ID
 * @returns {Object} Updated booking with QR code URL
 */
async function regenerateQRCode(bookingId) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Get booking with enriched data (deal title, partner name, user name)
    const bookingQuery = await client.query(
      `SELECT 
        b.*,
        po.title as deal_title,
        p.name as partner_name,
        CONCAT(u.first_name, ' ', u.last_name) as guest_name,
        u.email as user_email,
        u.phone_number as user_phone
       FROM bookings b
       LEFT JOIN partner_offers po ON b.deal_id = po.id
       LEFT JOIN partners p ON b.partner_id = p.id
       LEFT JOIN users u ON b.user_id = u.id
       WHERE b.id = $1
       FOR UPDATE`,
      [bookingId]
    );
    
    if (bookingQuery.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new AppError(404, 'Booking not found');
    }

    const booking = bookingQuery.rows[0];

    // Check if booking already has QR code
    if (booking.qr_code_url) {
      await client.query('ROLLBACK');
      log(`⚠️ Booking ${bookingId} already has QR code: ${booking.qr_code_url}`);
      return booking;
    }

    // Check if booking has voucher_code
    if (!booking.voucher_code) {
      await client.query('ROLLBACK');
      throw new AppError(400, 'Booking does not have a voucher code. Cannot generate QR code.');
    }

    // Format guest name (fallback to email or phone if name not available)
    let guestName = booking.guest_name;
    if (!guestName || guestName.trim() === '') {
      guestName = booking.user_email || booking.user_phone || 'Guest';
    }

    // Generate QR code metadata with human-readable information
    const qrMetadata = {
      booking_reference: booking.booking_reference,
      guest_name: guestName,
      deal_title: booking.deal_title,
      partner_name: booking.partner_name,
      num_guests: booking.num_guests || booking.num_tickets || 1,
      booking_date: booking.booking_date,
      booking_time: booking.booking_time,
      booking_id: booking.id,
      booking_type: booking.booking_type || 'offer',
      partner_id: booking.partner_id,
      user_id: booking.user_id,
      created_at: booking.created_at || new Date().toISOString()
    };

    // Generate and upload QR code
    let qrCodeUrl = null;
    try {
      qrCodeUrl = await generateAndUploadQRCode(booking.voucher_code, qrMetadata);
      log(`✅ QR code generated and uploaded for booking ${bookingId}: ${qrCodeUrl}`);
    } catch (qrError) {
      await client.query('ROLLBACK');
      logError('❌ QR code generation failed:', qrError);
      throw new AppError(500, `Failed to generate QR code: ${qrError.message}`);
    }

    // Update booking with QR code URL
    const updateResult = await client.query(
      `UPDATE bookings 
       SET qr_code_url = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [qrCodeUrl, bookingId]
    );

    await client.query('COMMIT');

    log(`✅ QR code regenerated for booking ${bookingId}`);

    return updateResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    if (error instanceof AppError) {
      throw error;
    }
    logError('❌ QR code regeneration error:', error);
    throw new AppError(500, `QR code regeneration failed: ${error.message}`);
  } finally {
    client.release();
  }
}

/**
 * Regenerate QR codes for all bookings missing QR codes
 * @param {number} limit - Maximum number of bookings to process
 * @returns {Object} Summary of regeneration
 */
async function regenerateMissingQRCodes(limit = 100) {
  const client = await pool.connect();
  
  try {
    // Find bookings without QR codes but with voucher codes
    const result = await client.query(
      `SELECT id, voucher_code, booking_reference, partner_id, user_id, booking_type, created_at
       FROM bookings
       WHERE voucher_code IS NOT NULL 
         AND (qr_code_url IS NULL OR qr_code_url = '')
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );

    const bookings = result.rows;
    const results = {
      total: bookings.length,
      successful: 0,
      failed: 0,
      errors: []
    };

    log(`🔄 Found ${bookings.length} bookings without QR codes. Regenerating...`);

    for (const booking of bookings) {
      try {
        await regenerateQRCode(booking.id);
        results.successful++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          booking_id: booking.id,
          booking_reference: booking.booking_reference,
          error: error.message
        });
        logError(`❌ Failed to regenerate QR code for booking ${booking.id}:`, error);
      }
    }

    log(`✅ QR code regeneration complete: ${results.successful} successful, ${results.failed} failed`);

    return results;
  } catch (error) {
    logError('❌ Bulk QR code regeneration error:', error);
    throw new AppError(500, `Bulk QR code regeneration failed: ${error.message}`);
  } finally {
    client.release();
  }
}

module.exports = {
  regenerateQRCode,
  regenerateMissingQRCodes
};

