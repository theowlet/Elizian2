/**
 * Account Deletion Service
 * 
 * Handles permanent account deletion in compliance with:
 * - Google Play Store policies
 * - Apple App Store policies
 * - GDPR Article 17 (Right to Erasure)
 * - California Consumer Privacy Act (CCPA)
 */

const { getPool } = require('../config/db');
const { AppError } = require('../utils/response');
const { log, logError } = require('../utils/logger');

const pool = getPool();

/**
 * Initiate account deletion request
 * 
 * Creates a deletion request with 30-day grace period
 * User can cancel during this period
 * 
 * @param {string} userId - User ID to delete
 * @param {string} reason - Reason for deletion (optional)
 * @returns {Object} Deletion request details
 */
async function requestAccountDeletion(userId, reason = null) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Check if user exists
    const userCheck = await client.query(
      'SELECT id, email, first_name, last_name, available_tokens FROM users WHERE id = $1',
      [userId]
    );
    
    if (userCheck.rows.length === 0) {
      throw new AppError(404, 'User not found');
    }
    
    const user = userCheck.rows[0];
    
    // Check for existing pending deletion request
    const existingRequest = await client.query(
      `SELECT id, status, scheduled_deletion_date 
       FROM account_deletion_requests 
       WHERE user_id = $1 AND status = 'pending'`,
      [userId]
    );
    
    if (existingRequest.rows.length > 0) {
      const existing = existingRequest.rows[0];
      return {
        message: 'Account deletion already scheduled',
        request_id: existing.id,
        scheduled_deletion_date: existing.scheduled_deletion_date,
        status: 'pending',
        can_cancel: true
      };
    }
    
    // Calculate deletion date (30 days from now for grace period)
    const scheduledDeletionDate = new Date();
    scheduledDeletionDate.setDate(scheduledDeletionDate.getDate() + 30);
    
    // Create deletion request
    const requestResult = await client.query(
      `INSERT INTO account_deletion_requests (
        user_id,
        email,
        reason,
        scheduled_deletion_date,
        status,
        requested_at
      ) VALUES ($1, $2, $3, $4, 'pending', NOW())
      RETURNING id, scheduled_deletion_date`,
      [userId, user.email, reason, scheduledDeletionDate]
    );
    
    const deletionRequest = requestResult.rows[0];
    
    // Mark user account as pending deletion
    await client.query(
      `UPDATE users 
       SET deletion_scheduled = true,
           deletion_scheduled_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [userId]
    );
    
    // Log the deletion request
    await client.query(
      `INSERT INTO audit_log (
        action,
        entity_type,
        entity_id,
        actor_user_id,
        actor_role,
        meta
      ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        'account_deletion_requested',
        'user',
        userId,
        userId,
        'user',
        JSON.stringify({
          email: user.email,
          reason: reason || 'Not provided',
          scheduled_date: scheduledDeletionDate,
          grace_period_days: 30
        })
      ]
    );
    
    await client.query('COMMIT');
    
    log(`Account deletion requested for user ${userId} (${user.email})`);
    
    return {
      message: 'Account deletion scheduled successfully',
      request_id: deletionRequest.id,
      scheduled_deletion_date: deletionRequest.scheduled_deletion_date,
      grace_period_days: 30,
      status: 'pending',
      can_cancel: true,
      warning: 'You have 30 days to cancel this request. After that, your account and all associated data will be permanently deleted.'
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Cancel account deletion request
 * 
 * Allows user to cancel deletion within grace period
 * 
 * @param {string} userId - User ID
 * @returns {Object} Cancellation confirmation
 */
async function cancelAccountDeletion(userId) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Find pending deletion request
    const requestResult = await client.query(
      `SELECT id, scheduled_deletion_date 
       FROM account_deletion_requests 
       WHERE user_id = $1 AND status = 'pending'`,
      [userId]
    );
    
    if (requestResult.rows.length === 0) {
      throw new AppError(404, 'No pending deletion request found');
    }
    
    // Update deletion request status
    await client.query(
      `UPDATE account_deletion_requests 
       SET status = 'cancelled',
           cancelled_at = NOW()
       WHERE user_id = $1 AND status = 'pending'`,
      [userId]
    );
    
    // Remove deletion flag from user account
    await client.query(
      `UPDATE users 
       SET deletion_scheduled = false,
           deletion_scheduled_at = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [userId]
    );
    
    // Log the cancellation
    await client.query(
      `INSERT INTO audit_log (
        action,
        entity_type,
        entity_id,
        actor_user_id,
        actor_role
      ) VALUES ($1, $2, $3, $4, $5)`,
      ['account_deletion_cancelled', 'user', userId, userId, 'user']
    );
    
    await client.query('COMMIT');
    
    log(`Account deletion cancelled for user ${userId}`);
    
    return {
      message: 'Account deletion cancelled successfully',
      status: 'cancelled'
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Execute permanent account deletion
 * 
 * Called by scheduled job after grace period expires
 * Permanently deletes all user data
 * 
 * @param {string} userId - User ID to delete
 * @returns {Object} Deletion summary
 */
async function executeAccountDeletion(userId) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Get user info before deletion
    const userResult = await client.query(
      'SELECT id, email, first_name, last_name FROM users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      throw new AppError(404, 'User not found');
    }
    
    const user = userResult.rows[0];
    const deletionSummary = {
      user_id: userId,
      email: user.email,
      deleted_at: new Date(),
      data_deleted: {}
    };
    
    // 1. Delete loyalty points
    const loyaltyResult = await client.query(
      'DELETE FROM loyalty_points WHERE user_id = $1 RETURNING id',
      [userId]
    );
    deletionSummary.data_deleted.loyalty_points = loyaltyResult.rowCount;
    
    // 2. Delete loyalty activity
    const activityResult = await client.query(
      'DELETE FROM loyalty_activity WHERE user_id = $1 RETURNING id',
      [userId]
    );
    deletionSummary.data_deleted.loyalty_activity = activityResult.rowCount;
    
    // 3. Delete token ledger entries
    const tokenResult = await client.query(
      'DELETE FROM token_ledger WHERE user_id = $1 RETURNING id',
      [userId]
    );
    deletionSummary.data_deleted.token_ledger = tokenResult.rowCount;
    
    // 4. Delete transactions
    const transactionResult = await client.query(
      'DELETE FROM transactions WHERE user_id = $1 RETURNING id',
      [userId]
    );
    deletionSummary.data_deleted.transactions = transactionResult.rowCount;
    
    // 5. Delete bookings (or anonymize if needed for record-keeping)
    const bookingResult = await client.query(
      `UPDATE bookings 
       SET user_id = NULL,
           special_requests = '[DELETED USER]',
           updated_at = NOW()
       WHERE user_id = $1 
       RETURNING id`,
      [userId]
    );
    deletionSummary.data_deleted.bookings_anonymized = bookingResult.rowCount;
    
    // 6. Delete OTP sessions
    const otpResult = await client.query(
      'DELETE FROM otp_sessions WHERE phone_number IN (SELECT phone_number FROM users WHERE id = $1) RETURNING id',
      [userId]
    );
    deletionSummary.data_deleted.otp_sessions = otpResult.rowCount;
    
    // 7. Delete user preferences/settings (if table exists)
    try {
      const prefsResult = await client.query(
        'DELETE FROM user_preferences WHERE user_id = $1 RETURNING id',
        [userId]
      );
      deletionSummary.data_deleted.user_preferences = prefsResult.rowCount;
    } catch (err) {
      // Table might not exist
      deletionSummary.data_deleted.user_preferences = 0;
    }
    
    // 8. Update deletion request status
    await client.query(
      `UPDATE account_deletion_requests 
       SET status = 'completed',
           deleted_at = NOW()
       WHERE user_id = $1`,
      [userId]
    );
    
    // 9. Final audit log before deleting user
    await client.query(
      `INSERT INTO audit_log (
        action,
        entity_type,
        entity_id,
        actor_user_id,
        actor_role,
        meta
      ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        'account_permanently_deleted',
        'user',
        userId,
        null, // System action
        'system',
        JSON.stringify(deletionSummary)
      ]
    );
    
    // 10. Finally, delete the user account
    await client.query('DELETE FROM users WHERE id = $1', [userId]);
    
    await client.query('COMMIT');
    
    log(`Account permanently deleted for user ${userId} (${user.email})`);
    
    return deletionSummary;
  } catch (err) {
    await client.query('ROLLBACK');
    logError('Failed to execute account deletion:', err);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Get account deletion status
 * 
 * @param {string} userId - User ID
 * @returns {Object} Deletion status
 */
async function getAccountDeletionStatus(userId) {
  const result = await pool.query(
    `SELECT 
      id,
      status,
      scheduled_deletion_date,
      requested_at,
      cancelled_at,
      deleted_at
     FROM account_deletion_requests 
     WHERE user_id = $1 
     ORDER BY requested_at DESC 
     LIMIT 1`,
    [userId]
  );
  
  if (result.rows.length === 0) {
    return {
      has_pending_deletion: false,
      status: 'active'
    };
  }
  
  const request = result.rows[0];
  const now = new Date();
  const scheduledDate = new Date(request.scheduled_deletion_date);
  const daysRemaining = Math.ceil((scheduledDate - now) / (1000 * 60 * 60 * 24));
  
  return {
    has_pending_deletion: request.status === 'pending',
    status: request.status,
    scheduled_deletion_date: request.scheduled_deletion_date,
    days_remaining: daysRemaining > 0 ? daysRemaining : 0,
    can_cancel: request.status === 'pending' && daysRemaining > 0,
    requested_at: request.requested_at,
    cancelled_at: request.cancelled_at,
    deleted_at: request.deleted_at
  };
}

/**
 * Process pending deletions (called by cron job)
 * 
 * Executes deletions for accounts past grace period
 */
async function processPendingDeletions() {
  try {
    // Find accounts scheduled for deletion
    const result = await pool.query(
      `SELECT user_id 
       FROM account_deletion_requests 
       WHERE status = 'pending' 
       AND scheduled_deletion_date <= NOW()`
    );
    
    const deletionResults = [];
    
    for (const row of result.rows) {
      try {
        const summary = await executeAccountDeletion(row.user_id);
        deletionResults.push({
          user_id: row.user_id,
          success: true,
          summary
        });
      } catch (err) {
        logError(`Failed to delete account ${row.user_id}:`, err);
        deletionResults.push({
          user_id: row.user_id,
          success: false,
          error: err.message
        });
      }
    }
    
    log(`Processed ${deletionResults.length} pending account deletions`);
    
    return deletionResults;
  } catch (err) {
    logError('Failed to process pending deletions:', err);
    throw err;
  }
}

module.exports = {
  requestAccountDeletion,
  cancelAccountDeletion,
  executeAccountDeletion,
  getAccountDeletionStatus,
  processPendingDeletions
};

