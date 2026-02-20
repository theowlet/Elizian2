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

function deriveDiscountValues({ original_price, co_pay_percentage, discount_amount, discounted_price }) {
  const metrics = calculateDiscountMetrics({
    original: original_price,
    percent: co_pay_percentage,
    amount: discount_amount,
    discounted: discounted_price
  });

  // original_price is optional - return null if not provided or invalid
  const original = (original_price !== null && original_price !== undefined && Number(original_price) > 0)
    ? Number(original_price)
    : null;
  
  const discounted = Math.max(0, metrics.finalDiscountedPrice || 0);

  // Store co_pay_percentage exactly as entered, rounded to 2 decimals (50 stays 50, never derived from prices)
  const rawCoPay = co_pay_percentage != null && co_pay_percentage !== '' && !Number.isNaN(Number(co_pay_percentage))
    ? Number(co_pay_percentage)
    : null;
  const co_pay_percentage_normalized = rawCoPay != null ? Math.round(rawCoPay * 100) / 100 : null;

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

