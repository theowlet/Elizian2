/**
 * Discount Calculator Utility
 * Defensive discount calculation with safe fallbacks
 */

/**
 * Calculates discount summary from offer data
 * Handles missing or invalid price fields gracefully
 * 
 * @param {Object} offer - Offer object with price fields
 * @returns {Object} Discount summary with all fields guaranteed
 */
export function computeDiscountSummary(offer = {}) {
  // Safely parse numeric values
  const original = parseFloat(offer.original_price) || 0;
  const explicitDiscounted = offer.discounted_price !== undefined && offer.discounted_price !== null
    ? parseFloat(offer.discounted_price)
    : null;
  const percent = parseFloat(offer.discount_percentage) || 0;
  const amount = parseFloat(offer.discount_amount) || 0;

  // Calculate discounted price if not explicitly provided
  let discounted = !Number.isNaN(explicitDiscounted) && explicitDiscounted !== null 
    ? explicitDiscounted 
    : null;

  if (discounted === null) {
    if (percent > 0 && original > 0) {
      discounted = original - (original * percent) / 100;
    } else if (amount > 0 && original > 0) {
      discounted = original - amount;
    } else {
      discounted = original;
    }
  }

  // Ensure discounted price is valid
  if (discounted < 0 || Number.isNaN(discounted) || !isFinite(discounted)) {
    discounted = original;
  }

  // Calculate savings
  const savings = (original > 0 && discounted < original)
    ? original - discounted
    : 0;

  // Calculate percentage if not provided
  let calculatedPercent = percent;
  if (calculatedPercent === 0 && original > 0 && discounted < original) {
    calculatedPercent = ((original - discounted) / original) * 100;
  }

  return {
    original: parseFloat(original.toFixed(2)),
    discounted: parseFloat(discounted.toFixed(2)),
    percentage: parseFloat(calculatedPercent.toFixed(2)),
    amount: parseFloat(amount.toFixed(2)),
    savings: parseFloat(savings.toFixed(2)),
    hasDiscount: original > 0 && discounted < original,
    isValid: original > 0 && discounted >= 0 && !Number.isNaN(discounted)
  };
}

/**
 * Formats discount for display
 * @param {Object} summary - Discount summary from computeDiscountSummary
 * @returns {string} Formatted discount string (e.g., "20% OFF" or "₹500 OFF")
 */
export function formatDiscount(summary) {
  if (!summary.hasDiscount) {
    return '';
  }

  if (summary.percentage > 0) {
    return `${summary.percentage % 1 === 0 ? summary.percentage.toFixed(0) : summary.percentage.toFixed(1)}% OFF`;
  } else if (summary.amount > 0) {
    return `₹${summary.amount.toFixed(0)} OFF`;
  } else if (summary.savings > 0) {
    return `₹${summary.savings.toFixed(0)} OFF`;
  }

  return '';
}

/**
 * Checks if an offer has a valid discount
 * @param {Object} offer - Offer object
 * @returns {boolean}
 */
export function hasValidDiscount(offer) {
  const summary = computeDiscountSummary(offer);
  return summary.hasDiscount && summary.isValid;
}

/**
 * Gets the effective price to display
 * @param {Object} offer - Offer object
 * @returns {number} Effective price (discounted if available, otherwise original)
 */
export function getEffectivePrice(offer) {
  const summary = computeDiscountSummary(offer);
  return summary.hasDiscount ? summary.discounted : summary.original;
}

