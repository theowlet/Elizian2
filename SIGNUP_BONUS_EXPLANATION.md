# Signup Bonus - Complete Explanation

**Date**: 2025-11-24  
**Feature**: 100 EZT Welcome Bonus for New Users

---

## 🎉 **YES! New Users Get 100 EZT**

Every new user receives **100 EZT tokens** (worth ₹10,000) as a signup bonus upon registration.

---

## 📋 **When It Happens**

### **Registration Flow:**

```
1. User fills registration form
   ↓
2. User verifies phone with OTP
   ↓
3. User completes registration
   ↓
4. Backend creates user account
   ↓
5. ✅ SIGNUP BONUS GRANTED IMMEDIATELY
   ↓
6. User receives JWT token
   ↓
7. User logged in with 100 EZT balance
```

---

## 💻 **Implementation Details**

### **File**: `backend/services/authService.js`

**Called in TWO places:**

#### **1. Regular User Registration** (Line 465)
```javascript
async function registerUser(payload) {
  // ... create user account ...
  
  // Grant signup bonus
  await grantSignupBonus(userId);  // ✅ 100 EZT credited
  
  // Return JWT token
  return { token, user };
}
```

#### **2. Super Admin Registration** (Line 336)
```javascript
async function registerSuperAdmin(payload) {
  // ... create super admin account ...
  
  // Grant signup bonus
  await grantSignupBonus(userId);  // ✅ 100 EZT credited
  
  // Return JWT token
  return { token, user };
}
```

---

## 🎁 **Bonus Grant Logic**

### **File**: `backend/services/loyaltyService.js`

```javascript
async function grantSignupBonus(userId, bonusTokens = 100) {
  const pool = getPool();
  
  try {
    const bonus = parseFloat(bonusTokens);  // Default: 100 EZT
    
    if (!bonus || bonus <= 0) {
      return;  // Skip if invalid amount
    }
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // 1. Get user's current balance (with row lock)
      const balanceResult = await client.query(
        'SELECT available_tokens FROM users WHERE id = $1 FOR UPDATE',
        [userId]
      );
      
      if (balanceResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return;  // User not found
      }
      
      const balanceBefore = parseFloat(balanceResult.rows[0].available_tokens || 0);
      const balanceAfter = balanceBefore + bonus;
      
      // 2. Update user's token balance
      await client.query(`
        UPDATE users
        SET available_tokens = available_tokens + $1,
            total_tokens_earned = total_tokens_earned + $1,
            signup_bonus_credited = true
        WHERE id = $2
      `, [bonus, userId]);
      
      // 3. Record in token ledger
      await client.query(`
        INSERT INTO token_ledger (
          user_id,
          transaction_id,
          amount,
          ledger_type,
          balance_before,
          balance_after,
          description
        ) VALUES ($1, NULL, $2, 'airdrop', $3, $4, $5)
      `, [
        userId,
        bonus,
        balanceBefore,
        balanceAfter,
        'Signup bonus credited (will sync with blockchain airdrop)'
      ]);
      
      await client.query('COMMIT');
      
      log(`🎁 Credited signup bonus of ${bonus.toFixed(2)} EZT to user ${userId}`);
      
    } catch (txError) {
      await client.query('ROLLBACK');
      throw txError;
    } finally {
      client.release();
    }
    
  } catch (error) {
    logError('❌ Signup bonus credit error:', error);
    // Does NOT throw - bonus failure won't block registration
  }
}
```

---

## 🔍 **Key Points**

### **1. Amount**
```
Default Bonus: 100 EZT
Value: ₹10,000 (at ₹100/EZT)
Can be customized: grantSignupBonus(userId, 150) for 150 EZT
```

### **2. Database Updates**
```sql
-- Users table updated:
available_tokens = available_tokens + 100
total_tokens_earned = total_tokens_earned + 100
signup_bonus_credited = true  ← Flag to prevent double-credit

-- Token ledger entry created:
ledger_type = 'airdrop'
description = 'Signup bonus credited (will sync with blockchain airdrop)'
```

### **3. Transaction Safety**
```
✅ Uses database transaction (BEGIN/COMMIT/ROLLBACK)
✅ Row-level locking (FOR UPDATE)
✅ Atomic operation
✅ If bonus fails, registration still succeeds (error caught)
```

### **4. Ledger Type**
```
ledger_type = 'airdrop'
```
**Why "airdrop"?** The description mentions "will sync with blockchain airdrop", suggesting future blockchain integration where these tokens will be matched on-chain.

---

## 📊 **User Balance After Registration**

```javascript
// Example new user:
{
  id: 'uuid-here',
  first_name: 'John',
  last_name: 'Doe',
  phone_number: '+919876543210',
  email: 'john@example.com',
  
  // Token balances:
  available_tokens: 100.00000,      // ✅ Can spend immediately
  total_tokens_earned: 100.00000,   // ✅ Lifetime earnings
  total_tokens_spent: 0.00000,      // No spending yet
  
  // Status:
  signup_bonus_credited: true,      // ✅ Bonus already given
  current_tier_id: 'ather-tier-id', // Starts at Ather (1%)
  
  // Spending:
  total_spend: 0.00,                // No purchases yet
}
```

---

## 🔒 **Protection Against Double-Credit**

### **Database Column**: `signup_bonus_credited`

```sql
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS signup_bonus_credited BOOLEAN DEFAULT false;
```

**Purpose**: Prevents bonus from being credited multiple times

**Usage**: 
- Set to `true` after bonus is granted
- Can be checked before granting (though current code doesn't check this flag before granting)

**Note**: Current implementation doesn't check this flag before granting, relying on the fact that `grantSignupBonus()` is only called once during registration.

---

## 🎯 **Retroactive Bonus Migration**

### **File**: `backend/db/20251108_retrospective_signup_bonus.sql`

There's also a migration that **retroactively grants 100 EZT** to existing users who signed up before this feature was implemented:

```sql
-- Credit signup bonus to all existing users who don't have it
UPDATE users
   SET available_tokens = COALESCE(available_tokens, 0) + 100,
       total_tokens_earned = COALESCE(total_tokens_earned, 0) + 100,
       signup_bonus_credited = true
 WHERE signup_bonus_credited IS DISTINCT FROM true;

-- Record in token ledger
INSERT INTO token_ledger (...)
SELECT ..., 'Retroactive signup bonus credited (blockchain airdrop placeholder)'
FROM updated;
```

**Purpose**: Fair treatment - give existing users the same bonus as new users.

---

## 💰 **First Booking Scenario**

### **New User Booking Flow:**

```
Registration:
├─ User creates account
├─ Receives 100 EZT (₹10,000)
└─ Balance: 100 EZT

First Booking (₹2000 event):
├─ User can redeem up to 20 EZT (₹2000)
├─ Actual redemption: 10 EZT (₹1000)
├─ Pay remaining: ₹1000
├─ Earn back: 0.2 EZT (1% Ather tier on ₹1000)
└─ New balance: 90.2 EZT

Remaining:
└─ User still has ₹9,020 worth of tokens!
```

**Impact**: Very generous signup bonus - user can essentially get their first ₹10,000 worth of bookings at deep discount!

---

## 🚀 **Marketing Impact**

### **Acquisition Value**:
```
Cost to Business: ₹10,000 per new user
User Perceived Value: ₹10,000 in discounts
Conversion Benefit: Removes payment barrier for first purchase
```

### **Usage Limits**:
```
✅ Can use on multiple bookings
✅ Can combine with bank offers
✅ Tokens don't expire (based on current code)
❌ No minimum order requirement mentioned
```

---

## 🔄 **Comparison with Loyalty Points**

**Two separate systems:**

### **EZT Tokens (Signup Bonus = 100 EZT)**
- Monetary value: 1 EZT = ₹100
- Can be redeemed for discounts
- Granted as signup bonus
- Earned from bookings (1-5% based on tier)

### **Loyalty Points (No signup bonus)**
- No monetary value (can't be redeemed for discounts)
- Used for gamification/tier progression
- Earned from bookings
- Not given at signup

---

## 📝 **Code Locations Summary**

```
Registration Flow:
├─ backend/services/authService.js
│  ├─ registerUser() - Line 364
│  │  └─ grantSignupBonus(userId) - Line 465
│  └─ registerSuperAdmin() - Line 277
│     └─ grantSignupBonus(userId) - Line 336
│
└─ backend/services/loyaltyService.js
   └─ grantSignupBonus() - Line 4
      ├─ Default: 100 EZT
      ├─ Updates users table
      └─ Records in token_ledger

Database Schema:
├─ users.available_tokens
├─ users.total_tokens_earned
├─ users.signup_bonus_credited
└─ token_ledger.ledger_type = 'airdrop'

Migration Files:
├─ 20251108_retrospective_signup_bonus.sql
└─ 20251108_update_tiers.sql
```

---

## ✅ **Summary**

**Question**: "On creation of new user are we granting him 100 EZT?"

**Answer**: **YES! ✅**

- **Amount**: 100 EZT (₹10,000 value)
- **When**: Immediately upon registration
- **How**: Via `grantSignupBonus()` function
- **Ledger Type**: 'airdrop'
- **Protection**: `signup_bonus_credited` flag
- **Failure Handling**: Silent fail (won't block registration)
- **Retroactive**: Existing users also got it via migration

**This is a VERY generous welcome bonus** - equivalent to giving every new user ₹10,000 in platform credit! 🎉

