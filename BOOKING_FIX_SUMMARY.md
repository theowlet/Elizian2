# Booking System Fix - Column Name Mismatch

**Date**: 2025-11-24  
**Issue**: Event booking failing with "column offer_id does not exist" error

---

## 🔴 **Error Messages**

```
Failed to load resource: the server responded with a status of 500 (Internal Server Error)
❌ Booking error response: {"success":false,"error":"column \"offer_id\" of relation \"bookings\" does not exist"}
```

---

## 🔍 **Root Cause**

### **Column Name Mismatch**

The `bookingRepository.js` was trying to insert into columns that don't exist in the `bookings` table:

**Code was using:**
- `offer_id` ❌
- `amount` ❌
- `commission_percentage` ❌
- `partner_earning` ❌

**Actual table has:**
- `deal_id` ✅
- `total_price` ✅
- `fiat_amount` ✅
- `ezt_redeemed` ✅
- `partner_id` ✅

---

## ✅ **Solution Implemented**

### **1. Fixed `bookingRepository.js` - Updated Column Mapping**

**File**: `backend/src/repositories/bookingRepository.js`

**Before** (Lines 6-24):
```javascript
async function createBooking(bookingData) {
  const result = await pool.query(
    `INSERT INTO bookings (user_id, event_id, offer_id, booking_date, status, amount, 
      commission_percentage, partner_earning, num_tickets, special_requests)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      bookingData.user_id,
      bookingData.event_id || null,
      bookingData.offer_id || null,  // ❌ Column doesn't exist
      bookingData.status,
      bookingData.amount,              // ❌ Column doesn't exist
      bookingData.commission_percentage, // ❌ Column doesn't exist
      bookingData.partner_earning,     // ❌ Column doesn't exist
      bookingData.num_tickets,
      bookingData.special_requests || null
    ]
  );
  return result.rows[0];
}
```

**After** (Lines 6-43):
```javascript
async function createBooking(bookingData) {
  // Map the service data to actual table columns
  const result = await pool.query(
    `INSERT INTO bookings (
      user_id, 
      event_id, 
      deal_id,              -- ✅ Correct column name
      partner_id,           -- ✅ Added
      show_id,              -- ✅ Added
      booking_date, 
      booking_time,
      status, 
      total_price,          -- ✅ Correct column name (instead of amount)
      fiat_amount,          -- ✅ Added (original amount before EZT)
      ezt_redeemed,         -- ✅ Added
      num_tickets, 
      num_guests,
      special_requests,
      booking_type,         -- ✅ Added
      reward_eligible       -- ✅ Added
    )
     VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, CURRENT_TIME, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING *`,
    [
      bookingData.user_id,
      bookingData.event_id || null,
      bookingData.deal_id || bookingData.offer_id || null,  // ✅ Support both
      bookingData.partner_id || null,
      bookingData.show_id || null,
      bookingData.status || 'pending',
      bookingData.amount || bookingData.total_price || 0,   // total_price
      bookingData.amount || bookingData.fiat_amount || 0,   // fiat_amount
      bookingData.ezt_redeemed || 0,
      bookingData.num_tickets || 1,
      bookingData.num_guests || bookingData.num_tickets || 1,
      bookingData.special_requests || null,
      bookingData.booking_type || (bookingData.event_id ? 'event' : 'restaurant'),
      bookingData.reward_eligible !== undefined ? bookingData.reward_eligible : true
    ]
  );
  return result.rows[0];
}
```

### **2. Updated `bookingService.js` - Added Required Fields**

**File**: `backend/src/services/bookingService.js`

**Change 1** - Added deal_id when creating offer bookings (Line 102-104):
```javascript
// Before
bookingPayload.offer_id = offer_id;
bookingPayload.status = 'confirmed';

// After
bookingPayload.deal_id = offer_id;  // ✅ Use deal_id to match table schema
bookingPayload.offer_id = offer_id;  // Keep for backwards compatibility
bookingPayload.status = 'confirmed';
```

**Change 2** - Added required fields before creating booking (Line 182-188):
```javascript
// Before
bookingPayload.amount = finalAmount;
bookingPayload.commission_percentage = commission_percentage;
bookingPayload.partner_earning = partner_earning;
const booking = await bookingRepository.createBooking(bookingPayload);

// After
bookingPayload.amount = finalAmount;
bookingPayload.fiat_amount = amount;  // ✅ Original amount before EZT discount
bookingPayload.ezt_redeemed = eztRedeemed;  // ✅ Added
bookingPayload.partner_id = partner_id;  // ✅ Added
bookingPayload.reward_eligible = true;  // ✅ Added
bookingPayload.commission_percentage = commission_percentage;  // For transaction record
bookingPayload.partner_earning = partner_earning;  // For transaction record
const booking = await bookingRepository.createBooking(bookingPayload);
```

---

## 📊 **Bookings Table Schema (Reference)**

```sql
Table "public.bookings"
Column              | Type                        | Nullable | Default
--------------------+-----------------------------+----------+-------------
id                  | uuid                        | not null | gen_random_uuid()
user_id             | uuid                        | not null | 
event_id            | uuid                        |          | 
deal_id             | uuid                        |          |  ✅ (not offer_id)
partner_id          | uuid                        |          | 
show_id             | uuid                        |          | 
booking_date        | date                        |          | 
booking_time        | time without time zone      |          | 
status              | character varying(20)       |          | 'pending'
total_price         | numeric(10,2)               |          |  ✅ (not amount)
fiat_amount         | numeric(12,2)               |          | 0
ezt_redeemed        | numeric(15,5)               |          | 0
num_tickets         | integer                     |          | 
num_guests          | integer                     |          | 
special_requests    | text                        |          | 
booking_type        | character varying(20)       |          | 'event'
reward_eligible     | boolean                     |          | false
reward_credited     | boolean                     |          | false
created_at          | timestamp                   |          | CURRENT_TIMESTAMP
```

---

## 🧪 **Testing**

### **Test Case 1: Event Booking**
```bash
curl -X POST http://localhost:5001/api/v1/bookings \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "event_id": "<event-uuid>",
    "num_tickets": 2,
    "special_requests": "Window seat please"
  }'
```

**Expected**: ✅ 200 OK with booking details

### **Test Case 2: Offer/Deal Booking**
```bash
curl -X POST http://localhost:5001/api/v1/bookings \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "offer_id": "<offer-uuid>",
    "num_tickets": 1
  }'
```

**Expected**: ✅ 200 OK with booking details

### **Test Case 3: Show/Theatre Booking**
```bash
curl -X POST http://localhost:5001/api/v1/bookings \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "show_id": "<show-uuid>",
    "seat_template_ids": ["<seat-1>", "<seat-2>"]
  }'
```

**Expected**: ✅ 200 OK with booking details

---

## ✅ **What Was Fixed**

1. **Column Names**:
   - `offer_id` → `deal_id` ✅
   - `amount` → `total_price` and `fiat_amount` ✅
   - Removed non-existent columns: `commission_percentage`, `partner_earning` ✅

2. **Missing Fields**:
   - Added `partner_id` ✅
   - Added `show_id` support ✅
   - Added `booking_time` ✅
   - Added `booking_type` ✅
   - Added `ezt_redeemed` ✅
   - Added `num_guests` ✅
   - Added `reward_eligible` ✅

3. **Backwards Compatibility**:
   - Repository accepts both `deal_id` and `offer_id` ✅
   - Service passes both for safety ✅

---

## 🔄 **Database Consistency**

The fix aligns the code with the actual database schema. The `bookings` table uses:
- **`deal_id`** to reference `partner_offers(id)` (FK constraint exists)
- **`total_price`** for the final amount customer pays
- **`fiat_amount`** for the original amount before EZT redemption
- **`ezt_redeemed`** for tracking EZ Token usage

This naming is consistent with the loyalty/rewards system integration.

---

## 📝 **Files Modified**

1. **backend/src/repositories/bookingRepository.js**
   - Line 6-43: Rewrote `createBooking()` function with correct columns

2. **backend/src/services/bookingService.js**
   - Line 102-104: Added `deal_id` when creating offer bookings
   - Line 182-190: Added required fields (`partner_id`, `fiat_amount`, `ezt_redeemed`, `reward_eligible`)

---

## 🚀 **Deployment**

### **Steps**:
1. ✅ Code changes applied
2. ✅ Server restarted
3. ⏳ Test booking flow end-to-end

### **No Database Migration Needed**:
All required columns already exist in the `bookings` table. This was purely a code fix.

---

## 💡 **Recommendations**

1. **Add Type Definitions**: Consider adding TypeScript or JSDoc types for `bookingData` to catch these mismatches at development time

2. **Validation Layer**: Add schema validation using a library like `joi` or `zod` to validate incoming data matches expected table schema

3. **Integration Tests**: Add automated tests for booking creation to catch schema mismatches

4. **Documentation**: Keep database schema documentation in sync with code

---

**Status**: ✅ **FIXED**  
**Tested**: ⏳ Pending user testing  
**Server Status**: ✅ Running on port 5001

