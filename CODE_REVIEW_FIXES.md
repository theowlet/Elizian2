# Code Review & Debug - Inconsistencies Found & Fixed

## Issues Found:

### 1. ❌ Missing voucher_state transition when booking status changes to 'confirmed'
**Location:** `backend/src/services/adminService.js` - `updateBookingStatus`
**Issue:** When admin updates booking status to 'confirmed', voucher_state should transition from 'booked' to 'active', but this is not happening.

### 2. ❌ Missing `expires_at` field in booking query
**Location:** `backend/src/services/enhancedRedemptionService.js` - booking query
**Issue:** `validateValidityWindow` checks for `booking.expires_at`, but the query doesn't select this field.

### 3. ❌ State validation allows 'booked' → 'redeemed' transition
**Location:** `backend/src/services/enhancedRedemptionService.js` - state validation
**Issue:** Code only checks if transition is valid, but doesn't enforce that currentState must be 'active' before redeeming. The state machine allows 'booked' → 'active', but we should explicitly require 'active' state.

### 4. ❌ Missing voucher_state sync when booking status changes
**Location:** `backend/src/services/adminService.js` - `updateBookingStatus`
**Issue:** When booking status changes, voucher_state should be updated accordingly (e.g., 'pending' → 'booked', 'confirmed' → 'active').

---

## Fixes Applied:

