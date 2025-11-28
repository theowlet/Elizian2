# Complete Rewards Flow Trace - Booking to Visibility

## Current Implementation Status

### ✅ Backend - Rewards Calculation (COMPLETE)

**Location**: `backend/src/services/bookingService.js` (lines 310-400)

**Flow**:
1. **Booking Created** → `createBooking()`
2. **EZT Redemption** → `tokenService.redeemTokens()` (if user redeems EZT)
3. **Tier Processing** → `tierService.processBookingWithTier()` 
   - Calculates EZT earned based on tier percentage
   - Updates annual spend
   - Checks for tier upgrade
4. **Token Award** → `tokenService.awardTokens()`
   - Updates `users.available_tokens`
   - Updates `users.total_tokens_earned`
   - Records in `token_ledger`
5. **Loyalty Points** → `loyaltyEngine.calculateEarning()` + `loyaltyEngine.recordActivity()`
   - Calculates points (10 points per ₹100)
   - Records in `loyalty_activity`
   - Records in `loyalty_points`
6. **Booking Updated** → `bookingRepository.updateBookingTierInfo()`
   - Stores `ezt_earned`, `points_earned`, `user_tier_at_booking`
7. **Real-time Events** → Emits `tokens:updated`, `loyalty:updated`

### ⚠️ Missing: API Endpoints for Rewards Data

**Needed**:
- `/api/v1/rewards/summary` - Complete rewards summary
- `/api/v1/rewards/ezt/transactions` - EZT transaction history
- `/api/v1/rewards/loyalty/transactions` - Loyalty points history
- `/api/v1/rewards/tier/history` - Tier upgrade history

### ⚠️ Missing: Frontend Display

**User App** (`index.html`):
- ✅ Shows EZT balance (via `updateProfileInfo()`)
- ✅ Shows tier info
- ❌ Missing: Transaction history
- ❌ Missing: Loyalty points display
- ❌ Missing: Tier history

**Admin Console** (`admin.html`):
- ✅ Shows user list
- ❌ Missing: User rewards details
- ❌ Missing: Rewards transaction history
- ❌ Missing: Manual credit functionality

**Partner Console** (`partner-console.html`):
- ✅ Shows bookings
- ❌ Missing: Rewards earned per booking
- ❌ Missing: Customer rewards summary

## Implementation Plan

1. Create rewards API endpoints
2. Add rewards display to user app
3. Add rewards visibility to admin console
4. Add rewards visibility to partner console
5. Add real-time updates for rewards display

