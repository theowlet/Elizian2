# Code & DB Schema Sync Report

**Date:** 2026-03-01  
**Status:** Mostly in sync, minor migration gaps

---

## Summary

| Area | Status | Notes |
|------|--------|-------|
| bookings table | ✅ In sync | All columns used by bookingRepository exist |
| deal_slots | ✅ In sync | Schema matches slotCapacityService |
| booking_waitlist | ✅ In sync | Waitlist migration applied; trigger exists |
| notifications | ✅ In sync | `booking_confirmation` and `campaign` allowed; used by waitlist |
| slot capacity / date handling | ✅ In sync | Asia/Kolkata used consistently |
| Migrations | ⚠️ 9 skipped | See details below |

---

## Code ↔ Schema Alignment

### ✅ Bookings

| Column | Expected by | Migration | Status |
|--------|-------------|-----------|--------|
| deal_id, slot_id | bookingRepository | deal_slots.sql | ✅ |
| voucher_code, voucher_state | bookingRepository | voucher-redemption, enterprise-voucher | ✅ |
| expires_at | bookingRepository | 2025-01-23-bookings-expires-at | ✅ |
| is_priority_override | bookingRepository | 2026-02-enterprise-booking-engine | ✅ |
| co_pay_percentage_at_booking | bookingRepository | 2026-02-bookings-co-pay-at-booking | ✅ |
| reward_multiplier | bookingRepository | 2026-02-booking-reward-multiplier | ✅ |
| booking_mode | bookingRepository | 2026-02-booking-mode-column | ✅ |
| booked_at_client | bookingRepository | 2026-02-booked-at-client | ✅ |

### ✅ deal_slots

- `(deal_id, date, time_slot, capacity, booked)` — matches slotCapacityService
- Date format: `YYYY-MM-DD` in IST (Asia/Kolkata) — consistent with `toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })` in slotCapacityService and waitlistService

### ✅ booking_waitlist

- Status values: `waiting`, `notified`, `confirmed`, `expired`, `cancelled` — matches waitlistService
- `booking_time` column: TIME type — compatible with `HH:MM` strings from API

### ✅ Notifications

- `notification_type` used for waitlist promotion: `booking_confirmation` — allowed in constraint
- `campaign` type — allowed by 2026-02-notifications-campaign-type.sql

---

## Migration Run Results (74 files)

```
Done: 65 applied, 9 skipped
```

### Skipped Migrations (with reasons)

| Migration | Reason |
|-----------|--------|
| 2025-01-18-consolidate-trending | Column `is_promoted` does not exist (depends on prior schema) |
| 2025-01-22-voucher-redemption-system | Constraint would exclude `campaign`; existing rows have `campaign` |
| 2026-02-consolidate-co-pay-percentage | Column `discount_percentage` does not exist |
| 2026-02-go-live-hardening | Syntax error (nested `$$` in DO block) |
| 2026-02-operating-hours-waitlist | Trigger already exists (already applied) |
| migrations/2025-01-21-field-consistency-fixes | Column `offer_id` does not exist (bookings uses `deal_id`) |
| migrations/2025-11-24-add-account-deletion-tables | Constraint already exists |
| migrations/2025-11-24-comprehensive-feature-tables | Syntax error |
| migrations/2025-11-24-comprehensive-features-alt | Column `referral_code` does not exist |

---

## Recommendations

### 1. Fix 2026-02-go-live-hardening.sql
The migration uses nested `$$` delimiters. Use different delimiters for the inner function:

```sql
-- Instead of:
CREATE OR REPLACE FUNCTION verify_token_ledger_integrity(...) AS $$
BEGIN ... END;
$$ LANGUAGE plpgsql;

-- Use:
CREATE OR REPLACE FUNCTION verify_token_ledger_integrity(...) AS $func$
BEGIN ... END;
$func$ LANGUAGE plpgsql;
```

### 2. Voucher-redemption-system skip
The skip is expected because `2026-02-notifications-campaign-type` already ran and added `campaign`. The current constraint includes all needed types. No action required unless you want to align the migration file for future fresh installs.

### 3. Consolidate migration folders
Migrations live in both `backend/db/migrations/` and `backend/migrations/`. `run-migrations.js` runs both. Consider moving all migrations into `backend/db/migrations/` for consistency.

### 4. Run migrations
For new environments or after schema changes:

```bash
cd backend
node run-bookings-migrations.js   # Bookings-specific
node scripts/run-migrations.js     # All migrations
```

---

## Git Status

- `backend/elizian_full_dump.dump` is untracked (consider adding to `.gitignore` if it’s a local dump)
- Other modified files are tracked; commit when ready

---

## Verification Commands

```bash
# Run all migrations
cd backend && node scripts/run-migrations.js

# Run bookings migrations only
cd backend && node run-bookings-migrations.js

# Check notification types in DB
SELECT DISTINCT notification_type FROM notifications;
```
