/**
 * Audit logging utilities
 * @module audit
 */

const { getPool } = require('../src/config/db');
const { log, logError } = require('./logger');

const pool = getPool();

/**
 * Create an audit log entry with actor and entity details
 * 
 * @param {string} actorId - UUID of user performing the action
 * @param {string} action - Action performed (e.g., 'approve_deal', 'reject_partner')
 * @param {string} entityType - Type of entity (e.g., 'deal', 'partner', 'offer')
 * @param {string} entityId - UUID of the entity affected
 * @param {Object} changes - Object with previous and next states
 * @param {Object} options - Optional parameters
 * @param {Object} options.client - Database client for transactions
 * @returns {Promise<Object>} Created audit log entry
 * 
 * @example
 * await createAuditLogEntry(
 *   userId,
 *   'approve_deal',
 *   'deal',
 *   dealId,
 *   {
 *     previous: { status: 'pending_approval', is_active: false },
 *     next: { status: 'active', is_active: true }
 *   }
 * );
 */
async function createAuditLogEntry(actorId, action, entityType, entityId, changes = {}, options = {}) {
  const client = options.client || pool;
  
  try {
    // Get actor name
    let actorName = 'System';
    if (actorId) {
      const actorResult = await client.query(
        'SELECT first_name, last_name, email FROM users WHERE id = $1',
        [actorId]
      );
      if (actorResult.rows.length > 0) {
        const actor = actorResult.rows[0];
        actorName = `${actor.first_name || ''} ${actor.last_name || ''}`.trim() || actor.email || 'Unknown';
      }
    }
    
    // Get entity name based on type
    let entityName = entityId;
    try {
      let entityResult;
      switch (entityType.toLowerCase()) {
        case 'deal':
        case 'offer':
          entityResult = await client.query(
            'SELECT title FROM partner_offers WHERE id = $1',
            [entityId]
          );
          entityName = entityResult.rows[0]?.title || entityId;
          break;
          
        case 'partner':
          entityResult = await client.query(
            'SELECT name FROM partners WHERE id = $1',
            [entityId]
          );
          entityName = entityResult.rows[0]?.name || entityId;
          break;
          
        case 'user':
          entityResult = await client.query(
            'SELECT first_name, last_name, email FROM users WHERE id = $1',
            [entityId]
          );
          if (entityResult.rows.length > 0) {
            const user = entityResult.rows[0];
            entityName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email || entityId;
          }
          break;
          
        default:
          // Keep entityId as entityName for unknown types
          break;
      }
    } catch (nameError) {
      logError(`Could not fetch entity name for ${entityType} ${entityId}:`, nameError);
      // Continue with entityId as name
    }
    
    // Create audit log entry
    const result = await client.query(
      `INSERT INTO audit_logs (
        actor_id,
        actor_name,
        action,
        entity_type,
        entity_id,
        entity_name,
        meta,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING *`,
      [
        actorId || null,
        actorName,
        action,
        entityType,
        entityId,
        entityName,
        JSON.stringify({
          previous: changes.previous || null,
          next: changes.next || null,
          ...changes  // Include any additional metadata
        })
      ]
    );
    
    log(`📝 Audit: ${actorName} performed ${action} on ${entityType} ${entityName}`);
    
    return result.rows[0];
    
  } catch (error) {
    logError('Failed to create audit log entry:', error);
    // Don't throw - audit logging shouldn't break main operations
    return null;
  }
}

/**
 * Get audit logs for an entity
 * 
 * @param {string} entityType - Type of entity
 * @param {string} entityId - UUID of entity
 * @param {Object} options - Optional parameters
 * @param {number} options.limit - Maximum number of logs to return
 * @returns {Promise<Array>} Array of audit log entries
 */
async function getAuditLogs(entityType, entityId, options = {}) {
  const limit = options.limit || 50;
  
  const result = await pool.query(
    `SELECT * FROM audit_logs
     WHERE entity_type = $1 AND entity_id = $2
     ORDER BY created_at DESC
     LIMIT $3`,
    [entityType, entityId, limit]
  );
  
  return result.rows;
}

/**
 * Get recent audit logs for an actor
 * 
 * @param {string} actorId - UUID of actor
 * @param {Object} options - Optional parameters
 * @param {number} options.limit - Maximum number of logs to return
 * @returns {Promise<Array>} Array of audit log entries
 */
async function getActorAuditLogs(actorId, options = {}) {
  const limit = options.limit || 50;
  
  const result = await pool.query(
    `SELECT * FROM audit_logs
     WHERE actor_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [actorId, limit]
  );
  
  return result.rows;
}

module.exports = {
  createAuditLogEntry,
  getAuditLogs,
  getActorAuditLogs
};

