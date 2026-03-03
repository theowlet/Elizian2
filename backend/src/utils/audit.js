const { getPool } = require('../config/db');
const { logError } = require('./logger');

const pool = getPool();
let auditColumnsEnsured = false;

function getExecutor(context) {
  if (context && context.client) {
    return context.client;
  }
  return pool;
}

async function ensureAuditColumns(executor) {
  if (auditColumnsEnsured) {
    return;
  }
  try {
    await executor.query(`ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS actor_name TEXT`);
    await executor.query(`ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS entity_name TEXT`);
    await executor.query(`ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS description TEXT`);
    auditColumnsEnsured = true;
  } catch (error) {
    logError('Failed to ensure audit_log columns', error.message || error);
  }
}

async function fetchActorName(actorId, executor) {
  if (!actorId) {
    return 'System';
  }
  try {
    const result = await executor.query(
      `SELECT first_name, last_name, email FROM users WHERE id = $1`,
      [actorId]
    );
    if (result.rowCount === 0) {
      return 'System';
    }
    const row = result.rows[0];
    const name = `${row.first_name || ''} ${row.last_name || ''}`.trim();
    return name || row.email || 'System';
  } catch (error) {
    logError('Failed to fetch actor name', error.message || error);
    return 'System';
  }
}

async function fetchEntityDetails(entityType, entityId, executor) {
  let entityName = `Unknown ${entityType}`;
  const details = {
    entityName,
    offerName: null,
    partnerName: null,
    userName: null
  };

  try {
    if (entityType === 'offer') {
      const result = await executor.query(
        `SELECT po.title AS offer_name, p.name AS partner_name
         FROM partner_offers po
         LEFT JOIN partners p ON p.id = po.partner_id
         WHERE po.id = $1`,
        [entityId]
      );
      if (result.rowCount > 0) {
        const row = result.rows[0];
        details.offerName = row.offer_name || 'Unnamed Deal';
        details.partnerName = row.partner_name || 'Unknown Partner';
        entityName = `'${details.offerName}' (Partner: ${details.partnerName})`;
      }
    } else if (entityType === 'partner') {
      const result = await executor.query(
        `SELECT name FROM partners WHERE id = $1`,
        [entityId]
      );
      if (result.rowCount > 0) {
        details.partnerName = result.rows[0].name || 'Unknown Partner';
        entityName = details.partnerName;
      }
    } else if (entityType === 'user') {
      const result = await executor.query(
        `SELECT first_name, last_name, email FROM users WHERE id = $1`,
        [entityId]
      );
      if (result.rowCount > 0) {
        const row = result.rows[0];
        const fullName = `${row.first_name || ''} ${row.last_name || ''}`.trim();
        details.userName = fullName || row.email || 'Unknown User';
        entityName = details.userName;
      }
    } else if (entityType === 'booking') {
      const result = await executor.query(
        `SELECT b.booking_reference, po.title AS deal_title, p.name AS partner_name
         FROM bookings b
         LEFT JOIN partner_offers po ON b.deal_id = po.id
         LEFT JOIN partners p ON b.partner_id = p.id
         WHERE b.id = $1`,
        [entityId]
      );
      if (result.rowCount > 0) {
        const row = result.rows[0];
        const ref = row.booking_reference || entityId?.toString?.()?.slice(0, 8) || 'N/A';
        const deal = row.deal_title || 'Deal';
        const partner = row.partner_name || 'Partner';
        entityName = `Booking ${ref} (${deal} @ ${partner})`;
      }
    }
  } catch (error) {
    logError('Failed to fetch entity details', error.message || error);
  }

  details.entityName = entityName;
  return details;
}

function formatActionPhrase(action) {
  if (!action) return 'performed an action on';
  const normalized = action.replace(/_/g, ' ').trim();
  const replacements = {
    approve: 'approved',
    approved: 'approved',
    reject: 'rejected',
    rejected: 'rejected',
    suspend: 'suspended',
    suspended: 'suspended',
    request: 'requested',
    requested: 'requested',
    'partner request': 'requested',
    'admin approve': 'approved',
    'admin reject': 'rejected'
  };

  if (replacements[normalized]) {
    return replacements[normalized];
  }

  const words = normalized.split(' ');
  const mapped = words.map((word) => replacements[word] || word);
  return mapped.join(' ');
}

function buildDescription(actorName, action, entityType, entityDetails, changes = {}) {
  const verb = formatActionPhrase(action);
  if (entityType === 'user' && action === 'user_tier_change' && (changes.previous || changes.next)) {
    const userName = entityDetails.userName || entityDetails.entityName || 'Unknown User';
    return `${actorName} changed tier for user '${userName}' (${changes.previous || '?'} → ${changes.next || '?'})`;
  }
  if (entityType === 'offer') {
    const offerName = entityDetails.offerName || entityDetails.entityName || 'the deal';
    const partnerName = entityDetails.partnerName || 'Unknown Partner';
    return `${actorName} ${verb} deal '${offerName}' by Partner ${partnerName}`;
  }

  if (entityType === 'partner') {
    const partnerName = entityDetails.partnerName || entityDetails.entityName || 'Unknown Partner';
    return `${actorName} ${verb} partner '${partnerName}'`;
  }

  if (entityType === 'user') {
    const userName = entityDetails.userName || entityDetails.entityName || 'Unknown User';
    return `${actorName} ${verb} user '${userName}'`;
  }

  if (entityType === 'booking') {
    return `${actorName} cancelled booking ${entityDetails.entityName}`;
  }

  return `${actorName} ${verb} ${entityType} '${entityDetails.entityName}'`;
}

async function createAuditLogEntry(actorId, action, entityType, entityId, changes = {}) {
  const executor = getExecutor(this);
  const actorRole = (this && this.actorRole) || null;

  await ensureAuditColumns(executor);

  const actorName = await fetchActorName(actorId, executor);
  const entityDetails = await fetchEntityDetails(entityType, entityId, executor);
  const description = buildDescription(actorName, action, entityType, entityDetails, changes);

  const metaPayload = {
    previous: changes.previous || null,
    next: changes.next || null
  };

  Object.keys(changes || {}).forEach((key) => {
    if (key !== 'previous' && key !== 'next') {
      metaPayload[key] = changes[key];
    }
  });

  try {
    await executor.query(
      `INSERT INTO audit_log (
        actor_user_id,
        actor_role,
        actor_name,
        action,
        entity_type,
        entity_id,
        entity_name,
        description,
        meta,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
      [
        actorId || null,
        actorRole || null,
        actorName,
        action,
        entityType,
        entityId,
        entityDetails.entityName,
        description,
        JSON.stringify(metaPayload)
      ]
    );
  } catch (error) {
    logError('audit_log insert failed', error.message || error);
  }
}

async function writeAudit(actorUserId, actorRole, action, entityType, entityId, meta = {}) {
  const context = { actorRole };
  const changes = {
    previous: meta.previous || meta.before || null,
    next: meta.next || meta.after || null
  };
  if (meta.context) {
    changes.context = meta.context;
  }
  return createAuditLogEntry.call(context, actorUserId, action, entityType, entityId, changes);
}

/**
 * Write audit log using a specific executor (e.g. transaction client).
 * Use when the audit must run within the same transaction.
 */
async function writeAuditWithExecutor(executor, actorUserId, actorRole, action, entityType, entityId, meta = {}) {
  const context = { client: executor, actorRole };
  const changes = {
    previous: meta.previous || meta.before || null,
    next: meta.next || meta.after || null
  };
  Object.keys(meta || {}).forEach((key) => {
    if (!['previous', 'next', 'before', 'after', 'context'].includes(key)) {
      changes[key] = meta[key];
    }
  });
  if (meta.context) {
    changes.context = meta.context;
  }
  return createAuditLogEntry.call(context, actorUserId, action, entityType, entityId, changes);
}

module.exports = {
  writeAudit,
  writeAuditWithExecutor,
  createAuditLogEntry
};

