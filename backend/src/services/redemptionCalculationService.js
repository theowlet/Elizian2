const { getPool } = require('../config/db');
const tokenService = require('./tokenService');
const pool = getPool();

/** 1 EZT = 100 INR for co-pay calculation */
const EZT_TO_INR = 100;

/**
 * Get offer discount (percentage and/or fixed amount) and type by offer id
 */
async function getOfferDiscount(offerId) {
  if (!offerId) return null;
  const result = await pool.query(
    `SELECT co_pay_percentage, discount_amount, offer_type, title FROM partner_offers WHERE id = $1`,
    [offerId]
  );
  return result.rows[0] || null;
}

/**
 * Single source of truth for redemption co-pay: use booking-time co-pay when present,
 * otherwise use the given offer row (current deal terms). Ensures redemption always
 * uses the terms that applied at booking, not the current deal.
 * @param {Object|null} offerRow - Current offer row from partner_offers (co_pay_percentage, discount_amount, offer_type, title)
 * @param {{ co_pay_percentage_at_booking?: number|string|null }} booking - Booking with optional snapshot
 * @returns {Object|null} Offer row to use for calculateRedemptionAmounts / validateCalculation
 */
function applyBookingTimeCoPay(offerRow, booking) {
  const raw = booking?.co_pay_percentage_at_booking;
  if (raw == null) return offerRow;
  const pct = parseFloat(raw);
  if (Number.isNaN(pct) || pct < 0) return offerRow;
  const effective = Math.min(100, pct);
  const base = offerRow && typeof offerRow === 'object' ? { ...offerRow } : { discount_amount: null, offer_type: 'co_pay', title: null };
  base.co_pay_percentage = effective;
  return base;
}

/**
 * Calculate redemption amounts from offer (percentage or fixed discount) and total bill.
 * - If offer has co_pay_percentage > 0: discount = totalBill * (co_pay_percentage / 100)
 * - Else if offer has discount_amount > 0: discount = min(discount_amount, totalBill) (fixed off)
 * - Else: discount = 0
 * ezt_co_pay_amount (INR) = discount (amount covered by EZT)
 * ezt_tokens_required = discount / 100 (1 EZT = 100 INR)
 * net_amount_from_user = total_bill_amount - discount
 */
function calculateRedemptionAmounts(offerId, totalBillAmount, offerRow = null) {
  const total = Math.max(0, parseFloat(totalBillAmount) || 0);
  const coPayPct = offerRow ? parseFloat(offerRow.co_pay_percentage) : undefined;
  const fixedDiscount = offerRow ? parseFloat(offerRow.discount_amount) || 0 : 0;

  let discountAmount;
  let effectivePercentage;
  if (coPayPct != null && !isNaN(coPayPct) && coPayPct >= 0) {
    effectivePercentage = Math.min(100, coPayPct);
    discountAmount = Math.round((total * (effectivePercentage / 100)) * 100) / 100;
    discountAmount = Math.min(discountAmount, total);
  } else if (fixedDiscount > 0) {
    discountAmount = Math.min(fixedDiscount, total);
    discountAmount = Math.round(discountAmount * 100) / 100;
    effectivePercentage = total > 0 ? Math.round((discountAmount / total) * 10000) / 100 : 0;
  } else {
    discountAmount = 0;
    effectivePercentage = 0;
  }

  const netFromUser = Math.round((total - discountAmount) * 100) / 100;
  const eztTokensRequired = Math.round((discountAmount / EZT_TO_INR) * 100000) / 100000;
  return {
    co_pay_percentage: effectivePercentage,
    discount_amount: discountAmount,
    ezt_co_pay_amount: discountAmount,
    net_amount_from_user: netFromUser,
    ezt_tokens_required: eztTokensRequired,
  };
}

/**
 * Full calculation: fetch offer then compute. Returns breakdown + wallet-based caps when userId provided.
 * Requires userId for partner preview so max_allowed_co_pay is capped by customer wallet (prevents partner claiming more EZT than customer has).
 * Redemption uses co-pay at booking time when booking.co_pay_percentage_at_booking is set (single source of truth).
 * @param {string} offerId - Deal/offer id
 * @param {number} totalBillAmount - Total bill amount
 * @param {string|null} userId - User id for wallet balance (required for preview to return max_allowed_co_pay)
 * @param {{ booking?: { co_pay_percentage_at_booking?: number|string|null }, executor?: object }} options - Pass booking to use booking-time co-pay; executor for transaction
 */
async function calculateRedemptionBreakdown(offerId, totalBillAmount, userId = null, options = {}) {
  let offerRow = await getOfferDiscount(offerId);
  offerRow = applyBookingTimeCoPay(offerRow, options.booking || null);
  const amounts = calculateRedemptionAmounts(offerId, totalBillAmount, offerRow);
  const standardCoPayInr = parseFloat(amounts.ezt_co_pay_amount || 0);
  let userEztBalance = null;
  let walletAffordableInr = null;
  let maxAllowedCoPay = standardCoPayInr;
  let walletShortfall = 0;
  let customerFullyFunded = true;
  if (userId) {
    userEztBalance = await tokenService.getBalance(userId, options.executor || null);
    walletAffordableInr = Math.round(userEztBalance * EZT_TO_INR * 100) / 100;
    maxAllowedCoPay = Math.min(standardCoPayInr, walletAffordableInr);
    walletShortfall = Math.max(0, Math.round((standardCoPayInr - walletAffordableInr) * 100) / 100);
    customerFullyFunded = walletAffordableInr >= standardCoPayInr - 0.01;
  }
  return {
    ...amounts,
    user_ezt_balance: userEztBalance,
    max_allowed_co_pay: maxAllowedCoPay,
    standard_co_pay_amount: standardCoPayInr,
    wallet_affordable_inr: walletAffordableInr,
    wallet_shortfall: walletShortfall,
    customer_fully_funded: customerFullyFunded,
  };
}

/**
 * Validate partner-submitted values against calculated. Allow tolerance 0.01 INR.
 * When walletBalanceEzt (or maxAllowedCoPayInr) is provided, validates eztCoPay <= max allowed (wallet cap), not just arithmetic match.
 * @param {number} totalBillAmount
 * @param {number} eztCoPay
 * @param {number} netAmount
 * @param {string} offerId
 * @param {Object} offerRow
 * @param {{ walletBalanceEzt?: number, maxAllowedCoPayInr?: number }} options - If set, eztCoPay must be <= maxAllowedCoPayInr (or walletBalanceEzt * EZT_TO_INR)
 */
function validateCalculation(totalBillAmount, eztCoPay, netAmount, offerId, offerRow, options = {}) {
  const calc = calculateRedemptionAmounts(offerId, totalBillAmount, offerRow);
  const tolerance = 0.01;
  const maxAllowedInr = options.maxAllowedCoPayInr != null
    ? options.maxAllowedCoPayInr
    : (options.walletBalanceEzt != null ? Math.round(options.walletBalanceEzt * EZT_TO_INR * 100) / 100 : null);
  const billOk = Math.abs((parseFloat(totalBillAmount) || 0) - (parseFloat(calc.net_amount_from_user) + parseFloat(calc.ezt_co_pay_amount))) <= tolerance;
  const netOk = Math.abs((parseFloat(netAmount) || 0) - ((parseFloat(totalBillAmount) || 0) - (parseFloat(eztCoPay) || 0))) <= tolerance;
  const eztOk = maxAllowedInr != null
    ? (parseFloat(eztCoPay) || 0) <= maxAllowedInr + tolerance
    : Math.abs((parseFloat(eztCoPay) || 0) - calc.ezt_co_pay_amount) <= tolerance;
  return {
    valid: billOk && netOk && eztOk,
    variance: {
      discount_amount: (parseFloat(eztCoPay) || 0) - calc.ezt_co_pay_amount,
      net_amount: (parseFloat(netAmount) || 0) - calc.net_amount_from_user,
    },
    calculated: calc,
  };
}

module.exports = {
  getOfferDiscount,
  applyBookingTimeCoPay,
  calculateRedemptionAmounts,
  calculateRedemptionBreakdown,
  validateCalculation,
  EZT_TO_INR,
};
