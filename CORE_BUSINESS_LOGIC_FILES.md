# Core Business Logic Files for Review

## Top 10 Most Important Files

These files contain the core business logic that drives the Elizian platform. Review these files to understand the complete business flow, rules, and calculations.

### 1. **Booking Service** ⭐⭐⭐
**File**: `backend/src/services/bookingService.js`
**Purpose**: Core booking creation, cancellation, refund logic
**Key Logic**:
- Booking creation with transaction management
- EZT token and loyalty point calculations
- Tier progression triggers
- Bank offer application
- Refund processing
- Seat/availability management

### 2. **Token Service** ⭐⭐⭐
**File**: `backend/src/services/tokenService.js`
**Purpose**: EZT (Elizian Token) earning and redemption
**Key Logic**:
- Token earning formula: `(amount_spent * tier_percentage) / 100 / 100`
- Token redemption with balance validation
- Token ledger management
- Balance calculations

### 3. **Tier Service** ⭐⭐⭐
**File**: `backend/src/services/tierService.js`
**Purpose**: Membership tier progression and management
**Key Logic**:
- Annual spend tracking
- Tier upgrade/downgrade logic
- Tier eligibility checks
- EZT reward percentage by tier
- Tier history tracking

### 4. **Offer Service** ⭐⭐⭐
**File**: `backend/src/services/offerService.js`
**Purpose**: Deal/offer management and business rules
**Key Logic**:
- Offer creation and validation
- Discount calculation rules
- Schedule status determination (upcoming/live/expired)
- Approval workflow
- Trending/promotion logic
- Category and service type handling

### 5. **Voucher Service** ⭐⭐
**File**: `backend/src/services/voucherService.js`
**Purpose**: Voucher generation and redemption
**Key Logic**:
- Unique voucher code generation
- QR code generation
- Voucher redemption validation
- Expiry handling
- Booking-to-voucher conversion

### 6. **Loyalty Engine Service** ⭐⭐
**File**: `backend/services/loyaltyEngineService.js`
**Purpose**: Loyalty points system
**Key Logic**:
- Loyalty point earning rules
- Point redemption
- Activity tracking
- Balance management

### 7. **Rewards Service** ⭐⭐
**File**: `backend/src/services/rewardsService.js`
**Purpose**: Aggregated rewards management
**Key Logic**:
- User rewards summary
- EZT transaction history
- Loyalty transaction history
- Tier history
- Manual credit by admin

### 8. **Booking Repository** ⭐⭐
**File**: `backend/src/repositories/bookingRepository.js`
**Purpose**: Database operations for bookings
**Key Logic**:
- Booking CRUD operations
- Transaction management
- Booking reference generation
- Status updates
- Query optimization

### 9. **Tier Repository** ⭐
**File**: `backend/src/repositories/tierRepository.js`
**Purpose**: Tier database operations
**Key Logic**:
- Tier data retrieval
- Tier threshold queries
- User tier updates
- Tier history management

### 10. **Offer Repository** ⭐
**File**: `backend/src/repositories/offerRepository.js`
**Purpose**: Offer database operations
**Key Logic**:
- Offer queries with filters
- Public vs admin offer views
- Category filtering
- Schedule-based filtering
- Trending/promoted filtering

---

## Additional Important Files (Secondary Review)

### 11. **Bank Offer Service**
**File**: `backend/src/services/bankOfferService.js`
**Purpose**: Bank offer rules and application

### 12. **Reservation Service**
**File**: `backend/src/services/reservationService.js`
**Purpose**: Restaurant reservation management

### 13. **Pre-Order Service**
**File**: `backend/src/services/preOrderService.js`
**Purpose**: Pre-order functionality

### 14. **Partner Service**
**File**: `backend/src/services/partnerService.js`
**Purpose**: Partner management and operations

---

## Review Priority

### **Critical (Must Review First)**
1. `bookingService.js` - Core transaction flow
2. `tokenService.js` - Token economics
3. `tierService.js` - Tier progression
4. `offerService.js` - Deal management

### **Important (Review Second)**
5. `voucherService.js` - Voucher system
6. `loyaltyEngineService.js` - Loyalty points
7. `rewardsService.js` - Rewards aggregation
8. `bookingRepository.js` - Data layer

### **Supporting (Review Third)**
9. `tierRepository.js` - Tier data layer
10. `offerRepository.js` - Offer data layer

---

## Key Business Rules to Verify

1. **Token Earning Formula**: `(amount_spent * tier_percentage) / 100 / 100`
2. **Tier Progression**: Based on annual spend thresholds
3. **Discount Calculation**: Multiple discount types (percentage, fixed, bank offers)
4. **Booking Flow**: Create → Confirm → Complete → Refund
5. **Voucher Generation**: Unique code with collision detection
6. **Offer Status**: Draft → Pending → Active → Paused/Expired
7. **Tier Levels**: Ather (1%) → Nova (2%) → Luminar (3%) → Valiant (4%) → Echelon (5%)

---

## Questions to Ask During Review

1. Are all calculations correct and consistent?
2. Are transactions properly atomic?
3. Are error cases handled gracefully?
4. Are business rules enforced consistently?
5. Are there any race conditions?
6. Are validations comprehensive?
7. Are edge cases handled?
8. Is the code maintainable and well-structured?

