const crypto = require('crypto');
const developerApiKeyRepository = require('../repositories/developerApiKeyRepository');
const { logError } = require('../../utils/logger');

function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

async function authenticateApiKey(req, res, next) {
  const rawKey = req.headers['x-api-key'];
  if (!rawKey || typeof rawKey !== 'string') {
    return res.status(401).json({ success: false, error: 'API key required (X-API-Key header)' });
  }
  const key = rawKey.trim();
  if (key.length < 16) {
    return res.status(401).json({ success: false, error: 'Invalid API key' });
  }
  const prefix = key.slice(0, 8);
  try {
    const row = await developerApiKeyRepository.findByPrefix(prefix);
    if (!row) {
      return res.status(401).json({ success: false, error: 'Invalid API key' });
    }
    const expectedHash = hashKey(key);
    if (expectedHash !== row.key_hash) {
      return res.status(401).json({ success: false, error: 'Invalid API key' });
    }
    req.apiKey = { id: row.id, userId: row.user_id, scopes: row.scopes || [], rateLimitPerMin: row.rate_limit_per_min };
    await developerApiKeyRepository.recordUsage(row.id);
    next();
  } catch (err) {
    logError('API key auth error', err);
    res.status(500).json({ success: false, error: 'Authentication failed' });
  }
}

module.exports = { authenticateApiKey, hashKey };
