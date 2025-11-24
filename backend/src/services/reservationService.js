const reservationRepository = require('../repositories/reservationRepository');
const { AppError } = require('../../utils/response');
const { logError } = require('../../utils/logger');

// Check availability
async function checkAvailability(partnerId, date, timeSlot) {
  try {
    return await reservationRepository.checkAvailability(partnerId, date, timeSlot);
  } catch (error) {
    logError('Error in checkAvailability service:', error);
    throw error;
  }
}

// Get available time slots
async function getAvailableTimeSlots(partnerId, date, partySize = 2) {
  try {
    return await reservationRepository.getAvailableTimeSlots(partnerId, date, partySize);
  } catch (error) {
    logError('Error in getAvailableTimeSlots service:', error);
    throw error;
  }
}

// Create table reservation
async function createReservation(reservationData, client) {
  try {
    // Validate date is not in the past
    const reservationDate = new Date(reservationData.reservation_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (reservationDate < today) {
      throw new AppError(400, 'Cannot make reservations for past dates');
    }

    // Validate party size
    if (reservationData.party_size < 1 || reservationData.party_size > 20) {
      throw new AppError(400, 'Party size must be between 1 and 20');
    }

    return await reservationRepository.createReservation(reservationData, client);
  } catch (error) {
    logError('Error in createReservation service:', error);
    throw error;
  }
}

// Get reservation by ID
async function getReservation(reservationId) {
  try {
    const reservation = await reservationRepository.getReservationById(reservationId);
    if (!reservation) {
      throw new AppError(404, 'Reservation not found');
    }
    return reservation;
  } catch (error) {
    logError('Error in getReservation service:', error);
    throw error;
  }
}

// Cancel reservation
async function cancelReservation(reservationId, reason, client) {
  try {
    return await reservationRepository.cancelReservation(reservationId, reason, client);
  } catch (error) {
    logError('Error in cancelReservation service:', error);
    throw error;
  }
}

// Get user reservations
async function getUserReservations(userId) {
  try {
    return await reservationRepository.getUserReservations(userId);
  } catch (error) {
    logError('Error in getUserReservations service:', error);
    throw error;
  }
}

// Admin: Set restaurant availability
async function setAvailability(partnerId, date, timeSlot, maxCapacity, isBlocked = false) {
  try {
    return await reservationRepository.setRestaurantAvailability(partnerId, date, timeSlot, maxCapacity, isBlocked);
  } catch (error) {
    logError('Error in setAvailability service:', error);
    throw error;
  }
}

module.exports = {
  checkAvailability,
  getAvailableTimeSlots,
  createReservation,
  getReservation,
  cancelReservation,
  getUserReservations,
  setAvailability
};

