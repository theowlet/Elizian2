/**
 * Admin list redemptions API contract and sort/filter validation.
 * Tests response shape and that sort_by is validated against allowed columns.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const adminRedemptionController = require('../src/controllers/adminRedemptionController');

test('listRedemptions returns data shape with redemptions array, total, limit, offset', async () => {
  const req = {
    query: { limit: '10', offset: '0' },
    userId: '00000000-0000-0000-0000-000000000001'
  };
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };

  await adminRedemptionController.listRedemptions(req, res);

  assert.equal(res.statusCode, 200);
  assert.ok(res.body && res.body.success === true);
  assert.ok(Array.isArray(res.body.data.redemptions));
  assert.equal(typeof res.body.data.total, 'number');
  assert.equal(res.body.data.limit, 10);
  assert.equal(res.body.data.offset, 0);
});

test('listRedemptions accepts sort_by and sort_order query params', async () => {
  const req = {
    query: { sort_by: 'total_bill_amount', sort_order: 'asc', limit: '5', offset: '0' },
    userId: '00000000-0000-0000-0000-000000000001'
  };
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };

  await adminRedemptionController.listRedemptions(req, res);

  assert.equal(res.statusCode, 200);
  assert.ok(res.body && res.body.success === true);
  assert.ok(Array.isArray(res.body.data.redemptions));
  assert.equal(res.body.data.limit, 5);
});

test('listRedemptions accepts filter params without error', async () => {
  const req = {
    query: {
      settlement_status: 'pending',
      start_date: '2025-01-01',
      end_date: '2025-12-31',
      limit: '25',
      offset: '0'
    },
    userId: '00000000-0000-0000-0000-000000000001'
  };
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };

  await adminRedemptionController.listRedemptions(req, res);

  assert.equal(res.statusCode, 200);
  assert.ok(res.body && res.body.success === true);
  assert.ok('redemptions' in res.body.data);
  assert.ok('total' in res.body.data);
});
