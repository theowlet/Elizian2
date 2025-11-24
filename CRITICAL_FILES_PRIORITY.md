# Critical Files for Code Review - Priority Order

## 🔴 **TIER 1: CRITICAL BUSINESS LOGIC (Review First)**

These files contain the core workflows and are most likely to have bugs:

### 1. Deal/Offer Approval Workflow
**Priority: HIGHEST**
- `backend/src/repositories/adminRepository.js` ⭐⭐⭐
  - **Why**: Contains `checkDealEligibility()`, `updateDealStatus()`, `updateTrendingStatus()`, `listAdminDeals()`
  - **Issues to check**: Status transitions, eligibility logic, trending/featured checks, `forced_by_admin` flag handling
- `backend/src/services/adminService.js` ⭐⭐⭐
  - **Why**: Contains `validateStatusTransition()`, `bulkApproveDeals()`, `bulkRejectDeals()`, `updateOfferFeaturedStatus()`
  - **Issues to check**: State machine logic, transition validation, bulk operations

### 2. Partner Approval Workflow
**Priority: HIGHEST**
- `backend/src/repositories/adminRepository.js` ⭐⭐⭐
  - **Why**: Contains `listAdminPartners()`, `updatePartnerStatus()`, `updatePartnerFeaturedEligibility()`
  - **Issues to check**: Partner status derivation, approval/rejection logic, featured eligibility
- `backend/src/services/partnerService.js` ⭐⭐
  - **Why**: Contains `registerPartner()` - sets initial status
  - **Issues to check**: Default status values, registration workflow

### 3. Booking System (Most Complex)
**Priority: HIGHEST**
- `backend/src/services/bookingService.js` ⭐⭐⭐
  - **Why**: Handles bookings with bank offers, reservations, pre-orders, tier processing
  - **Issues to check**: Transaction safety, bank offer calculation, tier upgrade logic, EZT rewards
- `backend/src/repositories/bookingRepository.js` ⭐⭐
  - **Why**: Database operations for bookings
  - **Issues to check**: Query correctness, transaction handling

### 4. Voucher System (Race Conditions)
**Priority: HIGHEST**
- `backend/src/services/voucherService.js` ⭐⭐⭐
  - **Why**: Contains `createVoucherForBooking()`, `redeemVoucher()` - critical for race conditions
  - **Issues to check**: Transaction safety, `FOR UPDATE` locks, duplicate prevention, validation
- `backend/src/repositories/voucherRepository.js` ⭐⭐
  - **Why**: Database operations for vouchers
  - **Issues to check**: Unique constraints, query correctness, transaction handling

### 5. Tier System (Loyalty Logic)
**Priority: HIGH**
- `backend/src/services/tierService.js` ⭐⭐
  - **Why**: Contains `processBookingWithTier()`, `getUserTier()`, tier upgrade logic
  - **Issues to check**: Annual spend calculation, tier upgrade logic, EZT reward calculation
- `backend/src/repositories/tierRepository.js` ⭐⭐
  - **Why**: Database operations for tiers
  - **Issues to check**: Tier calculation queries, annual spend updates

---

## 🟠 **TIER 2: SUPPORTING BUSINESS LOGIC (Review Second)**

### 6. Bank Offers (BanQ)
**Priority: HIGH**
- `backend/src/services/bankOfferService.js` ⭐⭐
  - **Why**: Bank offer calculation and application
  - **Issues to check**: Discount calculation, minimum amount validation, usage tracking
- `backend/src/repositories/bankOfferRepository.js` ⭐
  - **Why**: Database operations for bank offers

### 7. Reservations & Pre-Orders
**Priority: MEDIUM-HIGH**
- `backend/src/services/reservationService.js` ⭐
  - **Why**: Table reservation logic
  - **Issues to check**: Availability checking, time slot validation
- `backend/src/services/preOrderService.js` ⭐
  - **Why**: Pre-ordering logic (Echelon tier)
  - **Issues to check**: Tier validation, item management

### 8. Offer/Deal Management
**Priority: MEDIUM-HIGH**
- `backend/src/services/offerService.js` ⭐⭐
  - **Why**: Deal creation, updates, public listing
  - **Issues to check**: Public offer visibility, filtering logic, status handling
- `backend/src/repositories/offerRepository.js` ⭐⭐
  - **Why**: Database queries for offers
  - **Issues to check**: Public listing queries, status filters, partner joins

---

## 🟡 **TIER 3: API LAYER (Review Third)**

### 9. Controllers (Request Handlers)
**Priority: MEDIUM**
- `backend/src/controllers/adminController.js` ⭐⭐
  - **Why**: Admin API endpoints
  - **Issues to check**: Request validation, error handling, response formatting
- `backend/src/controllers/bookingController.js` ⭐⭐
  - **Why**: Booking API endpoints
  - **Issues to check**: Request validation, data extraction, error handling
- `backend/src/controllers/voucherController.js` ⭐
  - **Why**: Voucher API endpoints
  - **Issues to check**: Authentication, partner ID extraction
- `backend/src/controllers/partnerController.js` ⭐
  - **Why**: Partner API endpoints
- `backend/src/controllers/offerController.js` ⭐
  - **Why**: Offer API endpoints

### 10. Routes (API Endpoints)
**Priority: MEDIUM**
- `backend/src/routes/adminRoutes.js` ⭐
  - **Why**: Admin route definitions
- `backend/src/routes/bookingRoutes.js` ⭐
  - **Why**: Booking route definitions
- `backend/src/routes/voucherRoutes.js` ⭐
  - **Why**: Voucher route definitions

---

## 🔵 **TIER 4: UTILITIES & CONFIG (Review Last)**

### 11. Utilities
**Priority: LOW-MEDIUM**
- `backend/src/utils/dealRules.js` ⭐
  - **Why**: Deal calculation rules (discount, pricing)
- `backend/src/utils/response.js` ⭐
  - **Why**: Response helpers
- `backend/src/utils/audit.js` ⭐
  - **Why**: Audit logging
- `backend/src/utils/queries.js` ⭐
  - **Why**: Common query helpers

### 12. Configuration
**Priority: LOW**
- `backend/src/config/db.js` ⭐
  - **Why**: Database connection
- `backend/src/config/env.js` ⭐
  - **Why**: Environment configuration
- `backend/src/app.js` ⭐
  - **Why**: Express app setup, middleware, route registration

---

## 📋 **RECOMMENDED REVIEW ORDER**

### Phase 1: Core Workflows (Start Here)
1. `backend/src/repositories/adminRepository.js` - Deal/partner approval logic
2. `backend/src/services/adminService.js` - State machine, bulk operations
3. `backend/src/services/bookingService.js` - Booking creation with all integrations
4. `backend/src/services/voucherService.js` - Voucher creation/redemption

### Phase 2: Supporting Logic
5. `backend/src/services/tierService.js` - Tier upgrades and EZT rewards
6. `backend/src/repositories/tierRepository.js` - Tier database operations
7. `backend/src/services/bankOfferService.js` - Bank offer calculations
8. `backend/src/services/offerService.js` - Public offer listing

### Phase 3: API Layer
9. `backend/src/controllers/adminController.js`
10. `backend/src/controllers/bookingController.js`
11. `backend/src/controllers/voucherController.js`

### Phase 4: Database Schema
12. `backend/db/elizian_schema.sql` - Understand data model
13. Recent migrations (2024-2025 dated files)

---

## 🎯 **SPECIFIC ISSUES TO CHECK**

### In `adminRepository.js`:
- ✅ `checkDealEligibility()` - Does it correctly handle `forced_by_admin`?
- ✅ `updateDealStatus()` - Does it preserve `forced_by_admin` when pausing/rejecting?
- ✅ `updateTrendingStatus()` - Does `partner_request` check eligibility?
- ✅ `listAdminPartners()` - Does it correctly derive partner status from `is_active`?

### In `adminService.js`:
- ✅ `validateStatusTransition()` - Are all valid transitions allowed? (`rejected → active`)
- ✅ `bulkApproveDeals()` - Does it handle eligibility correctly?
- ✅ `bulkRejectDeals()` - Can it reject already rejected deals?

### In `bookingService.js`:
- ✅ Transaction safety - Are all operations in transactions?
- ✅ Bank offer calculation - Is discount calculated before EZT redemption?
- ✅ Tier processing - Is `processBookingWithTier()` called after booking?
- ✅ Reservation/pre-order creation - Are they created correctly?

### In `voucherService.js`:
- ✅ `createVoucherForBooking()` - Does it check for existing vouchers?
- ✅ `redeemVoucher()` - Does it use `FOR UPDATE` lock?
- ✅ Transaction safety - Are operations atomic?
- ✅ Validation - Booking status, amount, expiry checks?

### In `tierService.js`:
- ✅ `processBookingWithTier()` - Is annual spend updated correctly?
- ✅ Tier upgrade logic - Does it check thresholds correctly?
- ✅ EZT calculation - Is percentage applied correctly?

---

## 📊 **QUICK REFERENCE: File Count by Priority**

- **Tier 1 (Critical)**: 8 files
- **Tier 2 (Supporting)**: 5 files
- **Tier 3 (API)**: 6 files
- **Tier 4 (Utilities)**: 5 files

**Total Critical Files: ~24 files**

---

## 💡 **REVIEW STRATEGY**

1. **Start with Tier 1 files** - These contain the most complex logic
2. **Focus on functions mentioned in conversation history** - These are known problem areas
3. **Check transaction safety** - Look for missing `BEGIN`/`COMMIT`/`ROLLBACK`
4. **Verify state machine logic** - Ensure all valid transitions are allowed
5. **Check race conditions** - Look for missing locks (`FOR UPDATE`)
6. **Validate data consistency** - Ensure related data is updated atomically

---

## 🔗 **RELATED FILES**

When reviewing the above files, you may also need:
- `backend/src/utils/dealRules.js` - For discount calculations
- `backend/src/utils/audit.js` - For audit logging
- `backend/middleware/authenticateToken.js` - For authentication
- `backend/src/middleware/requireSuperAdmin.js` - For admin authorization

