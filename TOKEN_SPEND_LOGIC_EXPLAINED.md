# Current Token Spend Logic - Complete Explanation

**Date**: 2025-11-24  
**System**: EZT (Elizian Token) Redemption Flow

---

## 🎯 **Executive Summary**

**Current Behavior**: Tokens are **IMMEDIATELY SPENT** during booking creation, not after payment confirmation.

**Implications**:
- ✅ User gets instant discount
- ⚠️ If booking fails, tokens are already deducted
- ⚠️ No payment gateway integration visible
- ⚠️ No rollback mechanism for failed payments

---

## 📋 **Complete Token Spend Flow**

### **Step-by-Step Process**

```
User Initiates Booking
    ↓
1. Frontend sends: { ezt_to_redeem: 2.5, ... }
    ↓
2. Backend starts DB transaction (BEGIN)
    ↓
3. ✅ TOKENS SPENT IMMEDIATELY (Line 173)
    ↓
4. Create booking record
    ↓
5. Create transaction record
    ↓
6. Create reservations/pre-orders
    ↓
7. COMMIT transaction
    ↓
8. Award new tokens (earned from booking)
    ↓
9. Award loyalty points
    ↓
10. Return booking confirmation
```

---

## 💰 **Token Redemption Details**

### **When Tokens Are Spent** (Line 170-181 in bookingService.js)

```javascript
if (ezt_to_redeem && parseFloat(ezt_to_redeem) > 0) {
  try {
    // THIS HAPPENS IMMEDIATELY - NOT AFTER PAYMENT!
    const redeemResult = await tokenService.redeemTokens(
      user_id, 
      parseFloat(ezt_to_redeem), 
      null, 
      `Redeemed for ${bookingType} booking`
    );
    
    eztRedeemed = redeemResult.eztRedeemed;      // e.g., 2.5 EZT
    eztDiscount = redeemResult.discountAmount;   // e.g., ₹250
    finalAmount = Math.max(0, amount - eztDiscount);
    
  } catch (redeemError) {
    await client.query('ROLLBACK');  // Only rollback if redemption fails
    throw new AppError(400, `EZT redemption failed: ${redeemError.message}`);
  }
}
```

### **What redeemTokens() Does** (Line 174-227 in tokenService.js)

```javascript
async function redeemTokens(userId, eztAmount, transactionId, description) {
  // 1. Check user's available balance
  const availableTokens = user.available_tokens;  // e.g., 10.5 EZT
  
  // 2. Validate sufficient balance
  if (eztToRedeem > availableTokens) {
    throw new Error('Insufficient EZT balance');
  }
  
  // 3. Calculate discount (1 EZT = ₹100)
  const discountAmount = eztToRedeem * 100;  // 2.5 EZT = ₹250
  
  // 4. UPDATE USER'S BALANCE IMMEDIATELY
  await pool.query(`
    UPDATE users 
    SET available_tokens = available_tokens - $1,
        total_tokens_spent = total_tokens_spent + $1
    WHERE id = $2
  `, [eztToRedeem, userId]);
  
  // 5. Record in token ledger
  await pool.query(`
    INSERT INTO token_ledger (
      user_id, amount, ledger_type, 
      balance_before, balance_after, description
    ) VALUES ($1, $2, 'spent', $3, $4, $5)
  `, [userId, eztToRedeem, balanceBefore, balanceAfter, description]);
  
  return {
    eztRedeemed: eztToRedeem,
    discountAmount: discountAmount,
    balanceAfter: balanceAfter
  };
}
```

---

## 🔍 **Key Points**

### **1. Immediate Deduction**
```
User Balance Before: 10.5 EZT
User Redeems: 2.5 EZT
User Balance After: 8.0 EZT  ← UPDATED IMMEDIATELY
```

**Timing**: Inside the same database transaction as booking creation, but **BEFORE** COMMIT.

### **2. Discount Calculation**
```
Original Amount: ₹1000
EZT Redeemed: 2.5 EZT
Discount: 2.5 × ₹100 = ₹250
Final Amount: ₹750
```

**Exchange Rate**: 1 EZT = ₹100 (hardcoded in tokenService.js line 194)

### **3. Transaction Record**
```javascript
// Booking record stores:
{
  total_price: ₹750,        // After discount
  fiat_amount: ₹1000,       // Original price
  ezt_redeemed: 2.5,        // Tokens used
  status: 'confirmed'       // Immediately confirmed
}

// Transaction record stores:
{
  bill_amount: ₹1000,       // Original
  discount_amount: ₹250,    // From EZT
  amount_after_discount: ₹750,
  tokens_redeemed: 2.5,
  payment_status: 'completed'  // Marked as completed immediately!
}
```

### **4. Token Ledger**
```javascript
// Record in token_ledger table:
{
  user_id: 'uuid',
  amount: 2.5,
  ledger_type: 'spent',
  balance_before: 10.5,
  balance_after: 8.0,
  description: 'Redeemed for event booking'
}
```

---

## ⚠️ **Current Issues & Risks**

### **Issue #1: No Payment Gateway Integration**
```
❌ booking.payment_status = 'completed' (immediately)
❌ No actual payment processing
❌ No payment gateway webhook
❌ No payment confirmation step
```

### **Issue #2: No Rollback for Payment Failures**
```
Scenario:
1. User redeems 5 EZT (₹500 discount)
2. Booking created successfully
3. User goes to payment gateway
4. Payment fails or user cancels
5. ❌ Tokens already spent - NOT refunded
6. ❌ Booking still exists as 'confirmed'
```

### **Issue #3: Booking Status is Immediate**
```javascript
// Line 85, 105, 144 in bookingService.js
bookingPayload.status = 'confirmed';  // Always confirmed immediately
```

**No "pending_payment" status** - everything is marked confirmed right away.

---

## 🔄 **What confirmPayment() Actually Does**

```javascript
// Line 402-437 in bookingService.js
async function confirmPayment(bookingId, userId) {
  // This function does NOT handle token spending!
  // It only marks reward_credited = true
  
  // Check if booking is reward_eligible
  // Check if reward already credited
  // Update: reward_credited = true
  
  // ❌ Does NOT process payment
  // ❌ Does NOT spend tokens (already spent!)
  // ❌ Does NOT integrate with payment gateway
}
```

**Purpose**: This appears to be for marking rewards as credited, NOT for payment processing.

---

## 🏗️ **Recommended Architecture (Future)**

### **Option A: Reserve-Then-Deduct Pattern**

```javascript
// Step 1: Create booking with status 'pending_payment'
createBooking({
  status: 'pending_payment',
  ezt_to_reserve: 2.5,  // Don't spend yet
  payment_intent_id: 'razorpay_xyz'
});

// Step 2: User pays via payment gateway
// Payment gateway webhook calls confirmPayment()

// Step 3: On payment success
confirmPayment(bookingId) {
  // NOW spend the tokens
  await tokenService.redeemTokens(userId, reservation.ezt_amount);
  
  // Update booking
  await updateBookingStatus(bookingId, 'confirmed');
}

// Step 4: On payment failure/timeout
cancelBooking(bookingId) {
  // No tokens were spent, nothing to refund
  await updateBookingStatus(bookingId, 'cancelled');
}
```

### **Option B: Spend-Then-Rollback Pattern**

```javascript
// Current flow: Spend immediately
await tokenService.redeemTokens(...);
createBooking({ status: 'pending_payment' });

// Add payment timeout/failure handler
async function handlePaymentFailure(bookingId) {
  const booking = await getBookingById(bookingId);
  
  // Refund tokens
  await tokenService.refundTokens(
    booking.user_id, 
    booking.ezt_redeemed,
    `Refund for cancelled booking ${bookingId}`
  );
  
  await updateBookingStatus(bookingId, 'cancelled');
}
```

---

## 📊 **Current vs Recommended Flow**

### **Current Flow** ❌
```
1. User clicks "Book Now"
2. Tokens SPENT immediately
3. Booking created as 'confirmed'
4. Transaction marked 'completed'
5. [No payment gateway involved]
6. If something fails → Tokens lost
```

### **Recommended Flow** ✅
```
1. User clicks "Book Now"
2. Booking created as 'pending_payment'
3. Tokens RESERVED (not spent)
4. Redirect to payment gateway
5. User completes payment
6. Payment webhook received
7. → Tokens SPENT
8. → Booking status → 'confirmed'
9. If payment fails → Tokens released
```

---

## 💡 **Quick Wins (Immediate Improvements)**

### **1. Add Booking Status Enum**
```javascript
const BOOKING_STATUS = {
  PENDING_PAYMENT: 'pending_payment',
  CONFIRMED: 'confirmed',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
  REFUNDED: 'refunded'
};
```

### **2. Add Token Refund Function**
```javascript
async function refundTokens(userId, eztAmount, description) {
  await pool.query(`
    UPDATE users 
    SET available_tokens = available_tokens + $1,
        total_tokens_spent = total_tokens_spent - $1
    WHERE id = $2
  `, [eztAmount, userId]);
  
  await pool.query(`
    INSERT INTO token_ledger (
      user_id, amount, ledger_type, description
    ) VALUES ($1, $2, 'refund', $3)
  `, [userId, eztAmount, description]);
}
```

### **3. Add Payment Timeout Handler**
```javascript
// Auto-cancel bookings after 15 minutes if payment not confirmed
cron.schedule('*/5 * * * *', async () => {
  const expiredBookings = await getExpiredPendingPaymentBookings();
  for (const booking of expiredBookings) {
    await refundTokens(booking.user_id, booking.ezt_redeemed);
    await updateBookingStatus(booking.id, 'cancelled');
  }
});
```

---

## 🎯 **Summary**

### **Current Logic**:
1. ✅ Tokens are spent IMMEDIATELY during booking creation
2. ❌ No pending payment state
3. ❌ No payment gateway integration
4. ❌ No rollback mechanism for failures
5. ❌ `confirmPayment()` only marks rewards, doesn't handle payment

### **Impact**:
- Works fine if booking always succeeds
- Risky if payment can fail
- No way to handle cancellations/refunds properly

### **Recommendation**:
- Implement proper payment flow with pending states
- Add token refund mechanism
- Integrate with payment gateway (Razorpay/Stripe)
- Add timeout handlers for abandoned bookings

---

**Current Status**: System works for "pay at venue" or instant confirmation scenarios, but needs enhancement for online payment gateways.

