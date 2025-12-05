# Production Database Files Checklist

## 📦 Files to Send to Your Team

Use this checklist to ensure all required database files are included.

---

## ✅ **CRITICAL FILES (10 files)**

Must be included for production to work:

- [ ] `db/elizian_schema.sql` - Core database schema
- [ ] `db/add_role_id_column.sql` - Role system
- [ ] `db/20250107_bank_offers_reservations.sql` - Restaurant bookings
- [ ] `db/20250107_loyalty_tiers_system.sql` - Loyalty tiers
- [ ] `db/20250108_tier_system_compatibility.sql` - Tier compatibility
- [ ] `db/20250106_voucher_fixes.sql` - Voucher system
- [ ] `db/migrations/2025-01-21-create-restaurant-availability.sql` - Restaurant availability
- [ ] `db/migrations/2025-01-21-fix-all-bookings-columns.sql` - Bookings columns
- [ ] `db/migrations/2025-01-21-fix-booking-type-constraint-final.sql` - Booking constraint
- [ ] `db/migrations/2025-01-21-fix-loyalty-points-fk-deferrable.sql` - FK constraint fix

---

## ✅ **FEATURE FILES (22 files)**

Include for full feature set:

### Core Features
- [ ] `db/20251108_ezt_token_updates.sql`
- [ ] `db/20251108_offer_discount_updates.sql`
- [ ] `db/20241118_add_offer_status.sql`
- [ ] `db/20251205_admin_console_fix.sql`

### Partner Features
- [ ] `db/migrations/2025-01-20-add-partner-email-verification.sql`
- [ ] `db/migrations/2025-01-20-add-partner-webhooks.sql`
- [ ] `db/migrations/2025-01-20-add-payments-table.sql`
- [ ] `db/migrations/2025-11-28-add-gst-number.sql`
- [ ] `db/migrations/2025-11-29-add-dietary-and-cost.sql`
- [ ] `db/migrations/2025-11-29-partner-dining-metadata.sql`
- [ ] `db/migrations/add_cuisine_to_partners.sql`

### Data Structures
- [ ] `db/event_categories.sql`
- [ ] `db/event_v2_taxonomy.sql`
- [ ] `db/food_menu_categories.sql`
- [ ] `db/deal_slots.sql`
- [ ] `db/add_featured_moderation.sql`
- [ ] `db/migrations/2025-01-18-consolidate-trending.sql`

### Optional Fixes
- [ ] `db/fix_multi_tier_schema.sql`
- [ ] `db/multi_tier_partners.sql`
- [ ] `db/add_otp_registration_tracking.sql`
- [ ] `db/20251108_retrospective_signup_bonus.sql`
- [ ] `db/20251108_update_tiers.sql`

---

## 📄 **DOCUMENTATION FILES**

Include these guides:

- [ ] `backend/PRODUCTION_DB_DEPLOYMENT.md` - Full deployment guide
- [ ] `backend/db/PRODUCTION_MIGRATION_SCRIPT.sh` - Automated script
- [ ] `backend/PRODUCTION_FILES_CHECKLIST.md` - This file

---

## 🚀 **QUICK PACKAGE OPTIONS**

### Option 1: Minimum Package (10 files)
Only critical files needed to fix production blockers.

**Files:**
- All files in "CRITICAL FILES" section above

### Option 2: Full Package (32 files)
All features and fixes.

**Files:**
- All files in "CRITICAL FILES" section
- All files in "FEATURE FILES" section

---

## 📋 **DEPLOYMENT INSTRUCTIONS**

### For Your Team:

1. **Create database:**
   ```bash
   psql -U postgres -c "CREATE DATABASE elizian;"
   ```

2. **Run automated script:**
   ```bash
   cd backend/db
   chmod +x PRODUCTION_MIGRATION_SCRIPT.sh
   ./PRODUCTION_MIGRATION_SCRIPT.sh
   ```

   OR

3. **Run manually (in order):**
   ```bash
   # Follow the order in PRODUCTION_DB_DEPLOYMENT.md
   psql -U postgres -d elizian -f db/elizian_schema.sql
   psql -U postgres -d elizian -f db/add_role_id_column.sql
   # ... (continue with all files)
   ```

---

## ✅ **VERIFICATION**

After deployment, run:

```sql
-- Check critical tables
SELECT COUNT(*) FROM information_schema.tables 
WHERE table_schema = 'public' AND table_name IN (
  'bookings', 
  'restaurant_availability', 
  'loyalty_tiers', 
  'users',
  'partners'
);

-- Should return: 5
```

---

## 📧 **SUPPORT**

If your team encounters issues:
1. Check `PRODUCTION_DB_DEPLOYMENT.md` for detailed instructions
2. Verify all files were run in the correct order
3. Check PostgreSQL logs for errors

