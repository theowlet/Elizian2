const { getPool } = require('../config/db');
const bookingRepository = require('../repositories/bookingRepository');
const notificationService = require('./notificationService');
const { AppError } = require('../../utils/response');
const { log, logError } = require('../../utils/logger');

const pool = getPool();

/**
 * Redeem a voucher/deal booking
 * 
 * Requirements:
 * - Idempotent (cannot be redeemed twice)
 * - Financial capture (bill amount, EZT co-pay, net amount)
 * - Timestamped
 * - Linked to partner and deal code
 * - Notifications to user, partner, admin
 * - Immutable audit trail
 * 
 * @param {Object} redemptionData - Redemption details
 * @param {string} redemptionData.voucher_code - Voucher code (UUID)
 * @param {string} redemptionData.partner_id - Partner ID redeeming the voucher
 * @param {number} redemptionData.total_bill_amount - Total bill amount
 * @param {number} redemptionData.ezt_co_pay_amount - Amount payable by EZT (co-pay)
 * @param {number} redemptionData.net_amount_from_user - Net amount from user
 * @param {string} redemptionData.redeemed_by_user_id - Partner staff member ID (optional)
 * @param {string} redemptionData.redemption_notes - Notes (optional)
 * @returns {Object} Redemption record
 */
async function redeemVoucher(redemptionData) {
  const client = await pool.connect();
  
  try {
    const {
      voucher_code,
      partner_id,
      total_bill_amount,
      ezt_co_pay_amount,
      net_amount_from_user,
      redeemed_by_user_id = null,
      redemption_notes = null
    } = redemptionData;

    // Validation
    if (!voucher_code) {
      throw new AppError(400, 'Voucher code is required');
    }
    if (!partner_id) {
      throw new AppError(400, 'Partner ID is required');
    }
    if (total_bill_amount === undefined || total_bill_amount < 0) {
      throw new AppError(400, 'Total bill amount is required and must be >= 0');
    }
    if (ezt_co_pay_amount === undefined || ezt_co_pay_amount < 0) {
      throw new AppError(400, 'EZT co-pay amount is required and must be >= 0');
    }
    if (net_amount_from_user === undefined || net_amount_from_user < 0) {
      throw new AppError(400, 'Net amount from user is required and must be >= 0');
    }

    // Validate financial calculation
    const calculatedNet = total_bill_amount - ezt_co_pay_amount;
    if (Math.abs(net_amount_from_user - calculatedNet) > 0.01) { // Allow small floating point differences
      throw new AppError(400, `Net amount from user (${net_amount_from_user}) must equal total bill (${total_bill_amount}) minus EZT co-pay (${ezt_co_pay_amount})`);
    }

    await client.query('BEGIN');

    // Get booking by voucher code with lock (FOR UPDATE)
    const bookingResult = await client.query(
      `SELECT id, user_id, partner_id, deal_id, status, voucher_code, booking_reference, total_price, fiat_amount
       FROM bookings
       WHERE voucher_code = $1
       FOR UPDATE`,
      [voucher_code]
    );

    if (bookingResult.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new AppError(404, 'Voucher not found');
    }

    const booking = bookingResult.rows[0];

    // Check if already redeemed (idempotent check)
    const existingRedemption = await client.query(
      `SELECT id, redemption_status, redeemed_at
       FROM redemption_audit
       WHERE booking_id = $1 AND redemption_status = 'redeemed'`,
      [booking.id]
    );

    if (existingRedemption.rows.length > 0) {
      await client.query('ROLLBACK');
      const redemption = existingRedemption.rows[0];
      log(`⚠️ Voucher ${voucher_code} already redeemed at ${redemption.redeemed_at}`);
      throw new AppError(409, `Voucher already redeemed on ${new Date(redemption.redeemed_at).toLocaleString()}`);
    }

    // Validate partner matches booking partner
    if (booking.partner_id !== partner_id) {
      await client.query('ROLLBACK');
      throw new AppError(403, 'Voucher does not belong to this partner');
    }

    // Validate booking status (must be confirmed or pending, not cancelled/expired)
    if (booking.status === 'cancelled' || booking.status === 'expired') {
      await client.query('ROLLBACK');
      throw new AppError(400, `Cannot redeem voucher with status: ${booking.status}`);
    }

    // Update booking status to 'redeemed'
    await bookingRepository.updateBookingStatus(booking.id, 'redeemed', {}, client);

    // Create immutable redemption audit record
    const redemptionResult = await client.query(
      `INSERT INTO redemption_audit (
        booking_id,
        voucher_code,
        redeemed_by_partner_id,
        total_bill_amount,
        ezt_co_pay_amount,
        net_amount_from_user,
        redeemed_by_user_id,
        redemption_notes,
        redemption_status,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'redeemed', $9)
      RETURNING *`,
      [
        booking.id,
        voucher_code,
        partner_id,
        total_bill_amount,
        ezt_co_pay_amount,
        net_amount_from_user,
        redeemed_by_user_id,
        redemption_notes,
        JSON.stringify({
          booking_reference: booking.booking_reference,
          original_total_price: booking.total_price,
          original_fiat_amount: booking.fiat_amount,
          redeemed_at: new Date().toISOString()
        })
      ]
    );

    const redemption = redemptionResult.rows[0];

    // Get partner and user details for notifications
    const partnerResult = await client.query(
      `SELECT id, name, email FROM partners WHERE id = $1`,
      [partner_id]
    );
    const partner = partnerResult.rows[0];

    const userResult = await client.query(
      `SELECT id, first_name, last_name, phone_number, email FROM users WHERE id = $1`,
      [booking.user_id]
    );
    const user = userResult.rows[0];

    // Get admin users for notification
    const adminResult = await client.query(
      `SELECT u.id, u.email
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE r.role_name = 'admin' OR r.role_name = 'super_admin'
       LIMIT 10`
    );
    const admins = adminResult.rows;

    await client.query('COMMIT');

    // Send notifications (non-blocking, after commit)
    try {
      // Notify user
      await notificationService.create({
        userId: booking.user_id,
        type: 'voucher_redeemed',
        title: 'Voucher Redeemed',
        message: `Your voucher ${booking.booking_reference} has been redeemed at ${partner?.name || 'partner'}.`,
        actionUrl: `/bookings/${booking.id}`,
        actionLabel: 'View Booking',
        priority: 'normal',
        metadata: {
          booking_id: booking.id,
          voucher_code: voucher_code,
          partner_id: partner_id,
          partner_name: partner?.name,
          redemption_id: redemption.id,
          total_bill_amount: total_bill_amount,
          ezt_co_pay_amount: ezt_co_pay_amount,
          net_amount_from_user: net_amount_from_user
        }
      });

      // Notify partner (if partner has user account)
      if (partner) {
        const partnerUserResult = await pool.query(
          `SELECT id FROM users WHERE email = $1 OR phone_number = $2 LIMIT 1`,
          [partner.email, partner.phone]
        );
        if (partnerUserResult.rows.length > 0) {
          await notificationService.create({
            userId: partnerUserResult.rows[0].id,
            type: 'voucher_redeemed',
            title: 'Voucher Redeemed',
            message: `Voucher ${booking.booking_reference} has been redeemed. Bill: ₹${total_bill_amount}, EZT Co-pay: ₹${ezt_co_pay_amount}, Net: ₹${net_amount_from_user}`,
            actionUrl: `/partner/bookings/${booking.id}`,
            actionLabel: 'View Booking',
            priority: 'normal',
            metadata: {
              booking_id: booking.id,
              voucher_code: voucher_code,
              redemption_id: redemption.id
            }
          });
        }
      }

      // Notify admins (bulk)
      if (admins.length > 0) {
        const adminUserIds = admins.map(a => a.id);
        await notificationService.createBulk(adminUserIds, {
          type: 'voucher_redeemed',
          title: 'Voucher Redemption',
          message: `Voucher ${booking.booking_reference} redeemed at ${partner?.name || 'partner'}. Bill: ₹${total_bill_amount}`,
          actionUrl: `/admin/bookings/${booking.id}`,
          actionLabel: 'View Booking',
          priority: 'normal',
          metadata: {
            booking_id: booking.id,
            voucher_code: voucher_code,
            partner_id: partner_id,
            redemption_id: redemption.id
          }
        });
      }

      log(`✅ Notifications sent for redemption ${redemption.id}`);
    } catch (notifError) {
      // Log but don't fail redemption
      logError('⚠️ Notification error (redemption succeeded):', notifError);
    }

    log(`✅ Voucher ${voucher_code} redeemed successfully. Redemption ID: ${redemption.id}`);

    return {
      ...redemption,
      booking: {
        id: booking.id,
        booking_reference: booking.booking_reference,
        user_id: booking.user_id,
        partner_id: booking.partner_id
      },
      partner: partner ? { id: partner.id, name: partner.name } : null,
      user: user ? { id: user.id, name: `${user.first_name} ${user.last_name}` } : null
    };
  } catch (error) {
    await client.query('ROLLBACK');
    if (error instanceof AppError) {
      throw error;
    }
    logError('❌ Redemption error:', error);
    throw new AppError(500, `Redemption failed: ${error.message}`);
  } finally {
    client.release();
  }
}

/**
 * Get redemption details by voucher code
 * @param {string} voucherCode - Voucher code
 * @returns {Object} Redemption details
 */
async function getRedemptionByVoucherCode(voucherCode) {
  try {
    const result = await pool.query(
      `SELECT ra.*, b.booking_reference, b.user_id, b.partner_id, b.deal_id
       FROM redemption_audit ra
       JOIN bookings b ON ra.booking_id = b.id
       WHERE ra.voucher_code = $1
       ORDER BY ra.redeemed_at DESC
       LIMIT 1`,
      [voucherCode]
    );

    return result.rows[0] || null;
  } catch (error) {
    logError('❌ Get redemption error:', error);
    throw new AppError(500, `Failed to get redemption: ${error.message}`);
  }
}

/**
 * Get redemption audit trail for a booking
 * @param {string} bookingId - Booking ID
 * @returns {Array} Redemption records
 */
async function getRedemptionAuditTrail(bookingId) {
  try {
    const result = await pool.query(
      `SELECT * FROM redemption_audit
       WHERE booking_id = $1
       ORDER BY redeemed_at DESC`,
      [bookingId]
    );

    return result.rows;
  } catch (error) {
    logError('❌ Get redemption audit trail error:', error);
    throw new AppError(500, `Failed to get redemption audit trail: ${error.message}`);
  }
}

module.exports = {
  redeemVoucher,
  getRedemptionByVoucherCode,
  getRedemptionAuditTrail
};

