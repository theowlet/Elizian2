const { getPool } = require('../config/db');
const { logError, log } = require('../../utils/logger');

const pool = getPool();

/**
 * Mark expired vouchers as expired
 * Run this job daily via cron
 */
async function markExpiredVouchers() {
  try {
    const result = await pool.query(
      `UPDATE vouchers 
       SET status = 'expired', updated_at = NOW()
       WHERE status = 'active' 
       AND expires_at < NOW()
       RETURNING id, code`
    );
    
    if (result.rowCount > 0) {
      log(`✅ Marked ${result.rowCount} vouchers as expired`);
      return { expired: result.rowCount, codes: result.rows.map(r => r.code) };
    }
    
    return { expired: 0 };
  } catch (err) {
    logError('❌ Failed to mark expired vouchers:', err);
    throw err;
  }
}

module.exports = { markExpiredVouchers };

