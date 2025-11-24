# Backend Files for Claude Review & Debugging

## 📋 **CRITICAL FILES (Must Upload)**

### **1. Core Application Files**
- `backend/src/server.js` - Server entry point
- `backend/src/app.js` - Express app configuration, middleware, route registration
- `backend/src/config/db.js` - Database connection configuration
- `backend/src/config/env.js` - Environment configuration

### **2. Routes (API Endpoints)**
- `backend/routes/authRoutes.js` - Authentication routes (if exists)
- `backend/routes/loyaltyRoutes.js` - Loyalty/EZT routes (if exists)
- `backend/src/routes/adminRoutes.js` - Admin operations
- `backend/src/routes/partnerRoutes.js` - Partner management
- `backend/src/routes/bookingRoutes.js` - Booking operations
- `backend/src/routes/offerRoutes.js` - Deal/offer management
- `backend/src/routes/voucherRoutes.js` - Voucher operations
- `backend/src/routes/bankOfferRoutes.js` - BanQ (bank offers)
- `backend/src/routes/reservationRoutes.js` - Table reservations
- `backend/src/routes/preOrderRoutes.js` - Pre-ordering (Echelon tier)
- `backend/src/routes/tierRoutes.js` - Loyalty tier system
- `backend/src/routes/userRoutes.js` - User management
- `backend/src/routes/categoryRoutes.js` - Category management

### **3. Controllers (Request Handlers)**
- `backend/src/controllers/adminController.js` - Admin logic
- `backend/src/controllers/partnerController.js` - Partner operations
- `backend/src/controllers/bookingController.js` - Booking creation/management
- `backend/src/controllers/offerController.js` - Deal/offer operations
- `backend/src/controllers/voucherController.js` - Voucher operations
- `backend/src/controllers/categoryController.js` - Category operations

### **4. Services (Business Logic)**
- `backend/src/services/adminService.js` - Admin business logic (status transitions, eligibility)
- `backend/src/services/partnerService.js` - Partner registration, approval workflow
- `backend/src/services/bookingService.js` - Booking creation, bank offers, reservations, pre-orders
- `backend/src/services/offerService.js` - Deal/offer business logic
- `backend/src/services/voucherService.js` - Voucher creation, redemption, race conditions
- `backend/src/services/bankOfferService.js` - BanQ offer calculations
- `backend/src/services/reservationService.js` - Table reservation logic
- `backend/src/services/preOrderService.js` - Pre-ordering logic
- `backend/src/services/tierService.js` - Loyalty tier calculations
- `backend/src/services/tokenService.js` - EZT token management

### **5. Repositories (Database Layer)**
- `backend/src/repositories/adminRepository.js` - Admin database operations (deal/partner status, eligibility)
- `backend/src/repositories/partnerRepository.js` - Partner database operations
- `backend/src/repositories/bookingRepository.js` - Booking database operations
- `backend/src/repositories/offerRepository.js` - Deal/offer database operations
- `backend/src/repositories/voucherRepository.js` - Voucher database operations
- `backend/src/repositories/bankOfferRepository.js` - BanQ database operations
- `backend/src/repositories/reservationRepository.js` - Reservation database operations
- `backend/src/repositories/preOrderRepository.js` - Pre-order database operations
- `backend/src/repositories/tierRepository.js` - Tier database operations
- `backend/src/repositories/userRepository.js` - User database operations

### **6. Middleware**
- `backend/middleware/authenticateToken.js` - JWT authentication
- `backend/src/middleware/requireSuperAdmin.js` - Super admin authorization
- `backend/middleware/requestContext.js` - Request context (if exists)
- `backend/middleware/errorHandler.js` - Error handling middleware (if exists)
- `backend/middleware/rateLimiters.js` - Rate limiting (if exists)

### **7. Utilities**
- `backend/src/utils/response.js` - Response helpers (successResponse, errorResponse)
- `backend/src/utils/logger.js` - Logging utilities
- `backend/src/utils/jwt.js` - JWT token utilities
- `backend/src/utils/dealRules.js` - Deal calculation rules
- `backend/src/utils/validator.js` - Validation utilities
- `backend/src/utils/audit.js` - Audit logging

---

## 📊 **DATABASE SCHEMA FILES (Important for Understanding Data Model)**

### **Core Schema**
- `backend/db/elizian_schema.sql` - Main database schema

### **Recent Migrations (Critical for Current State)**
- `backend/db/20251205_admin_console_fix.sql` - Status columns, audit log fields
- `backend/db/20250107_bank_offers_reservations.sql` - BanQ, reservations, pre-orders
- `backend/db/20250107_loyalty_tiers_system.sql` - Tier system
- `backend/db/20250106_voucher_fixes.sql` - Voucher improvements
- `backend/db/20241118_add_offer_status.sql` - Offer status enum

---

## 🔍 **OPTIONAL BUT HELPFUL FILES**

### **Background Jobs**
- `backend/src/jobs/voucherCleanupJob.js` - Voucher expiration
- `backend/src/jobs/bookingAutoCancelJob.js` - Auto-cancel logic
- `backend/src/jobs/eventCleanupJob.js` - Event cleanup

### **Additional Services**
- `backend/src/services/partnerAuthService.js` - Partner authentication
- `backend/src/services/menuService.js` - Menu management
- `backend/src/services/orderService.js` - Order management
- `backend/src/services/eventService.js` - Event management

### **Additional Repositories**
- `backend/src/repositories/partnerAuthRepository.js` - Partner auth database
- `backend/src/repositories/menuRepository.js` - Menu database
- `backend/src/repositories/orderRepository.js` - Order database
- `backend/src/repositories/eventRepository.js` - Event database
- `backend/src/repositories/transactionRepository.js` - Transaction database
- `backend/src/repositories/settingsRepository.js` - Settings database

---

## 📝 **RECOMMENDED PROMPT FOR CLAUDE**

When uploading these files to Claude, use this prompt:

```
I need you to review my backend codebase for debugging logic issues. The system is a booking platform with:

1. **Deal/Offer Management**: Partners create deals, admins approve/reject them with state machine workflow
2. **Partner Management**: Partner registration, approval workflow, featured eligibility
3. **Booking System**: Handles bookings with bank offers (BanQ), table reservations, and pre-ordering (Echelon tier)
4. **Voucher System**: Voucher creation and redemption with race condition protection
5. **Loyalty Tier System**: 5-tier system with EZT rewards based on annual spending
6. **Admin Console**: Deal/partner moderation, bulk operations, trending/featured management

Please review for:
- Logic errors in state transitions
- Race conditions
- Missing validations
- Transaction safety issues
- Data consistency problems
- Error handling gaps
- Performance issues
- Security vulnerabilities

Focus especially on:
- Deal approval/rejection workflow
- Partner approval workflow
- Booking creation with bank offers/reservations/pre-orders
- Voucher creation and redemption
- Tier upgrade logic
- Trending/featured eligibility checks
```

---

## 🎯 **QUICK REFERENCE: File Count**

- **Core Files**: 4 files
- **Routes**: 13 files
- **Controllers**: 10 files
- **Services**: 14 files
- **Repositories**: 18 files
- **Middleware**: 1-2 files
- **Utils**: 6 files
- **Database**: 5-6 critical migration files

**Total Critical Files: ~60-65 files**

---

## 💡 **TIPS FOR UPLOAD**

1. **Upload in batches** - Group by layer (routes → controllers → services → repositories)
2. **Include database schema** - Helps Claude understand data relationships
3. **Mention specific issues** - If you know of particular bugs, mention them
4. **Provide context** - Explain the business logic and workflows
5. **Start with critical files** - Upload the most important ones first (adminService, bookingService, voucherService)

