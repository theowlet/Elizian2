const { getPool } = require('../config/db');
const { AppError } = require('../../utils/response');
const { log, logError } = require('../../utils/logger');
const bookingValidation = require('./bookingValidation');
const operatingHoursService = require('./operatingHoursService');
const slotCapacityService = require('./slotCapacityService');
const partnerRepository = require('../repositories/partnerRepository');

const pool = getPool();
const PROMOTION_BATCH_SIZE = 50;

/**
 * Waitlist Service
 *
 * Intelligent waitlist management with position tracking, estimated wait time,
 * and auto-notification when slots open up.
 *
 * Key Features:
 * - Position-based queue (FIFO, unless tier priority)
 * - Intelligent wait time estimation based on historical data
 * - Auto-notification when slot becomes available
 * - 10-minute confirmation window
 * - Auto-expire notifications
 */

/**
 * Add user to waitlist for a specific time slot
 *
 * @param {Object} params
 * @param {UUID} params.partner_id
 * @param {UUID} params.user_id
 * @param {String} params.booking_date - YYYY-MM-DD
 * @param {String} params.booking_time - HH:MM
 * @param {Integer} params.party_size
 * @param {String} params.user_tier
 * @param {String} params.special_requests
 * @returns {Object} Waitlist entry with position and estimated wait time
 */
async function joinWaitlist({ partner_id, user_id, booking_date, booking_time, party_size, user_tier, special_requests }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Validate that the time slot is not in the past
    if (booking_date && booking_time) {
      const pastCheck = bookingValidation.validateBookingNotInPast(booking_date, booking_time);
      if (!pastCheck.allowed) {
        await client.query('ROLLBACK');
        throw new AppError(400, pastCheck.message || 'Cannot join waitlist for a past time slot');
      }
    }

    // 2. Validate that the time slot is within operating hours
    const hoursValidation = await operatingHoursService.validateBookingTime(
      partner_id,
      booking_date,
      booking_time
    );

    if (!hoursValidation.valid) {
      throw new AppError(400, `Cannot join waitlist: ${hoursValidation.message || hoursValidation.reason}`);
    }

    // 3. Check if user is already on waitlist for this slot
    const existingEntry = await client.query(
      `SELECT id, status, position
       FROM booking_waitlist
       WHERE partner_id = $1 AND user_id = $2 AND booking_date = $3 AND booking_time = $4
         AND status IN ('waiting', 'notified')`,
      [partner_id, user_id, booking_date, booking_time]
    );

    if (existingEntry.rows.length > 0) {
      const entry = existingEntry.rows[0];
      await client.query('ROLLBACK');
      return {
        success: false,
        message: `Already on waitlist at position ${entry.position}`,
        waitlist_entry: entry
      };
    }

    // 4. Calculate position in queue
    const positionResult = await client.query(
      `SELECT COALESCE(MAX(position), 0) + 1 AS next_position
       FROM booking_waitlist
       WHERE partner_id = $1 AND booking_date = $2 AND booking_time = $3
         AND status = 'waiting'`,
      [partner_id, booking_date, booking_time]
    );

    const position = positionResult.rows[0].next_position;

    // 4. Estimate wait time (intelligent algorithm)
    const estimatedWaitMinutes = await estimateWaitTime(partner_id, booking_date, booking_time, position);

    // 5. Insert waitlist entry
    const insertResult = await client.query(
      `INSERT INTO booking_waitlist
       (partner_id, user_id, booking_date, booking_time, party_size, user_tier, position, estimated_wait_minutes, special_requests, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'waiting')
       RETURNING *`,
      [partner_id, user_id, booking_date, booking_time, party_size, user_tier, position, estimatedWaitMinutes, special_requests]
    );

    await client.query('COMMIT');

    const waitlistEntry = insertResult.rows[0];

    log(`✅ User ${user_id} added to waitlist at position ${position} for ${booking_date} ${booking_time}`);

    return {
      success: true,
      message: `Added to waitlist at position ${position}`,
      waitlist_entry: waitlistEntry,
      estimated_wait_minutes: estimatedWaitMinutes
    };

  } catch (error) {
    await client.query('ROLLBACK');
    logError('Error joining waitlist:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Estimate wait time based on historical cancellation data
 *
 * Algorithm:
 * 1. Check historical cancellation rate for this partner/time slot
 * 2. Check current capacity utilization
 * 3. Calculate expected slot openings based on position
 *
 * @param {UUID} partner_id
 * @param {String} booking_date
 * @param {String} booking_time
 * @param {Integer} position
 * @returns {Integer} Estimated wait time in minutes
 */
async function estimateWaitTime(partner_id, booking_date, booking_time, position) {
  try {
    // 1. Get historical cancellation rate (last 30 days)
    const cancellationRate = await pool.query(
      `SELECT
         COUNT(CASE WHEN status = 'cancelled' THEN 1 END)::FLOAT /
         NULLIF(COUNT(*), 0) AS cancellation_rate
       FROM bookings
       WHERE partner_id = $1
         AND booking_date >= CURRENT_DATE - INTERVAL '30 days'
         AND booking_date <= CURRENT_DATE`,
      [partner_id]
    );

    const cancellationRateValue = cancellationRate.rows[0]?.cancellation_rate || 0.05; // Default 5%

    // 2. Get average time-to-cancellation (how far in advance people cancel)
    const avgCancellationTime = await pool.query(
      `SELECT AVG(EXTRACT(EPOCH FROM (booking_date::timestamp - updated_at)) / 3600) AS avg_hours_before
       FROM bookings
       WHERE partner_id = $1
         AND status = 'cancelled'
         AND booking_date >= CURRENT_DATE - INTERVAL '30 days'`,
      [partner_id]
    );

    const avgHoursBeforeCancellation = avgCancellationTime.rows[0]?.avg_hours_before || 24; // Default 24 hours

    // 3. Calculate days until booking
    const daysUntilBooking = Math.max(0, Math.floor(
      (new Date(booking_date) - new Date()) / (1000 * 60 * 60 * 24)
    ));

    // 4. Estimate slot openings based on position and cancellation rate
    const expectedOpenings = Math.max(1, Math.ceil(position * cancellationRateValue));

    // 5. Calculate estimated wait time
    let estimatedWaitMinutes;

    if (daysUntilBooking > 1) {
      // Multiple days away - estimate based on historical cancellation pattern
      estimatedWaitMinutes = Math.min(
        daysUntilBooking * 24 * 60, // Max = days until booking
        Math.ceil((position / expectedOpenings) * avgHoursBeforeCancellation * 60)
      );
    } else if (daysUntilBooking === 1) {
      // Tomorrow - higher urgency, faster estimate
      estimatedWaitMinutes = Math.min(
        24 * 60, // Max 24 hours
        Math.ceil(position * 60) // Estimate 1 hour per position
      );
    } else {
      // Same day - very urgent
      // Extract hours until booking time
      const now = new Date();
      const bookingDateTime = new Date(`${booking_date}T${booking_time}`);
      const hoursUntil = Math.max(0, (bookingDateTime - now) / (1000 * 60 * 60));

      if (hoursUntil > 2) {
        estimatedWaitMinutes = Math.min(
          hoursUntil * 60, // Max = hours until booking
          Math.ceil(position * 30) // Estimate 30 minutes per position
        );
      } else {
        // Very urgent (< 2 hours)
        estimatedWaitMinutes = Math.ceil(position * 15); // 15 minutes per position
      }
    }

    // Clamp to reasonable range (15 min - 7 days)
    return Math.min(Math.max(15, estimatedWaitMinutes), 7 * 24 * 60);

  } catch (error) {
    logError('Error estimating wait time:', error);
    // Fallback estimate: position * 60 minutes, max 48 hours
    return Math.min(position * 60, 48 * 60);
  }
}

/**
 * Get user's waitlist entries
 *
 * @param {UUID} user_id
 * @param {String} status - Filter by status ('waiting', 'notified', 'confirmed', 'expired', 'cancelled')
 * @returns {Array} Waitlist entries
 */
async function getUserWaitlistEntries(user_id, status = null) {
  try {
    let query = `
      SELECT
        w.*,
        p.name AS partner_name,
        p.address AS partner_address,
        (SELECT po.title FROM partner_offers po
         WHERE po.partner_id = w.partner_id AND po.status = 'active'
         ORDER BY po.created_at DESC
         LIMIT 1) AS deal_title
      FROM booking_waitlist w
      JOIN partners p ON w.partner_id = p.id
      WHERE w.user_id = $1
    `;

    const params = [user_id];

    if (status) {
      query += ` AND w.status = $2`;
      params.push(status);
    }

    query += ` ORDER BY w.booking_date ASC, w.booking_time ASC, w.created_at ASC`;

    const result = await pool.query(query, params);
    return result.rows;

  } catch (error) {
    logError('Error getting user waitlist entries:', error);
    throw error;
  }
}

/**
 * Get waitlist entries for a partner's specific time slot
 *
 * @param {UUID} partner_id
 * @param {String} booking_date
 * @param {String} booking_time
 * @param {String} status - Filter by status
 * @returns {Array} Waitlist entries sorted by position
 */
async function getWaitlistForSlot(partner_id, booking_date, booking_time, status = 'waiting') {
  try {
    const result = await pool.query(
      `SELECT
         w.*,
         u.first_name,
         u.last_name,
         u.email,
         u.phone_number
       FROM booking_waitlist w
       JOIN users u ON w.user_id = u.id
       WHERE w.partner_id = $1
         AND w.booking_date = $2
         AND w.booking_time = $3
         AND w.status = $4
       ORDER BY w.position ASC`,
      [partner_id, booking_date, booking_time, status]
    );

    return result.rows;

  } catch (error) {
    logError('Error getting waitlist for slot:', error);
    throw error;
  }
}

/** Default timezone for date extraction (matches deal_slots / bookings) */
const DEFAULT_TZ = 'Asia/Kolkata';

/**
 * Normalize date to YYYY-MM-DD for API calls.
 * Uses Asia/Kolkata for Date objects so calendar date matches DB.
 */
function toDateStr(val) {
  if (!val) return null;
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  const d = new Date(val);
  return !Number.isNaN(d.getTime()) ? d.toLocaleDateString('en-CA', { timeZone: DEFAULT_TZ }) : null;
}

/**
 * Normalize time to HH:MM for API calls
 */
function toTimeStr(val) {
  const raw = String(val || '').trim();
  if (!raw) return null;
  const m = raw.match(/^(\d{1,2}):(\d{2})/);
  if (m) return `${String(parseInt(m[1], 10)).padStart(2, '0')}:${m[2]}`;
  const d = new Date(`1970-01-01T${raw}`);
  if (!Number.isNaN(d.getTime())) return d.toTimeString().slice(0, 5);
  return null;
}

/**
 * Promote next person in waitlist to a confirmed booking when a slot opens.
 * Creates the booking automatically and sends notification.
 *
 * @param {UUID} partner_id
 * @param {UUID} deal_id - Offer/deal that had the cancelled booking
 * @param {String} booking_date - YYYY-MM-DD
 * @param {String} booking_time - HH:MM
 * @returns {Object} { booking, waitlistEntry } or null
 */
async function promoteNextWaitlistToBooking(partner_id, deal_id, booking_date, booking_time) {
  const dateStr = toDateStr(booking_date);
  const timeStr = toTimeStr(booking_time);
  if (!dateStr || !timeStr || !deal_id) return null;

  const client = await pool.connect();
  let nextEntry = null;
  try {
    await client.query('BEGIN');

    const nextResult = await client.query(
      `SELECT * FROM booking_waitlist
       WHERE partner_id = $1 AND booking_date = $2::date AND booking_time::text LIKE $3 || '%'
         AND status = 'waiting'
       ORDER BY position ASC
       LIMIT 1
       FOR UPDATE`,
      [partner_id, dateStr, timeStr]
    );

    if (nextResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    nextEntry = nextResult.rows[0];
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    logError('Error fetching next waitlist entry for promotion:', err);
    throw err;
  } finally {
    client.release();
  }

  try {
    const bookingService = require('./bookingService');
    const booking = await bookingService.createBooking({
      offer_id: deal_id,
      user_id: nextEntry.user_id,
      num_tickets: nextEntry.party_size || 1,
      booking_date: dateStr,
      booking_time: timeStr,
      special_requests: nextEntry.special_requests || null,
    });

    const updateClient = await pool.connect();
    try {
      await updateClient.query(
        `UPDATE booking_waitlist
         SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [nextEntry.id]
      );
    } finally {
      updateClient.release();
    }

    log(`✅ Promoted waitlist user ${nextEntry.user_id} to confirmed booking ${booking.id}`);

    try {
      const notificationService = require('./notificationService');
      const partner = await partnerRepository.getPartnerById(partner_id);
      const dealTitle = booking.deal_title || 'your deal';
      await notificationService.create({
        userId: nextEntry.user_id,
        type: 'booking_confirmation',
        title: 'You\'re in! Spot opened up',
        message: `A spot opened for ${dealTitle} at ${partner?.name || 'the venue'} on ${dateStr} at ${timeStr}. Your booking is now confirmed.`,
        actionUrl: `/booking/${booking.id}`,
        actionLabel: 'View Booking',
        priority: 'high',
        metadata: { booking_id: booking.id, waitlist_id: nextEntry.id, deal_title: dealTitle, source: 'waitlist_promoted' },
        sentViaInApp: true,
        sentViaPush: true,
      });
    } catch (notifErr) {
      logError('Waitlist promotion notification failed (non-fatal):', notifErr);
    }

    return { booking, waitlistEntry: { ...nextEntry, status: 'confirmed' } };
  } catch (err) {
    logError('Error promoting waitlist to booking:', err);
    return notifyNextInWaitlist(partner_id, dateStr, timeStr);
  }
}

/**
 * Notify next person in waitlist when slot becomes available
 * (Legacy: used when deal_id is unknown; only sets status to 'notified' with 10-min window)
 *
 * @param {UUID} partner_id
 * @param {String} booking_date
 * @param {String} booking_time
 * @returns {Object} Notified entry or null
 */
async function notifyNextInWaitlist(partner_id, booking_date, booking_time) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get next waiting person
    const nextResult = await client.query(
      `SELECT * FROM booking_waitlist
       WHERE partner_id = $1 AND booking_date = $2 AND booking_time = $3
         AND status = 'waiting'
       ORDER BY position ASC
       LIMIT 1
       FOR UPDATE`,
      [partner_id, booking_date, booking_time]
    );

    if (nextResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return null; // No one waiting
    }

    const nextEntry = nextResult.rows[0];

    // Update status to 'notified' with 10-minute expiration
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

    await client.query(
      `UPDATE booking_waitlist
       SET status = 'notified',
           notified_at = CURRENT_TIMESTAMP,
           expires_at = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [expiresAt, nextEntry.id]
    );

    await client.query('COMMIT');

    log(`🔔 Notified user ${nextEntry.user_id} from waitlist (position ${nextEntry.position})`);

    // TODO: Send push notification / email to user
    // await notificationService.sendWaitlistNotification(nextEntry);

    return {
      ...nextEntry,
      status: 'notified',
      notified_at: new Date(),
      expires_at: expiresAt
    };

  } catch (error) {
    await client.query('ROLLBACK');
    logError('Error notifying next in waitlist:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Cancel waitlist entry
 *
 * @param {UUID} waitlist_id
 * @param {UUID} user_id - For authorization check
 * @returns {Object} Updated entry
 */
async function cancelWaitlistEntry(waitlist_id, user_id) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE booking_waitlist
       SET status = 'cancelled',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2 AND status IN ('waiting', 'notified')
       RETURNING *`,
      [waitlist_id, user_id]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new AppError(404, 'Waitlist entry not found or already processed');
    }

    const cancelledEntry = result.rows[0];

    // Reorder positions for remaining entries
    await client.query(
      `UPDATE booking_waitlist
       SET position = position - 1,
           updated_at = CURRENT_TIMESTAMP
       WHERE partner_id = $1
         AND booking_date = $2
         AND booking_time = $3
         AND status = 'waiting'
         AND position > $4`,
      [cancelledEntry.partner_id, cancelledEntry.booking_date, cancelledEntry.booking_time, cancelledEntry.position]
    );

    await client.query('COMMIT');

    log(`❌ Cancelled waitlist entry ${waitlist_id} for user ${user_id}`);

    return cancelledEntry;

  } catch (error) {
    await client.query('ROLLBACK');
    logError('Error cancelling waitlist entry:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Expire old notifications (called by cron job)
 * Marks notified entries as expired if confirmation window has passed
 *
 * @returns {Integer} Number of expired entries
 */
async function expireOldNotifications() {
  try {
    const result = await pool.query(
      `UPDATE booking_waitlist
       SET status = 'expired',
           updated_at = CURRENT_TIMESTAMP
       WHERE status = 'notified'
         AND expires_at < CURRENT_TIMESTAMP
       RETURNING id`
    );

    const expiredCount = result.rows.length;

    if (expiredCount > 0) {
      log(`⏰ Expired ${expiredCount} waitlist notifications`);
    }

    return expiredCount;

  } catch (error) {
    logError('Error expiring notifications:', error);
    throw error;
  }
}

/**
 * Promotion cycle: find slots with free capacity and notify first waiting user per slot.
 * Safe to run every 1–5 minutes. Uses venue_time_slots when present; skips when table missing.
 *
 * @returns {Object} { notified: number, slots_checked: number }
 */
async function runPromotionCycle() {
  try {
    const exists = await slotCapacityService.slotTableExists(pool);
    if (!exists) {
      return { notified: 0, slots_checked: 0 };
    }

    const slotsResult = await pool.query(
      `SELECT partner_id, slot_datetime, capacity, booked_count
       FROM venue_time_slots
       WHERE slot_datetime >= CURRENT_TIMESTAMP
         AND booked_count < capacity
       ORDER BY slot_datetime ASC
       LIMIT $1`,
      [PROMOTION_BATCH_SIZE]
    );

    let notified = 0;
    for (const row of slotsResult.rows) {
      const d = new Date(row.slot_datetime);
      const booking_date = d.toISOString().slice(0, 10);
      const booking_time = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;

      const entry = await notifyNextInWaitlist(row.partner_id, booking_date, booking_time);
      if (entry) notified++;
    }

    if (notified > 0) {
      log(`🔔 Waitlist promotion: notified ${notified} user(s) across ${slotsResult.rows.length} slot(s)`);
    }

    return { notified, slots_checked: slotsResult.rows.length };
  } catch (error) {
    logError('Error in waitlist promotion cycle:', error);
    return { notified: 0, slots_checked: 0 };
  }
}

/**
 * Get waitlist statistics for a partner
 *
 * @param {UUID} partner_id
 * @param {String} date_from - YYYY-MM-DD (optional)
 * @param {String} date_to - YYYY-MM-DD (optional)
 * @returns {Object} Waitlist stats
 */
async function getWaitlistStats(partner_id, date_from = null, date_to = null) {
  try {
    let query = `
      SELECT
        COUNT(*) AS total_entries,
        COUNT(CASE WHEN status = 'waiting' THEN 1 END) AS currently_waiting,
        COUNT(CASE WHEN status = 'notified' THEN 1 END) AS currently_notified,
        COUNT(CASE WHEN status = 'confirmed' THEN 1 END) AS confirmed,
        COUNT(CASE WHEN status = 'expired' THEN 1 END) AS expired,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) AS cancelled,
        AVG(estimated_wait_minutes) AS avg_estimated_wait,
        AVG(CASE
          WHEN status = 'confirmed' AND notified_at IS NOT NULL
          THEN EXTRACT(EPOCH FROM (updated_at - notified_at)) / 60
        END) AS avg_confirmation_time_minutes
      FROM booking_waitlist
      WHERE partner_id = $1
    `;

    const params = [partner_id];

    if (date_from) {
      query += ` AND booking_date >= $${params.length + 1}`;
      params.push(date_from);
    }

    if (date_to) {
      query += ` AND booking_date <= $${params.length + 1}`;
      params.push(date_to);
    }

    const result = await pool.query(query, params);
    return result.rows[0];

  } catch (error) {
    logError('Error getting waitlist stats:', error);
    throw error;
  }
}

module.exports = {
  joinWaitlist,
  estimateWaitTime,
  getUserWaitlistEntries,
  getWaitlistForSlot,
  promoteNextWaitlistToBooking,
  notifyNextInWaitlist,
  cancelWaitlistEntry,
  expireOldNotifications,
  runPromotionCycle,
  getWaitlistStats
};
