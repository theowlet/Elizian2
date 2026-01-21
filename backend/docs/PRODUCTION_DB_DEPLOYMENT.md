# Production Database Deployment Guide

## 📋 Files Required for Production Database Setup

This document lists **all database files** your team needs to deploy to production.

---

## 🎯 **CRITICAL FILES (Must Run First)**

These files must be executed **in order** to set up the production database:

### 1. **Core Schema** (Base Tables)
- **File**: `backend/db/elizian_schema.sql`
- **Purpose**: Creates all core tables (users, partners, events, bookings, etc.)
- **Order**: **RUN FIRST**
- **Command**:
  ```bash
  psql -U postgres -d elizian -f db/elizian_schema.sql
  ```

---

## 🔧 **ESSENTIAL MIGRATIONS (Run After Core Schema)**

These migrations add critical features and fix production issues:

### 2. **Role System**
- **File**: `backend/db/add_role_id_column.sql`
- **Purpose**: Adds role-based access control (super_admin, partner_admin, user)
- **Order**: Run after `elizian_schema.sql`

### 3. **Bank Offers & Reservations**
- **File**: `backend/db/20250107_bank_offers_reservations.sql`
- **Purpose**: Creates restaurant availability, reservations, pre-orders tables
- **Order**: Run after core schema
- **⚠️ CRITICAL**: Needed for restaurant bookings to work

### 4. **Loyalty Tier System**
- **File**: `backend/db/20250107_loyalty_tiers_system.sql`
- **Purpose**: Creates loyalty tiers, tier progress, tier history
- **Order**: Run after core schema

### 5. **Tier System Compatibility**
- **File**: `backend/db/20250108_tier_system_compatibility.sql`
- **Purpose**: Adds tier-related columns to users table (annual_spend_current, etc.)
- **Order**: Run after loyalty tier system
- **⚠️ CRITICAL**: Needed for tier processing in bookings

### 6. **Voucher Fixes**
- **File**: `backend/db/20250106_voucher_fixes.sql`
- **Purpose**: Fixes voucher system schema and constraints
- **Order**: Run after core schema

---

## 🛠️ **BOOKING SYSTEM FIXES (Production Blockers)**

These migrations fix critical booking errors:

### 7. **Restaurant Availability Table**
- **File**: `backend/db/migrations/2025-01-21-create-restaurant-availability.sql`
- **Purpose**: Creates `restaurant_availability` table (if not already created)
- **⚠️ CRITICAL**: Prevents "relation restaurant_availability does not exist" error

### 8. **Fix All Bookings Columns**
- **File**: `backend/db/migrations/2025-01-21-fix-all-bookings-columns.sql`
- **Purpose**: Adds all missing columns to bookings table
- **⚠️ CRITICAL**: Prevents missing column errors

### 9. **Fix Booking Type Constraint**
- **File**: `backend/db/migrations/2025-01-21-fix-booking-type-constraint-final.sql`
- **Purpose**: Fixes `bookings_booking_type_check` constraint with correct values
- **⚠️ CRITICAL**: Prevents constraint violation errors
- **Allowed values**: `'offer', 'event', 'restaurant', 'theatre', 'spa', 'wellness', 'healthcare', 'travel'`

### 10. **Fix Loyalty Points FK Constraint**
- **File**: `backend/db/migrations/2025-01-21-fix-loyalty-points-fk-deferrable.sql`
- **Purpose**: Makes `loyalty_points_booking_id_fkey` DEFERRABLE to fix transaction errors
- **⚠️ CRITICAL**: Prevents FK violations during booking creation

---

## 📊 **FEATURE ENHANCEMENTS (Run After Critical Fixes)**

### 11. **EZT Token Updates**
- **File**: `backend/db/20251108_ezt_token_updates.sql`
- **Purpose**: Updates EZT token system schema

### 12. **Offer Discount Updates**
- **File**: `backend/db/20251108_offer_discount_updates.sql`
- **Purpose**: Adds discount features to offers

### 13. **Offer Status**
- **File**: `backend/db/20241118_add_offer_status.sql`
- **Purpose**: Adds status field to partner offers

### 14. **Admin Console Fixes**
- **File**: `backend/db/20251205_admin_console_fix.sql`
- **Purpose**: Fixes admin console database requirements

---

## 🔐 **PARTNER & ADMIN FEATURES**

### 15. **Partner Email Verification**
- **File**: `backend/db/migrations/2025-01-20-add-partner-email-verification.sql`
- **Purpose**: Adds email verification for partners

### 16. **Partner Webhooks**
- **File**: `backend/db/migrations/2025-01-20-add-partner-webhooks.sql`
- **Purpose**: Adds webhook support for partner integrations

### 17. **Payments Table**
- **File**: `backend/db/migrations/2025-01-20-add-payments-table.sql`
- **Purpose**: Creates payments tracking table

### 18. **GST Number**
- **File**: `backend/db/migrations/2025-11-28-add-gst-number.sql`
- **Purpose**: Adds GST number field to partners

### 19. **Dietary & Cost Info**
- **File**: `backend/db/migrations/2025-11-29-add-dietary-and-cost.sql`
- **Purpose**: Adds dietary preferences and cost info

### 20. **Partner Dining Metadata**
- **File**: `backend/db/migrations/2025-11-29-partner-dining-metadata.sql`
- **Purpose**: Adds dining-specific metadata to partners

### 21. **Cuisine to Partners**
- **File**: `backend/db/migrations/add_cuisine_to_partners.sql`
- **Purpose**: Adds cuisine information to partners

---

## 📁 **DATA STRUCTURE ENHANCEMENTS**

### 22. **Event Categories**
- **File**: `backend/db/event_categories.sql`
- **Purpose**: Creates event categories

### 23. **Event V2 Taxonomy**
- **File**: `backend/db/event_v2_taxonomy.sql`
- **Purpose**: Updates event taxonomy system

### 24. **Food Menu Categories**
- **File**: `backend/db/food_menu_categories.sql`
- **Purpose**: Creates food menu category structure

### 25. **Deal Slots**
- **File**: `backend/db/deal_slots.sql`
- **Purpose**: Creates deal time slots system

### 26. **Featured Moderation**
- **File**: `backend/db/add_featured_moderation.sql`
- **Purpose**: Adds featured/moderation flags

### 27. **Trending Consolidation**
- **File**: `backend/db/migrations/2025-01-18-consolidate-trending.sql`
- **Purpose**: Consolidates trending feature

---

## 🔄 **OPTIONAL FIXES (Run if Needed)**

### 28. **Multi-Tier Schema Fix**
- **File**: `backend/db/fix_multi_tier_schema.sql`
- **Purpose**: Fixes multi-tier partner schema issues

### 29. **Multi-Tier Partners**
- **File**: `backend/db/multi_tier_partners.sql`
- **Purpose**: Adds multi-tier partner support

### 30. **OTP Registration Tracking**
- **File**: `backend/db/add_otp_registration_tracking.sql`
- **Purpose**: Tracks OTP registration attempts

### 31. **Retrospective Signup Bonus**
- **File**: `backend/db/20251108_retrospective_signup_bonus.sql`
- **Purpose**: Adds retrospective signup bonus logic

### 32. **Update Tiers**
- **File**: `backend/db/20251108_update_tiers.sql`
- **Purpose**: Updates tier calculations

---

## 🚀 **RECOMMENDED DEPLOYMENT ORDER**

Execute files in this **exact order**:

```bash
# 1. Core Schema (MUST BE FIRST)
psql -U postgres -d elizian -f db/elizian_schema.sql

# 2. Role System
psql -U postgres -d elizian -f db/add_role_id_column.sql

# 3. Bank Offers & Reservations (CRITICAL)
psql -U postgres -d elizian -f db/20250107_bank_offers_reservations.sql

# 4. Loyalty Tier System
psql -U postgres -d elizian -f db/20250107_loyalty_tiers_system.sql

# 5. Tier Compatibility (CRITICAL)
psql -U postgres -d elizian -f db/20250108_tier_system_compatibility.sql

# 6. Voucher Fixes
psql -U postgres -d elizian -f db/20250106_voucher_fixes.sql

# 7. Restaurant Availability (CRITICAL)
psql -U postgres -d elizian -f db/migrations/2025-01-21-create-restaurant-availability.sql

# 8. Fix All Bookings Columns (CRITICAL)
psql -U postgres -d elizian -f db/migrations/2025-01-21-fix-all-bookings-columns.sql

# 9. Fix Booking Type Constraint (CRITICAL)
psql -U postgres -d elizian -f db/migrations/2025-01-21-fix-booking-type-constraint-final.sql

# 10. Fix Loyalty Points FK (CRITICAL)
psql -U postgres -d elizian -f db/migrations/2025-01-21-fix-loyalty-points-fk-deferrable.sql

# 11-32. Feature Enhancements (can run in parallel or any order)
psql -U postgres -d elizian -f db/20251108_ezt_token_updates.sql
psql -U postgres -d elizian -f db/20251108_offer_discount_updates.sql
psql -U postgres -d elizian -f db/20241118_add_offer_status.sql
psql -U postgres -d elizian -f db/20251205_admin_console_fix.sql
psql -U postgres -d elizian -f db/migrations/2025-01-20-add-partner-email-verification.sql
psql -U postgres -d elizian -f db/migrations/2025-01-20-add-partner-webhooks.sql
psql -U postgres -d elizian -f db/migrations/2025-01-20-add-payments-table.sql
psql -U postgres -d elizian -f db/migrations/2025-11-28-add-gst-number.sql
psql -U postgres -d elizian -f db/migrations/2025-11-29-add-dietary-and-cost.sql
psql -U postgres -d elizian -f db/migrations/2025-11-29-partner-dining-metadata.sql
psql -U postgres -d elizian -f db/migrations/add_cuisine_to_partners.sql
psql -U postgres -d elizian -f db/event_categories.sql
psql -U postgres -d elizian -f db/event_v2_taxonomy.sql
psql -U postgres -d elizian -f db/food_menu_categories.sql
psql -U postgres -d elizian -f db/deal_slots.sql
psql -U postgres -d elizian -f db/add_featured_moderation.sql
psql -U postgres -d elizian -f db/migrations/2025-01-18-consolidate-trending.sql
```

---

## 📦 **QUICK DEPLOYMENT PACKAGE**

### Minimum Required Files (Production Blockers Only)

Create a folder `production-db/` with these files:

1. `elizian_schema.sql` - Core schema
2. `add_role_id_column.sql` - Role system
3. `20250107_bank_offers_reservations.sql` - Reservations
4. `20250107_loyalty_tiers_system.sql` - Tier system
5. `20250108_tier_system_compatibility.sql` - Tier compatibility
6. `20250106_voucher_fixes.sql` - Voucher fixes
7. `migrations/2025-01-21-create-restaurant-availability.sql` - Restaurant availability
8. `migrations/2025-01-21-fix-all-bookings-columns.sql` - Bookings columns
9. `migrations/2025-01-21-fix-booking-type-constraint-final.sql` - Booking constraint
10. `migrations/2025-01-21-fix-loyalty-points-fk-deferrable.sql` - FK fix

### Full Production Package (All Features)

Include all 32 files listed above.

---

## ✅ **POST-DEPLOYMENT VERIFICATION**

After running migrations, verify:

```sql
-- Check critical tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('bookings', 'restaurant_availability', 'loyalty_tiers', 'users');

-- Check booking_type constraint
SELECT pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conname = 'bookings_booking_type_check';

-- Check FK constraint is DEFERRABLE
SELECT condeferrable, condeferred 
FROM pg_constraint 
WHERE conname = 'loyalty_points_booking_id_fkey';

-- Check tier columns exist
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'users' 
AND column_name IN ('annual_spend_current', 'current_tier_id');
```

---

## ⚠️ **IMPORTANT NOTES**

1. **Backup First**: Always backup production database before running migrations
2. **Test First**: Run migrations on staging/test database first
3. **Order Matters**: Critical files must run in the specified order
4. **Idempotent**: Most migrations use `IF NOT EXISTS` but verify before running
5. **Transaction Safety**: Each file should be run in its own transaction

---

## 📧 **Questions?**

Contact the database administrator or refer to migration comments in each SQL file.

