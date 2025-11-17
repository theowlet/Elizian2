// ==================================
// PAYMENT CALCULATOR MODULE
// ==================================
/**
 * @module paymentCalculator
 * @description Payment calculation with correct token economics
 * @author Elizian Team
 * @version 2.0.0
 */

import { CONFIG } from '../core/config.js';
import { getUserInfo } from '../core/storage.js';

// ==========================================
// TIER CONFIGURATION
// ==========================================
const TIER_PERCENTAGES = {
  'Ather': CONFIG.TIER_PERCENTAGES.Ather,
  'Nova': CONFIG.TIER_PERCENTAGES.Nova,
  'Luminar': CONFIG.TIER_PERCENTAGES.Luminar,
  'Valiant': CONFIG.TIER_PERCENTAGES.Valiant,
  'Echelon': CONFIG.TIER_PERCENTAGES.Echelon
};

// ==========================================
// PAYMENT CALCULATION FUNCTIONS
// ==========================================

/**
 * Calculate payment breakdown with correct token economics
 * @param {number} billAmount - Total bill amount in rupees
 * @param {number} payByCoinPercent - Percentage to pay in coins (0-100)
 * @param {string} userTier - User membership tier (optional, will be fetched if not provided)
 * @returns {Object} Payment breakdown
 */
export async function calculatePayment(billAmount, payByCoinPercent, userTier = null) {
  try {
    // Validate inputs
    if (billAmount < 0 || billAmount > CONFIG.VALIDATION.maxBillAmount) {
      throw new Error(`Bill amount must be between ₹${CONFIG.VALIDATION.minBillAmount} and ₹${CONFIG.VALIDATION.maxBillAmount}`);
    }
    
    if (payByCoinPercent < 0 || payByCoinPercent > 100) {
      throw new Error('Pay by coin percentage must be between 0 and 100');
    }
    
    // Get user tier if not provided
    if (!userTier) {
      const userInfo = getUserInfo();
      userTier = userInfo.current_tier || 'Ather';
    }
    
    const tierPercent = TIER_PERCENTAGES[userTier] || TIER_PERCENTAGES['Ather'];
    const tokenValue = CONFIG.TOKEN_VALUE; // ₹100 = 1 $EZT
    
    // CORRECTED calculations based on Elizian token model
    const payByCoinAmount = (billAmount * payByCoinPercent) / 100; // Amount to pay in coins
    const fiatAmount = billAmount - payByCoinAmount; // Amount to pay in fiat
    const coinsRequired = payByCoinAmount / tokenValue; // Coins needed
    const coinsEarned = (fiatAmount * tierPercent) / 100 / tokenValue; // Earn on FIAT only
    
    return {
      billAmount: parseFloat(billAmount.toFixed(2)),
      payByCoinPercent: parseFloat(payByCoinPercent.toFixed(2)),
      payByCoinAmount: parseFloat(payByCoinAmount.toFixed(2)),
      fiatAmount: parseFloat(fiatAmount.toFixed(2)),
      coinsRequired: parseFloat(coinsRequired.toFixed(5)),
      coinsEarned: parseFloat(coinsEarned.toFixed(5)),
      netCoinChange: parseFloat((coinsEarned - coinsRequired).toFixed(5)),
      userTier: userTier,
      tierPercent: tierPercent
    };
  } catch (error) {
    console.error('Payment calculation error:', error);
    throw error;
  }
}

/**
 * Calculate split payment breakdown
 * @param {number} billAmount - Total bill amount
 * @param {number} payByCoinPercent - Percentage to pay in coins
 * @param {number} splitCount - Number of people splitting
 * @param {string} userTier - User tier
 * @returns {Object} Split payment breakdown
 */
export async function calculateSplitPayment(billAmount, payByCoinPercent, splitCount, userTier = null) {
  const payment = await calculatePayment(billAmount, payByCoinPercent, userTier);
    
    return {
      ...payment,
      splitCount: splitCount,
      splitBreakdown: {
      billPerPerson: parseFloat((payment.billAmount / splitCount).toFixed(2)),
      payByCoinPerPerson: parseFloat((payment.payByCoinAmount / splitCount).toFixed(2)),
      fiatPerPerson: parseFloat((payment.fiatAmount / splitCount).toFixed(2)),
      coinsPerPerson: parseFloat((payment.coinsRequired / splitCount).toFixed(5))
  }
  };
}

// ==========================================
// UI UPDATE FUNCTIONS
// ==========================================

/**
 * Update payment display with correct terminology
 * @param {Object} payment - Payment breakdown object
 */
export function updatePaymentDisplay(payment) {
    // Update bill display
    const billElement = document.getElementById('dispBill');
    if (billElement) billElement.textContent = `₹${payment.billAmount.toFixed(2)}`;
    
  // Update pay by coin display
  const payByCoinPercentElement = document.getElementById('dispDiscountPercent');
  if (payByCoinPercentElement) payByCoinPercentElement.textContent = `${payment.payByCoinPercent.toFixed(2)}%`;
    
  const payByCoinValueElement = document.getElementById('dispDiscountValue');
  if (payByCoinValueElement) payByCoinValueElement.textContent = `₹${payment.payByCoinAmount.toFixed(2)}`;
    
  // Update coins required
  const coinsElement = document.getElementById('dispTokens');
  if (coinsElement) coinsElement.textContent = `${payment.coinsRequired.toFixed(5)} $EZT`;
    
  // Update fiat amount
    const fiatElement = document.getElementById('dispFiat');
    if (fiatElement) fiatElement.textContent = `₹${payment.fiatAmount.toFixed(2)}`;
    
  // Update earnings (on fiat only)
    const rewardElement = document.getElementById('dispReward');
  if (rewardElement) rewardElement.textContent = `${payment.coinsEarned.toFixed(5)} $EZT`;
    
  // Show result box
  const resultBox = document.getElementById('calcResults');
  if (resultBox) {
    resultBox.style.display = 'block';
    resultBox.style.opacity = '0';
    setTimeout(() => resultBox.style.opacity = '1', 50);
  }
}

/**
 * Update split payment display
 * @param {Object} splitPayment - Split payment breakdown object
 */
export function updateSplitPaymentDisplay(splitPayment) {
  const splitContainer = document.getElementById('splitResults');
  if (!splitContainer) return;
  
  splitContainer.innerHTML = `
    <div style="background:var(--surface);padding:20px;border-radius:12px;margin-top:20px;">
      <h3 style="margin:0 0 15px 0;color:var(--text-primary);">Split Payment Breakdown</h3>
      <div style="display:grid;gap:10px;">
        <div style="display:flex;justify-content:space-between;">
          <span>Total Bill:</span>
          <span style="font-weight:700;">₹${splitPayment.billAmount.toFixed(2)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;">
          <span>Pay by Coin (${splitPayment.payByCoinPercent}%):</span>
          <span style="font-weight:700;color:#4CAF50;">₹${splitPayment.payByCoinAmount.toFixed(2)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;">
          <span>Pay with $EZT:</span>
          <span style="font-weight:700;color:var(--brand1);">${splitPayment.coinsRequired.toFixed(2)} tokens</span>
        </div>
        <div style="display:flex;justify-content:space-between;">
          <span>Pay by Fiat:</span>
          <span style="font-weight:700;">₹${splitPayment.fiatAmount.toFixed(2)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;">
          <span>Earn (${splitPayment.userTier} tier):</span>
          <span style="font-weight:700;color:var(--brand1);">${splitPayment.coinsEarned.toFixed(3)} $EZT</span>
        </div>
        <hr style="margin:15px 0;border:none;border-top:1px solid var(--border);">
        <div style="display:flex;justify-content:space-between;">
          <span><strong>Per Person (${splitPayment.splitCount} people):</strong></span>
          </div>
        <div style="display:flex;justify-content:space-between;">
          <span>Bill per person:</span>
          <span>₹${splitPayment.splitBreakdown.billPerPerson.toFixed(2)}</span>
          </div>
        <div style="display:flex;justify-content:space-between;">
          <span>Pay by Coin per person:</span>
          <span>₹${splitPayment.splitBreakdown.payByCoinPerPerson.toFixed(2)}</span>
          </div>
        <div style="display:flex;justify-content:space-between;">
          <span>Coins per person:</span>
          <span>${splitPayment.splitBreakdown.coinsPerPerson.toFixed(3)} $EZT</span>
        </div>
        <div style="display:flex;justify-content:space-between;">
          <span>Fiat per person:</span>
          <span>₹${splitPayment.splitBreakdown.fiatPerPerson.toFixed(2)}</span>
        </div>
          </div>
        </div>
      `;
}

// ==========================================
// EVENT HANDLERS
// ==========================================

/**
 * Handle payment calculation form submission
 */
export async function handlePaymentCalculation() {
  try {
    const billInput = document.getElementById('billInput');
    const payByCoinInput = document.getElementById('discountInput') || document.getElementById('partnerDiscount');
    
    if (!billInput || !payByCoinInput) {
      throw new Error('Required input fields not found');
    }
    
    const billAmount = parseFloat(billInput.value) || 0;
    const payByCoinPercent = parseFloat(payByCoinInput.value) || 20; // Default 20%
    
    const payment = await calculatePayment(billAmount, payByCoinPercent);
    updatePaymentDisplay(payment);
  } catch (error) {
    console.error('Payment calculation error:', error);
    alert(`Error: ${error.message}`);
  }
}

/**
 * Handle split payment calculation
 */
export async function handleSplitPaymentCalculation() {
  try {
    const billInput = document.getElementById('billInput');
    const payByCoinInput = document.getElementById('discountInput') || document.getElementById('partnerDiscount');
    const splitCountInput = document.getElementById('splitCount');
    
    if (!billInput || !payByCoinInput || !splitCountInput) {
      throw new Error('Required input fields not found');
    }
    
    const billAmount = parseFloat(billInput.value) || 0;
    const payByCoinPercent = parseFloat(payByCoinInput.value) || 20;
    const splitCount = parseInt(splitCountInput.value) || 2;
    
    const splitPayment = await calculateSplitPayment(billAmount, payByCoinPercent, splitCount);
    updateSplitPaymentDisplay(splitPayment);
  } catch (error) {
    console.error('Split payment calculation error:', error);
    alert(`Error: ${error.message}`);
  }
}

// ==========================================
// EXPORTS FOR GLOBAL ACCESS
// ==========================================
window.calculatePayment = calculatePayment;
window.calculateSplitPayment = calculateSplitPayment;
window.updatePaymentDisplay = updatePaymentDisplay;
window.updateSplitPaymentDisplay = updateSplitPaymentDisplay;
window.handlePaymentCalculation = handlePaymentCalculation;
window.handleSplitPaymentCalculation = handleSplitPaymentCalculation;