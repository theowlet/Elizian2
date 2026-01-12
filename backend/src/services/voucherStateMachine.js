/**
 * Voucher State Machine Service
 * Enforces strict voucher lifecycle: CREATED → BOOKED → ACTIVE → REDEEMED → SETTLED → CLOSED
 */

const { getPool } = require('../config/db');
const { AppError } = require('../../utils/response');
const { log, logError } = require('../../utils/logger');

const pool = getPool();

// Valid state transitions
const VALID_TRANSITIONS = {
  'created': ['booked'],
  'booked': ['active', 'cancelled'],
  'active': ['redeemed', 'expired', 'cancelled'],
  'redeemed': ['settled', 'disputed'],
  'settled': ['closed'],
  'disputed': ['settled', 'closed'],
  'cancelled': ['closed'],
  'expired': ['closed'],
  'closed': [] // Terminal state
};

/**
 * Validate state transition
 * @param {string} fromState - Current state
 * @param {string} toState - Target state
 * @returns {boolean} True if valid transition
 */
function isValidTransition(fromState, toState) {
  if (!fromState || !toState) return false;
  const allowedStates = VALID_TRANSITIONS[fromState.toLowerCase()] || [];
  return allowedStates.includes(toState.toLowerCase());
}

/**
 * Transition voucher state with audit logging
 * @param {Object} params - Transition parameters
 * @param {string} params.bookingId - Booking ID
 * @param {string} params.voucherCode - Voucher code
 * @param {string} params.fromState - Current state
 * @param {string} params.toState - Target state
 * @param {string} params.actorId - Actor ID (user/partner/admin)
 * @param {string} params.actorRole - Actor role ('user', 'partner', 'admin', 'system')
 * @param {string} params.reasonCode - Reason code (optional)
 * @param {string} params.reasonText - Reason text (optional)
 * @param {Object} params.metadata - Additional metadata (optional)
 * @param {Object} params.executor - Database client (for transactions)
 * @returns {Object} Transition record
 */
async function transitionState({
  bookingId,
  voucherCode,
  fromState,
  toState,
  actorId,
  actorRole,
  reasonCode = null,
  reasonText = null,
  metadata = {},
  executor = pool
}) {
  // Validate transition
  if (!isValidTransition(fromState, toState)) {
    throw new AppError(400, `Invalid state transition from '${fromState}' to '${toState}'`);
  }

  // Validate actor role
  const validRoles = ['user', 'partner', 'admin', 'system'];
  if (!validRoles.includes(actorRole)) {
    throw new AppError(400, `Invalid actor role: ${actorRole}`);
  }

  try {
    // Log state transition
    const transitionResult = await executor.query(
      `SELECT log_voucher_state_transition(
        $1::UUID, $2::UUID, $3::VARCHAR, $4::VARCHAR,
        $5::UUID, $6::VARCHAR, $7::VARCHAR, $8::TEXT, $9::JSONB
      ) AS transition_id`,
      [
        bookingId,
        voucherCode,
        fromState,
        toState,
        actorId,
        actorRole,
        reasonCode,
        reasonText,
        JSON.stringify(metadata)
      ]
    );

    const transitionId = transitionResult.rows[0].transition_id;

    // Update booking voucher_state
    await executor.query(
      `UPDATE bookings 
       SET voucher_state = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [toState, bookingId]
    );

    log(`✅ Voucher state transition: ${fromState} → ${toState} (Booking: ${bookingId}, Actor: ${actorRole})`);

    return {
      transition_id: transitionId,
      from_state: fromState,
      to_state: toState,
      transitioned_at: new Date()
    };
  } catch (error) {
    logError('❌ State transition error:', error);
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(500, `State transition failed: ${error.message}`);
  }
}

/**
 * Get current voucher state
 * @param {string} bookingId - Booking ID
 * @param {Object} executor - Database client (optional)
 * @returns {string} Current state
 */
async function getCurrentState(bookingId, executor = pool) {
  try {
    const result = await executor.query(
      `SELECT voucher_state, status FROM bookings WHERE id = $1`,
      [bookingId]
    );

    if (result.rows.length === 0) {
      throw new AppError(404, 'Booking not found');
    }

    return result.rows[0].voucher_state || result.rows[0].status || 'created';
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    logError('❌ Get current state error:', error);
    throw new AppError(500, `Failed to get current state: ${error.message}`);
  }
}

/**
 * Get state transition history
 * @param {string} bookingId - Booking ID
 * @param {number} limit - Limit results
 * @returns {Array} Transition history
 */
async function getStateHistory(bookingId, limit = 50) {
  try {
    const result = await pool.query(
      `SELECT * FROM voucher_state_transitions
       WHERE booking_id = $1
       ORDER BY transitioned_at DESC
       LIMIT $2`,
      [bookingId, limit]
    );

    return result.rows;
  } catch (error) {
    logError('❌ Get state history error:', error);
    throw new AppError(500, `Failed to get state history: ${error.message}`);
  }
}

module.exports = {
  isValidTransition,
  transitionState,
  getCurrentState,
  getStateHistory,
  VALID_TRANSITIONS
};

