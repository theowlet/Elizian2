// Discount calculation utility.
// Rule: percent (co_pay_percentage) is user input only. Never derive percent from discounted/original.
function calculateDiscountMetrics({ original, percent, amount, discounted }) {
  const parsedOriginal = parseFloat(original);
  const originalValue = Number.isFinite(parsedOriginal) && parsedOriginal > 0 ? parsedOriginal : 0;

  const parsedPercent = parseFloat(percent);
  const percentValue = Number.isFinite(parsedPercent) && parsedPercent >= 0 ? parsedPercent : 0;

  const parsedAmount = parseFloat(amount);
  const amountValue = Number.isFinite(parsedAmount) && parsedAmount > 0 ? parsedAmount : 0;

  const parsedDiscounted = parseFloat(discounted);
  let discountedValue = Number.isFinite(parsedDiscounted) ? parsedDiscounted : NaN;
  let savingsValue = 0;

  if (originalValue > 0) {
    if (percentValue > 0) {
      savingsValue = (originalValue * percentValue) / 100;
      discountedValue = originalValue - savingsValue;
    } else if (amountValue > 0) {
      savingsValue = amountValue;
      discountedValue = originalValue - amountValue;
    } else if (!Number.isFinite(discountedValue) || discountedValue <= 0) {
      discountedValue = originalValue;
      savingsValue = 0;
    } else {
      savingsValue = originalValue - discountedValue;
    }
  } else {
    // No original price provided - fall back safely
    discountedValue = Number.isFinite(discountedValue) ? discountedValue : 0;
    savingsValue = 0;
  }

  if (!Number.isFinite(discountedValue) || discountedValue < 0) {
    discountedValue = 0;
  }
  if (!Number.isFinite(savingsValue) || savingsValue < 0) {
    savingsValue = 0;
  }

  const finalDiscountedPrice = parseFloat(discountedValue.toFixed(2));
  const finalSavings = parseFloat(savingsValue.toFixed(2));
  // EZT = savings (INR) / 100 (1 EZT = 100 INR). Derived from percent only; never reverse-derive percent from this.
  const finalEztEquivalent = Math.round((finalSavings / 100) * 100) / 100;

  return {
    finalDiscountedPrice,
    finalSavings,
    finalEztEquivalent
  };
}

module.exports = {
  calculateDiscountMetrics
};

