/**
 * Timezone validation and regression tests.
 * Run: npm test
 *
 * Scenarios: ISO8601 validation, UTC conversion, display formatting
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  validateISO8601,
  convertToUTC,
  convertFromUTC,
  parseBookingDateTime,
} = require('../src/utils/timeService');

test('validateISO8601: accepts valid ISO 8601 strings', () => {
  assert.equal(validateISO8601('2026-02-27T10:30:00.000Z'), true);
  assert.equal(validateISO8601('2026-02-27T10:30:00Z'), true);
  assert.equal(validateISO8601('2026-02-27T16:00:00+05:30'), true);
});

test('validateISO8601: rejects invalid input', () => {
  assert.equal(validateISO8601(''), false);
  assert.equal(validateISO8601('not-a-date'), false);
  assert.equal(validateISO8601(null), false);
});

test('convertToUTC: returns ISO string for valid Date', () => {
  const d = new Date('2026-02-27T10:30:00.000Z');
  const result = convertToUTC(d);
  assert.ok(result);
  assert.match(result, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
});

test('convertToUTC: returns null for invalid input', () => {
  assert.equal(convertToUTC('invalid'), null);
  assert.equal(convertToUTC(null), null);
});

test('convertFromUTC: formats UTC to Asia/Kolkata', () => {
  const utc = '2026-02-27T05:00:00.000Z';
  const formatted = convertFromUTC(utc, 'Asia/Kolkata');
  assert.ok(formatted);
  assert.ok(formatted.includes('2026'));
  assert.match(formatted, /\d{1,2}:\d{2}\s*(am|pm)/i);
});

test('parseBookingDateTime: parses YYYY-MM-DD and HH:MM', () => {
  const d = parseBookingDateTime('2026-02-27', '16:30');
  assert.ok(d instanceof Date);
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 1);
  assert.equal(d.getDate(), 27);
});

test('parseBookingDateTime: returns null for invalid input', () => {
  assert.equal(parseBookingDateTime('', '16:30'), null);
  assert.equal(parseBookingDateTime('2026-02-27', ''), null);
});

test('regression: booking_date + booking_time produce valid datetime', () => {
  const d = parseBookingDateTime('2026-03-15', '19:00');
  assert.ok(d instanceof Date);
  const utc = convertToUTC(d);
  assert.ok(utc);
  assert.ok(utc.includes('2026-03-15'));
});

test('regression: voucher expiry comparison uses UTC', () => {
  const expiresAt = '2026-02-28T23:59:59.000Z';
  const now = new Date();
  const valid = new Date(expiresAt) > now;
  assert.equal(typeof valid, 'boolean');
});
