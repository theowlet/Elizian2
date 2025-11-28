const config = require('../src/config/env');
const { log, logError } = require('./logger');

let redisClient = null;
const memoryCache = new Map();

async function initRedis() {
  if (!config.redis.url || redisClient) {
    return;
  }

  try {
    // eslint-disable-next-line global-require
    const Redis = require('ioredis');
    redisClient = new Redis(config.redis.url, {
      lazyConnect: true
    });
    redisClient.on('error', (err) => {
      logError('⚠️ Redis error:', err.message || err);
    });
    await redisClient.connect();
    log('⚡ Connected to Redis cache');
  } catch (err) {
    logError('⚠️ Redis unavailable, falling back to in-memory cache:', err.message || err);
    redisClient = null;
  }
}

async function get(key) {
  if (redisClient) {
    const raw = await redisClient.get(key);
    return raw ? JSON.parse(raw) : null;
  }

  const entry = memoryCache.get(key);
  if (!entry) {
    return null;
  }

  if (entry.expiry && entry.expiry < Date.now()) {
    memoryCache.delete(key);
    return null;
  }

  return entry.value;
}

async function set(key, value, ttlSeconds = 60) {
  if (redisClient) {
    const payload = JSON.stringify(value);
    if (ttlSeconds) {
      await redisClient.set(key, payload, 'EX', ttlSeconds);
    } else {
      await redisClient.set(key, payload);
    }
    return;
  }

  memoryCache.set(key, {
    value,
    expiry: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null
  });
}

async function del(key) {
  if (redisClient) {
    await redisClient.del(key);
    return;
  }
  memoryCache.delete(key);
}

module.exports = {
  initRedis,
  get,
  set,
  del
};

