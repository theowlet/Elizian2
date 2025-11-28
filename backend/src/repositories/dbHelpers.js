/**
 * Database helper utilities
 * @module dbHelpers
 */

const { logError } = require('../../utils/logger');

/**
 * Execute callback within a database transaction
 * Automatically handles BEGIN, COMMIT, and ROLLBACK
 * 
 * @param {Object} pool - PostgreSQL connection pool
 * @param {Function} callback - Async function that receives client and returns result
 * @returns {Promise<any>} Result from callback
 * @throws {Error} Re-throws any error after rollback
 * 
 * @example
 * const result = await withTransaction(pool, async (client) => {
 *   await client.query('INSERT INTO...', [values]);
 *   await client.query('UPDATE...', [values]);
 *   return { success: true };
 * });
 */
async function withTransaction(pool, callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    logError('Transaction rolled back:', err);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Execute callback with a database client (without transaction)
 * Useful for read-only operations
 * 
 * @param {Object} pool - PostgreSQL connection pool
 * @param {Function} callback - Async function that receives client and returns result
 * @returns {Promise<any>} Result from callback
 */
async function withClient(pool, callback) {
  const client = await pool.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

module.exports = {
  withTransaction,
  withClient
};

