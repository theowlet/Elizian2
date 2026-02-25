const { calculateDiscountMetrics } = require('./validator');

const VALID_WEEK_DAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday'
];

function normalizeApplicableDays(input) {
  if (!input) {
    return [...VALID_WEEK_DAYS];
  }

  let values = [];
  if (Array.isArray(input)) {
    values = input;
  } else if (typeof input === 'string') {
    values = input.split(',');
  } else {
    return [...VALID_WEEK_DAYS];
  }

  const cleaned = values
    .map((day) => String(day).toLowerCase().trim())
    .filter((day) => VALID_WEEK_DAYS.includes(day));

  return cleaned.length ? cleaned : [...VALID_WEEK_DAYS];
}

/**
 * Single source of truth: co_pay_percentage = user input only.
 * ezt_equivalent = derived from (discounted_price * co_pay_percentage / 100) / EZT_TO_INR.
 * NEVER reverse-derive co_pay_percentage from ezt_equivalent, discounted_price, or original_price.
 */
function deriveDiscountValues({ original_price, co_pay_percentage, discount_amount, discounted_price }) {
  // Normalize co_pay ONCE from user input; never from prices or ezt
  const rawCoPay = co_pay_percentage != null && co_pay_percentage !== '' && !Number.isNaN(Number(co_pay_percentage))
    ? Number(co_pay_percentage)
    : null;
  const co_pay_percentage_normalized = rawCoPay != null ? Math.round(rawCoPay * 100) / 100 : null;

  const metrics = calculateDiscountMetrics({
    original: original_price,
    percent: co_pay_percentage_normalized,
    amount: discount_amount,
    discounted: discounted_price
  });

  const original = (original_price !== null && original_price !== undefined && Number(original_price) > 0)
    ? Number(original_price)
    : null;
  const discounted = Math.max(0, metrics.finalDiscountedPrice || 0);

  return {
    original_price: original,
    discounted_price: discounted,
    co_pay_percentage: co_pay_percentage_normalized,
    discount_amount: Number(discount_amount) || null,
    savings: metrics.finalSavings,
    ezt_equivalent: metrics.finalEztEquivalent
  };
}

function determineScheduleStatus(startDate, endDate) {
  const now = new Date();
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;

  if (end && end < now) {
    return 'expired';
  }
  if (start && start > now) {
    return 'upcoming';
  }
  return 'live';
}

function toRelativeImagePath(value = '') {
  if (!value) {
    return null;
  }
  if (value.startsWith('/uploads/')) {
    return value;
  }
  const sanitized = value.replace(/^https?:\/\/[^/]+/i, '').replace(/^\/+/, '');
  if (!sanitized.startsWith('uploads/')) {
    return `/uploads/offers/${sanitized.split('/').pop()}`;
  }
  return `/${sanitized}`;
}

module.exports = {
  VALID_WEEK_DAYS,
  normalizeApplicableDays,
  deriveDiscountValues,
  determineScheduleStatus,
  toRelativeImagePath
};

