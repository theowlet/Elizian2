const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const Module = require('module');

const middlewarePath = require.resolve('../src/middleware/authenticateApiKey');

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function loadMiddlewareWithRepo(repoMock) {
  const originalLoad = Module._load;

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === '../repositories/developerApiKeyRepository') {
      return repoMock;
    }
    if (request === '../../utils/logger') {
      return { logError: () => {} };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  delete require.cache[middlewarePath];
  const middleware = require(middlewarePath);
  Module._load = originalLoad;
  return middleware.authenticateApiKey;
}

function createRes() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.payload = data;
      return this;
    }
  };
}

test('rejects query-string api_key when header is missing', async () => {
  const authenticateApiKey = loadMiddlewareWithRepo({
    findByPrefix: async () => null,
    recordUsage: async () => {}
  });
  const req = {
    headers: {},
    query: { api_key: '12345678abcdef9012345678abcdef90' }
  };
  const res = createRes();
  let calledNext = false;

  await authenticateApiKey(req, res, () => {
    calledNext = true;
  });

  assert.equal(calledNext, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.payload.success, false);
  assert.match(res.payload.error, /X-API-Key header/);
});

test('rejects short api key before repository lookup', async () => {
  let findByPrefixCalls = 0;
  const authenticateApiKey = loadMiddlewareWithRepo({
    findByPrefix: async () => {
      findByPrefixCalls += 1;
      return null;
    },
    recordUsage: async () => {}
  });
  const req = {
    headers: { 'x-api-key': 'short' },
    query: {}
  };
  const res = createRes();

  await authenticateApiKey(req, res, () => {});

  assert.equal(res.statusCode, 401);
  assert.equal(res.payload.success, false);
  assert.equal(res.payload.error, 'Invalid API key');
  assert.equal(findByPrefixCalls, 0);
});

test('accepts valid x-api-key header and populates req.apiKey', async () => {
  const rawKey = '12345678abcdef9012345678abcdef90';
  const row = {
    id: 12,
    user_id: 'user-12',
    key_hash: sha256(rawKey),
    scopes: ['vouchers:validate'],
    rate_limit_per_min: 60
  };
  let usageRecorded = false;

  const authenticateApiKey = loadMiddlewareWithRepo({
    findByPrefix: async (prefix) => {
      assert.equal(prefix, rawKey.slice(0, 8));
      return row;
    },
    recordUsage: async (id) => {
      assert.equal(id, row.id);
      usageRecorded = true;
    }
  });
  const req = {
    headers: { 'x-api-key': rawKey },
    query: {}
  };
  const res = createRes();
  let calledNext = false;

  await authenticateApiKey(req, res, () => {
    calledNext = true;
  });

  assert.equal(calledNext, true);
  assert.equal(res.statusCode, 200);
  assert.equal(req.apiKey.id, row.id);
  assert.equal(req.apiKey.userId, row.user_id);
  assert.equal(usageRecorded, true);
});
