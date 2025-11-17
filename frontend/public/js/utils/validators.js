/**
 * @module validators
 * @description Input validation utilities
 * @author Elizian Team
 * @version 1.0.0
 */

import { CONFIG } from '../core/config.js';

// ==========================================
// VALIDATION FUNCTIONS
// ==========================================

/**
 * Validate required field
 * @param {any} value - Value to validate
 * @param {string} fieldName - Field name for error message
 * @throws {Error} If value is empty/null/undefined
 * @returns {boolean} True if valid
 */
export function validateRequired(value, fieldName = 'Field') {
  if (value === null || value === undefined || value === '') {
    throw new Error(`${fieldName} is required`);
  }
  return true;
}

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid email format
 */
export function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate phone number
 * @param {string} phone - Phone number to validate
 * @returns {boolean} True if valid phone format
 */
export function validatePhone(phone) {
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.length === CONFIG.VALIDATION.phoneLength;
}

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @returns {boolean} True if password meets requirements
 */
export function validatePassword(password) {
  return password && password.length >= CONFIG.VALIDATION.passwordMinLength;
}

/**
 * Validate OTP format
 * @param {string} otp - OTP to validate
 * @returns {boolean} True if valid OTP format
 */
export function validateOTP(otp) {
  return otp && otp.length === CONFIG.VALIDATION.otpLength && /^\d{6}$/.test(otp);
}

/**
 * Validate bill amount
 * @param {number} amount - Amount to validate
 * @returns {boolean} True if valid amount
 */
export function validateBillAmount(amount) {
  const numAmount = parseFloat(amount);
  return !isNaN(numAmount) && 
         numAmount >= CONFIG.VALIDATION.minBillAmount && 
         numAmount <= CONFIG.VALIDATION.maxBillAmount;
}

/**
 * Validate guest count
 * @param {number} count - Guest count to validate
 * @returns {boolean} True if valid count
 */
export function validateGuestCount(count) {
  const numCount = parseInt(count);
  return !isNaN(numCount) && numCount > 0 && numCount <= CONFIG.VALIDATION.maxBookingGuests;
}

/**
 * Validate ticket count
 * @param {number} count - Ticket count to validate
 * @returns {boolean} True if valid count
 */
export function validateTicketCount(count) {
  const numCount = parseInt(count);
  return !isNaN(numCount) && numCount > 0 && numCount <= CONFIG.VALIDATION.maxBookingTickets;
}

/**
 * Validate date is not in the past
 * @param {string|Date} date - Date to validate
 * @returns {boolean} True if date is valid and not in past
 */
export function validateFutureDate(date) {
  const inputDate = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  return inputDate >= today;
}

/**
 * Validate time format (HH:MM)
 * @param {string} time - Time to validate
 * @returns {boolean} True if valid time format
 */
export function validateTime(time) {
  const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
  return timeRegex.test(time);
}

/**
 * Validate UUID format
 * @param {string} uuid - UUID to validate
 * @returns {boolean} True if valid UUID format
 */
export function validateUUID(uuid) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Validate discount percentage
 * @param {number} percentage - Discount percentage to validate
 * @returns {boolean} True if valid percentage
 */
export function validateDiscountPercentage(percentage) {
  const numPercentage = parseFloat(percentage);
  return !isNaN(numPercentage) && numPercentage >= 0 && numPercentage <= 100;
}

// ==========================================
// COMPOSITE VALIDATORS
// ==========================================

/**
 * Validate booking form data
 * @param {Object} data - Booking form data
 * @returns {Object} Validation result {isValid, errors}
 */
export function validateBookingForm(data) {
  const errors = [];
  
  try {
    validateRequired(data.eventId || data.restaurantId, 'Event/Restaurant');
    validateRequired(data.date, 'Date');
    validateRequired(data.time, 'Time');
    
    if (data.guests) {
      if (!validateGuestCount(data.guests)) {
        errors.push('Invalid guest count');
      }
    }
    
    if (data.tickets) {
      if (!validateTicketCount(data.tickets)) {
        errors.push('Invalid ticket count');
      }
    }
    
    if (!validateFutureDate(data.date)) {
      errors.push('Date cannot be in the past');
    }
    
    if (!validateTime(data.time)) {
      errors.push('Invalid time format');
    }
    
  } catch (error) {
    errors.push(error.message);
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validate user registration form
 * @param {Object} data - Registration form data
 * @returns {Object} Validation result {isValid, errors}
 */
export function validateRegistrationForm(data) {
  const errors = [];
  
  try {
    validateRequired(data.firstName, 'First name');
    validateRequired(data.lastName, 'Last name');
    validateRequired(data.email, 'Email');
    validateRequired(data.password, 'Password');
    validateRequired(data.phone, 'Phone number');
    
    if (!validateEmail(data.email)) {
      errors.push('Invalid email format');
    }
    
    if (!validatePassword(data.password)) {
      errors.push('Password must be at least 6 characters');
    }
    
    if (!validatePhone(data.phone)) {
      errors.push('Invalid phone number format');
    }
    
  } catch (error) {
    errors.push(error.message);
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

// ==========================================
// SANITIZATION FUNCTIONS
// ==========================================

/**
 * Sanitize HTML input
 * @param {string} input - Input string
 * @returns {string} Sanitized string
 */
export function sanitizeHtml(input) {
  if (typeof input !== 'string') return '';
  
  const div = document.createElement('div');
  div.textContent = input;
  return div.innerHTML;
}

/**
 * Sanitize phone number
 * @param {string} phone - Phone number
 * @returns {string} Cleaned phone number
 */
export function sanitizePhone(phone) {
  return phone.replace(/\D/g, '');
}

/**
 * Sanitize email
 * @param {string} email - Email address
 * @returns {string} Trimmed and lowercase email
 */
export function sanitizeEmail(email) {
  return email.trim().toLowerCase();
}

// ==========================================
// EXPORTS
// ==========================================
export default {
  validateRequired,
  validateEmail,
  validatePhone,
  validatePassword,
  validateOTP,
  validateBillAmount,
  validateGuestCount,
  validateTicketCount,
  validateFutureDate,
  validateTime,
  validateUUID,
  validateDiscountPercentage,
  validateBookingForm,
  validateRegistrationForm,
  sanitizeHtml,
  sanitizePhone,
  sanitizeEmail
};




