const { getPool } = require('../config/db');
const { log, logError } = require('../../utils/logger');

const pool = getPool();

// Check restaurant availability for a date/time
async function checkAvailability(partnerId, date, timeSlot) {
  try {
    const result = await pool.query(
      `SELECT 
         max_capacity,
         booked_capacity,
         (max_capacity - booked_capacity) as available_capacity,
         is_available,
         is_blocked
       FROM restaurant_availability
       WHERE partner_id = $1 
         AND date = $2 
         AND time_slot = $3`,
      [partnerId, date, timeSlot]
    );

    if (result.rows.length === 0) {
      // No availability record exists - assume available (default capacity)
      return {
        available: true,
        maxCapacity: 20, // Default
        bookedCapacity: 0,
        availableCapacity: 20
      };
    }

    const slot = result.rows[0];
    return {
      available: slot.is_available && !slot.is_blocked && slot.available_capacity > 0,
      maxCapacity: parseInt(slot.max_capacity),
      bookedCapacity: parseInt(slot.booked_capacity),
      availableCapacity: parseInt(slot.available_capacity)
    };
  } catch (error) {
    logError('Error checking availability:', error);
    throw error;
  }
}

// Get available time slots for a date
async function getAvailableTimeSlots(partnerId, date, partySize = 2) {
  try {
    const result = await pool.query(
      `SELECT 
         time_slot,
         max_capacity,
         booked_capacity,
         (max_capacity - booked_capacity) as available_capacity,
         is_available,
         is_blocked
       FROM restaurant_availability
       WHERE partner_id = $1 
         AND date = $2
         AND is_available = true
         AND is_blocked = false
         AND (max_capacity - booked_capacity) >= $3
       ORDER BY time_slot ASC`,
      [partnerId, date, partySize]
    );

    return result.rows.map(row => ({
      time: row.time_slot,
      available: row.is_available && !row.is_blocked && parseInt(row.available_capacity) >= partySize,
      capacity: parseInt(row.available_capacity),
      maxCapacity: parseInt(row.max_capacity)
    }));
  } catch (error) {
    logError('Error getting available time slots:', error);
    throw error;
  }
}

// Create table reservation
// When skipCapacityUpdate is true (e.g. venue_time_slots used), only insert table_reservations; do not touch restaurant_availability
async function createReservation(reservationData, client = pool) {
  try {
    const {
      booking_id,
      partner_id,
      user_id,
      reservation_date,
      reservation_time,
      party_size,
      occasion,
      special_requests,
      seating_preference,
      skipCapacityUpdate = false
    } = reservationData;

    if (!skipCapacityUpdate) {
      const availability = await checkAvailability(partner_id, reservation_date, reservation_time);
      if (!availability.available || availability.availableCapacity < party_size) {
        throw new Error(`Not enough capacity. Available: ${availability.availableCapacity}, Required: ${party_size}`);
      }
    }

    const result = await client.query(
      `INSERT INTO table_reservations 
       (booking_id, partner_id, user_id, reservation_date, reservation_time, 
        party_size, occasion, special_requests, seating_preference, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'confirmed')
       RETURNING *`,
      [
        booking_id,
        partner_id,
        user_id,
        reservation_date,
        reservation_time,
        party_size,
        occasion,
        special_requests,
        seating_preference
      ]
    );

    if (!skipCapacityUpdate) {
      await client.query(
        `INSERT INTO restaurant_availability 
         (partner_id, date, time_slot, max_capacity, booked_capacity, is_available)
         VALUES ($1, $2, $3, $4, $5, true)
         ON CONFLICT (partner_id, date, time_slot)
         DO UPDATE SET 
           booked_capacity = restaurant_availability.booked_capacity + $6,
           updated_at = CURRENT_TIMESTAMP`,
        [partner_id, reservation_date, reservation_time, 20, party_size, party_size]
      );
    }

    log(`Table reservation created: ${result.rows[0].id} for ${party_size} guests on ${reservation_date} at ${reservation_time}`);
    return result.rows[0];
  } catch (error) {
    logError('Error creating reservation:', error);
    throw error;
  }
}

// Get reservation by ID
async function getReservationById(reservationId) {
  try {
    const result = await pool.query(
      `SELECT * FROM table_reservations WHERE id = $1`,
      [reservationId]
    );
    return result.rows[0];
  } catch (error) {
    logError('Error getting reservation:', error);
    throw error;
  }
}

// Get reservations by booking ID
async function getReservationByBookingId(bookingId) {
  try {
    const result = await pool.query(
      `SELECT * FROM table_reservations WHERE booking_id = $1`,
      [bookingId]
    );
    return result.rows[0];
  } catch (error) {
    logError('Error getting reservation by booking:', error);
    throw error;
  }
}

// Cancel reservation
async function cancelReservation(reservationId, reason, client = pool) {
  try {
    const reservation = await getReservationById(reservationId);
    if (!reservation) {
      throw new Error('Reservation not found');
    }

    // Update reservation status
    const result = await client.query(
      `UPDATE table_reservations 
       SET status = 'cancelled',
           cancelled_at = CURRENT_TIMESTAMP,
           cancellation_reason = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [reason, reservationId]
    );

    // Update availability (release capacity)
    await client.query(
      `UPDATE restaurant_availability
       SET booked_capacity = GREATEST(0, booked_capacity - $1),
           updated_at = CURRENT_TIMESTAMP
       WHERE partner_id = $2 
         AND date = $3 
         AND time_slot = $4`,
      [reservation.party_size, reservation.partner_id, reservation.reservation_date, reservation.reservation_time]
    );

    log(`Reservation ${reservationId} cancelled`);
    return result.rows[0];
  } catch (error) {
    logError('Error cancelling reservation:', error);
    throw error;
  }
}

// Admin: Initialize/Update restaurant availability
async function setRestaurantAvailability(partnerId, date, timeSlot, maxCapacity, isBlocked = false) {
  try {
    const result = await pool.query(
      `INSERT INTO restaurant_availability 
       (partner_id, date, time_slot, max_capacity, booked_capacity, is_available, is_blocked)
       VALUES ($1, $2, $3, $4, 0, true, $5)
       ON CONFLICT (partner_id, date, time_slot)
       DO UPDATE SET
         max_capacity = EXCLUDED.max_capacity,
         is_blocked = EXCLUDED.is_blocked,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [partnerId, date, timeSlot, maxCapacity, isBlocked]
    );
    return result.rows[0];
  } catch (error) {
    logError('Error setting restaurant availability:', error);
    throw error;
  }
}

// Get user reservations
async function getUserReservations(userId, limit = 50) {
  try {
    const result = await pool.query(
      `SELECT tr.*, 
         p.name as partner_name,
         p.address as partner_address,
         b.booking_reference
       FROM table_reservations tr
       JOIN partners p ON tr.partner_id = p.id
       LEFT JOIN bookings b ON tr.booking_id = b.id
       WHERE tr.user_id = $1
       ORDER BY tr.reservation_date DESC, tr.reservation_time DESC
       LIMIT $2`,
      [userId, limit]
    );
    return result.rows;
  } catch (error) {
    logError('Error getting user reservations:', error);
    throw error;
  }
}

module.exports = {
  checkAvailability,
  getAvailableTimeSlots,
  createReservation,
  getReservationById,
  getReservationByBookingId,
  cancelReservation,
  setRestaurantAvailability,
  getUserReservations
};

