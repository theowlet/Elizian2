/**
 * Redemption Validation Service
 * Validates time-based rules, day-of-week restrictions, blackout dates, etc.
 */

const { getPool } = require('../config/db');
const { AppError } = require('../../utils/response');
const { logError } = require('../../utils/logger');

const pool = getPool();

/**
 * Validate redemption against time-based rules
 * @param {Object} params - Validation parameters
 * @param {string} params.bookingId - Booking ID
 * @param {string} params.partnerId - Partner ID
 * @param {string} params.offerId - Offer ID
 * @param {Date} params.redemptionDate - Date of redemption attempt
 * @param {string} params.redemptionTime - Time of redemption attempt (HH:MM format)
 * @param {Object} executor - Database client (optional)
 * @returns {Object} Validation result
 */
async function validateRedemptionRules({
  bookingId,
  partnerId,
  offerId,
  redemptionDate = new Date(),
  redemptionTime = null,
  executor = pool
}) {
  const validationErrors = [];
  const warnings = [];

  try {
    // Get applicable rules (partner-level and offer-level)
    const rulesQuery = `
      SELECT * FROM redemption_rules
      WHERE is_active = true
        AND (
          (partner_id = $1 AND offer_id IS NULL) OR
          (offer_id = $2)
        )
      ORDER BY priority DESC, created_at DESC
    `;

    const rulesResult = await executor.query(rulesQuery, [partnerId, offerId]);
    const rules = rulesResult.rows;

    if (rules.length === 0) {
      // No rules = all redemptions allowed
      return { valid: true, errors: [], warnings: [] };
    }

    const redemptionDateTime = new Date(redemptionDate);
    if (redemptionTime) {
      const [hours, minutes] = redemptionTime.split(':');
      redemptionDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    }

    const dayOfWeek = redemptionDateTime.getDay(); // 0 = Sunday, 6 = Saturday
    const timeOnly = redemptionTime || `${redemptionDateTime.getHours().toString().padStart(2, '0')}:${redemptionDateTime.getMinutes().toString().padStart(2, '0')}`;

    // Check each rule
    for (const rule of rules) {
      switch (rule.rule_type) {
        case 'day_of_week':
          if (rule.allowed_days && rule.allowed_days.length > 0) {
            if (!rule.allowed_days.includes(dayOfWeek)) {
              const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
              validationErrors.push({
                rule_type: 'day_of_week',
                message: `Redemption not allowed on ${dayNames[dayOfWeek]}. Allowed days: ${rule.allowed_days.map(d => dayNames[d]).join(', ')}`,
                rule_id: rule.id
              });
            }
          }
          break;

        case 'time_slot':
          if (rule.allowed_time_start && rule.allowed_time_end) {
            if (timeOnly < rule.allowed_time_start || timeOnly > rule.allowed_time_end) {
              validationErrors.push({
                rule_type: 'time_slot',
                message: `Redemption not allowed at ${timeOnly}. Allowed time slot: ${rule.allowed_time_start} - ${rule.allowed_time_end}`,
                rule_id: rule.id
              });
            }
          }
          break;

        case 'blackout_date':
          if (rule.blackout_dates && rule.blackout_dates.length > 0) {
            const redemptionDateStr = redemptionDateTime.toISOString().split('T')[0];
            if (rule.blackout_dates.includes(redemptionDateStr)) {
              validationErrors.push({
                rule_type: 'blackout_date',
                message: `Redemption not allowed on ${redemptionDateStr} (blackout date)`,
                rule_id: rule.id
              });
            }
          }
          break;

        case 'validity_window':
          if (rule.validity_start_date || rule.validity_end_date) {
            const redemptionDateStr = redemptionDateTime.toISOString().split('T')[0];
            if (rule.validity_start_date && redemptionDateStr < rule.validity_start_date) {
              validationErrors.push({
                rule_type: 'validity_window',
                message: `Redemption not allowed before ${rule.validity_start_date}`,
                rule_id: rule.id
              });
            }
            if (rule.validity_end_date && redemptionDateStr > rule.validity_end_date) {
              validationErrors.push({
                rule_type: 'validity_window',
                message: `Redemption not allowed after ${rule.validity_end_date}`,
                rule_id: rule.id
              });
            }
          }
          break;
      }
    }

    const isValid = validationErrors.length === 0;

    return {
      valid: isValid,
      errors: validationErrors,
      warnings: warnings
    };
  } catch (error) {
    logError('❌ Redemption validation error:', error);
    throw new AppError(500, `Validation failed: ${error.message}`);
  }
}

/**
 * Validate voucher is within validity window
 * @param {Object} booking - Booking object
 * @param {Date} redemptionDate - Redemption date
 * @returns {boolean} True if valid
 */
function validateValidityWindow(booking, redemptionDate = new Date()) {
  // Check if booking has expiry
  if (booking.expires_at) {
    return new Date(redemptionDate) <= new Date(booking.expires_at);
  }

  // Check if offer has expiry
  if (booking.offer_end_date) {
    return new Date(redemptionDate) <= new Date(booking.offer_end_date);
  }

  // No expiry = always valid
  return true;
}

module.exports = {
  validateRedemptionRules,
  validateValidityWindow
};

