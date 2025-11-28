const { getPool } = require('../config/db');

const pool = getPool();

// Create a new voucher with proper conflict handling
// Uses ON CONFLICT to handle race conditions atomically
async function createVoucher(voucherData, client = pool) {
  // Use ON CONFLICT to handle race conditions where multiple requests try to create vouchers
  // for the same booking. This ensures atomicity without needing explicit transactions.
  const result = await client.query(
    `INSERT INTO vouchers (booking_id, event_id, partner_id, code, qr_code_url, qr_code_data, 
      status, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (booking_id) DO UPDATE SET
       updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [
      voucherData.booking_id,
      voucherData.event_id || null,
      voucherData.partner_id,
      voucherData.code,
      voucherData.qr_code_url || null,
      voucherData.qr_code_data || null,
      voucherData.status || 'active',
      voucherData.expires_at
    ]
  );
  
  // If no rows returned (shouldn't happen with RETURNING, but safety check)
  if (result.rows.length === 0) {
    // This means conflict occurred - fetch existing voucher
    const existing = await client.query(
      'SELECT * FROM vouchers WHERE booking_id = $1',
      [voucherData.booking_id]
    );
    return existing.rows[0] || null;
  }
  
  return result.rows[0];
}

// Get voucher by code
async function getVoucherByCode(code) {
  const result = await pool.query(
    `SELECT v.*, 
            b.user_id,
            COALESCE(b.total_price, b.fiat_amount, 0) as amount,
            b.deal_id,
            b.status as booking_status,
            e.title as event_title,
            po.title as offer_title
     FROM vouchers v
     JOIN bookings b ON v.booking_id = b.id
     LEFT JOIN events e ON v.event_id = e.id
     LEFT JOIN partner_offers po ON b.deal_id = po.id
     WHERE v.code = $1`,
    [code]
  );
  return result.rows[0];
}

// Get voucher by booking ID
async function getVoucherByBookingId(bookingId) {
  const result = await pool.query(
    'SELECT * FROM vouchers WHERE booking_id = $1 AND status = $2',
    [bookingId, 'active']
  );
  return result.rows[0] || null;
}

// List vouchers by partner ID
async function listVouchersByPartner(partnerId, { status = null } = {}) {
  let query = `
    SELECT v.*, 
           b.user_id, 
           COALESCE(b.total_price, b.fiat_amount, 0) as amount, 
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
  const params = [partnerId];

  if (status) {
    query += ` AND v.status = $2`;
    params.push(status);
  }

  query += ` ORDER BY v.created_at DESC`;

  const result = await pool.query(query, params);
  return result.rows;
}

// Update voucher status
async function updateVoucherStatus(voucherId, status, additionalData = {}) {
  const updates = ['status = $1', 'updated_at = CURRENT_TIMESTAMP'];
  const values = [status];
  let paramCount = 1;

  if (additionalData.redeemed_by_partner_id) {
    paramCount++;
    updates.push(`redeemed_by_partner_id = $${paramCount}`);
    values.push(additionalData.redeemed_by_partner_id);
  }

  if (additionalData.redeemed_at !== undefined) {
    paramCount++;
    updates.push(`redeemed_at = $${paramCount}`);
    values.push(additionalData.redeemed_at);
  }

  paramCount++;
  values.push(voucherId);

  const result = await pool.query(
    `UPDATE vouchers SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
    values
  );
  return result.rows[0];
}

// Get booking with partner info for voucher creation
// Includes validation checks to prevent invalid voucher creation
async function getBookingForVoucher(bookingId, userId, client = pool) {
  const result = await client.query(
    `SELECT b.*, 
            e.id as event_id, 
            e.venue_id as partner_id_from_event,
            po.partner_id as partner_id_from_offer,
            COALESCE(b.partner_id, e.venue_id, po.partner_id) as partner_id,
            COALESCE(b.total_price, b.fiat_amount, 0) as amount,
            b.created_at,
            b.updated_at,
            b.deal_id,
            -- Check if voucher already exists (use FOR UPDATE to prevent race conditions)
            (SELECT COUNT(*) FROM vouchers WHERE booking_id = b.id) as existing_voucher_count
     FROM bookings b
     LEFT JOIN events e ON b.event_id = e.id
     LEFT JOIN partner_offers po ON b.deal_id = po.id
     WHERE b.id = $1 
       AND b.user_id = $2
     FOR UPDATE OF b`, // Lock booking row to prevent concurrent modifications
    [bookingId, userId]
  );
  
  const booking = result.rows[0];
  
  if (!booking) {
    return null; // Will be handled by service layer
  }
  
  // Validation checks
  const validationErrors = [];
  
  // Check booking status
  if (booking.status !== 'confirmed') {
    validationErrors.push(`Booking must be confirmed. Current status: ${booking.status}`);
  }
  
  // Check booking has positive amount
  const amount = parseFloat(booking.amount || 0);
  if (amount <= 0) {
    validationErrors.push('Booking must have a positive amount to create a voucher');
  }
  
  // Check if voucher already exists
  if (booking.existing_voucher_count > 0) {
    booking.has_existing_voucher = true;
  }
  
  // Add validation results to booking object
  booking.can_create_voucher = validationErrors.length === 0;
  booking.validation_errors = validationErrors;
  
  return booking;
}

// Validate voucher for redemption (pre-redemption checks)
async function validateVoucherForRedemption(code, partnerId = null) {
  const result = await pool.query(
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
     WHERE v.code = $1`,
    [code]
  );
  
  if (result.rowCount === 0) {
    return { valid: false, reason: 'Voucher not found' };
  }
  
  const voucher = result.rows[0];
  const now = new Date(voucher.current_time);
  
  // Check voucher status
  if (voucher.status === 'redeemed') {
    return { valid: false, reason: 'Voucher has already been redeemed' };
  }
  
  if (voucher.status === 'expired') {
    return { valid: false, reason: 'Voucher has expired' };
  }
  
  if (voucher.status === 'cancelled') {
    return { valid: false, reason: 'Voucher has been cancelled' };
  }
  
  if (voucher.status !== 'active') {
    return { valid: false, reason: `Voucher cannot be redeemed (status: ${voucher.status})` };
  }
  
  // Check expiry using database time
  if (voucher.expires_at && new Date(voucher.expires_at) < now) {
    return { valid: false, reason: 'Voucher has expired' };
  }
  
  // Check partner match if provided
  if (partnerId && voucher.partner_id !== partnerId) {
    return { valid: false, reason: 'This voucher cannot be redeemed by this partner' };
  }
  
  // Check booking status
  if (voucher.booking_status !== 'confirmed') {
    return { 
      valid: false, 
      reason: `Booking status is "${voucher.booking_status}". Booking must be confirmed.` 
    };
  }
  
  return { 
    valid: true, 
    voucher: {
      id: voucher.id,
      code: voucher.code,
      booking_id: voucher.booking_id,
      partner_id: voucher.partner_id,
      amount: voucher.amount,
      event_title: voucher.event_title || voucher.offer_title || 'Service'
    }
  };
}

// Mark expired vouchers (for scheduled job)
async function markExpiredVouchers() {
  const result = await pool.query(
    `UPDATE vouchers 
     SET status = 'expired', updated_at = CURRENT_TIMESTAMP
     WHERE status = 'active' 
       AND expires_at < CURRENT_TIMESTAMP
     RETURNING id, code`,
    []
  );
  
  return {
    expired: result.rowCount,
    codes: result.rows.map(r => r.code)
  };
}

// Get voucher statistics for a partner
async function getVoucherStats(partnerId) {
  const result = await pool.query(
    `SELECT 
       COUNT(*)::int as total_vouchers,
       COUNT(*) FILTER (WHERE status = 'active')::int as active_count,
       COUNT(*) FILTER (WHERE status = 'redeemed')::int as redeemed_count,
       COUNT(*) FILTER (WHERE status = 'expired')::int as expired_count,
       COUNT(*) FILTER (WHERE status = 'cancelled')::int as cancelled_count,
       COALESCE(SUM(amount) FILTER (WHERE status = 'redeemed'), 0)::numeric as total_redeemed_value,
       COALESCE(SUM(amount) FILTER (WHERE status = 'active'), 0)::numeric as total_active_value
     FROM vouchers v
     JOIN bookings b ON v.booking_id = b.id
     WHERE v.partner_id = $1`,
    [partnerId]
  );
  
  return result.rows[0] || {
    total_vouchers: 0,
    active_count: 0,
    redeemed_count: 0,
    expired_count: 0,
    cancelled_count: 0,
    total_redeemed_value: 0,
    total_active_value: 0
  };
}

module.exports = {
  createVoucher,
  getVoucherByCode,
  getVoucherByBookingId,
  listVouchersByPartner,
  updateVoucherStatus,
  getBookingForVoucher,
  validateVoucherForRedemption,
  markExpiredVouchers,
  getVoucherStats
};

