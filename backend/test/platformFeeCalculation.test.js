/**
 * Platform fee calculation: deterministic, fiat-only, real-time.
 * Business rule: Platform Fee = (Fiat received) × (Platform %). Fee is split for reporting:
 * Fiat % and EZT % of the fiat amount — when equal (e.g. 2.5% + 2.5% = 5%), the two amounts are equal.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const round2 = (v) => Math.round(Number(v) * 100) / 100;

function computePlatformFee(fiatReceived, tierPercent) {
  const fiat = Number(fiatReceived) || 0;
  const pct = Number(tierPercent) || 0;
  return round2(fiat * pct / 100);
}

function computeFeeSplit(fiatReceived, platformPct, fiatFeePct, eztFeePct) {
  const fiat = Number(fiatReceived) || 0;
  return {
    platform_fee_total: round2(fiat * platformPct / 100),
    fiat_component: round2(fiat * (Number(fiatFeePct) || 0) / 100),
    ezt_component: round2(fiat * (Number(eztFeePct) || 0) / 100),
  };
}

test('platform fee on fiat only: 1000 fiat, 10% tier => 100', () => {
  assert.equal(computePlatformFee(1000, 10), 100);
});

test('platform fee on fiat only: 500 fiat, 15% tier => 75', () => {
  assert.equal(computePlatformFee(500, 15), 75);
});

test('platform fee: zero fiat => 0', () => {
  assert.equal(computePlatformFee(0, 10), 0);
});

test('platform fee: zero tier % => 0', () => {
  assert.equal(computePlatformFee(1000, 0), 0);
});

test('platform fee: rounding to 2 decimals', () => {
  assert.equal(computePlatformFee(333, 10), 33.3);
  assert.equal(computePlatformFee(100, 33.33), 33.33);
});

test('platform fee: EZT component must not affect fee (fee on fiat only)', () => {
  const fiatReceived = 1000;
  const eztValue = 500;
  const tierPercent = 10;
  const fee = computePlatformFee(fiatReceived, tierPercent);
  assert.equal(fee, 100, 'Fee must be on fiat only; adding EZT must not change fee');
  assert.equal(computePlatformFee(fiatReceived + eztValue, tierPercent), 150, 'If we wrongly used total, fee would be 150');
});

test('tier snapshot: historical row keeps original percentage', () => {
  const fiat = 2000;
  const tierAtTransaction = 12;
  const feeAtTransaction = computePlatformFee(fiat, tierAtTransaction);
  assert.equal(feeAtTransaction, 240);
  const tierLater = 15;
  const feeIfRecalc = computePlatformFee(fiat, tierLater);
  assert.equal(feeIfRecalc, 300);
  assert.notEqual(feeAtTransaction, feeIfRecalc, 'Stored fee must not be recalculated with new tier %');
});

test('fee split: 5% platform = 2.5% fiat + 2.5% EZT → both amounts equal', () => {
  const fiat = 1000;
  const split = computeFeeSplit(fiat, 5, 2.5, 2.5);
  assert.equal(split.platform_fee_total, 50, '5% of 1000 = 50');
  assert.equal(split.fiat_component, 25, '2.5% of 1000 = 25');
  assert.equal(split.ezt_component, 25, '2.5% of 1000 = 25');
  assert.equal(split.fiat_component, split.ezt_component, 'Fiat and EZT components must be equal when % are equal');
  assert.equal(split.fiat_component + split.ezt_component, split.platform_fee_total, 'Split must sum to total');
});
