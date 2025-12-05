// ==================================
// PAYMENTS MODULE
// ==================================

// ==================================
// PAYMENT CALCULATION
// ==================================
function calculatePayment() {
  const billInput = document.getElementById("billInput") || document.getElementById("billAmount");
  const discountInput = document.getElementById("discountInput") || document.getElementById("partnerDiscount");
  
  if (!billInput || !discountInput) {
    console.error("Required payment inputs not found");
    return;
  }

  const bill = parseFloat(billInput.value) || 0;
  const discountPercent = parseFloat(discountInput.value) || 0;
  
  if (bill < 0 || bill > 1000000) {
    alert('Invalid bill amount');
    return;
  }

  const discount = (bill * discountPercent) / 100;
  const finalAmount = bill - discount;
  
  // Update UI elements
  const discountElement = document.getElementById("discountAmount");
  const finalElement = document.getElementById("finalAmount");
  
  if (discountElement) {
    discountElement.textContent = `₹${discount.toFixed(2)}`;
  }
  
  if (finalElement) {
    finalElement.textContent = `₹${finalAmount.toFixed(2)}`;
  }
  
  return {
    bill,
    discount,
    finalAmount
  };
}

// ==================================
// PAYMENT PROCESSING
// ==================================
function processPayment(amount, method = 'card') {
  console.log('Processing payment:', { amount, method });
  // Implementation would go here
}

function showPaymentScreen() {
  // Implementation for payment screen modal
  console.log('Showing payment screen');
}

// ==================================
// EXPORTS
// ==================================
window.calculatePayment = calculatePayment;
window.processPayment = processPayment;
window.showPaymentScreen = showPaymentScreen;
