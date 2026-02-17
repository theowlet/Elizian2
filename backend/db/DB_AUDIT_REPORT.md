# Database Audit Report — Missing Tables, Columns & Migrations

**Generated:** 2026-02-17  
**Scope:** Full codebase review of DB expectations vs existing migrations

---

## 1. Tables Used by Code but Missing Migration

| Table | Used By | Migration | Status |
|-------|---------|-----------|--------|
| **nfc_pucks** | nfcController (list, register, update, delete pucks) | **NONE** | ❌ No migration found |
| **nfc_tap_events** | nfcController (tap logging), partnerController (getCheckInsToday) | **NONE** | ❌ No migration found |

**Impact:** NFC pucks and tap events will fail with "relation does not exist". partnerController.getCheckInsToday catches 42P01 and returns `{ count: 0 }` instead of 500.

---

## 2. Tables with Migrations (Run Order Matters)

| Table | Migration(s) | Run Script |
|-------|--------------|------------|
| **bookings** | 2025-01-21-fix-all-bookings-columns, 2025-01-22-voucher-redemption-system, 2025-01-22-enterprise-voucher-system, 2025-01-23-bookings-expires-at, 20251108_ezt_token_updates, deal_slots, 2026-02-enterprise-booking-engine | `run-bookings-migrations.js` |
| **redemption_audit** | 2025-01-22-voucher-redemption-system, 2025-01-22-enterprise-voucher-system, 2026-02-redemption-overhaul | voucher + redemption scripts |
| **visit_sessions** | 2026-02-redemption-overhaul | Not in run-bookings-migrations |
| **campaigns** | 2026-02-campaign-architecture, 2026-02-enterprise-campaign-engine | `run-campaign-migrations.js` |
| **campaign_targets** | 2026-02-enterprise-campaign-engine | run-campaign-migrations |
| **campaign_rules** | 2026-02-enterprise-campaign-engine | run-campaign-migrations |
| **campaign_attribution** | 2026-02-enterprise-campaign-engine | run-campaign-migrations |
| **campaign_experiences** / **campaign_experience_mapping** | 2026-02-enterprise-campaign-engine | run-campaign-migrations |
| **notifications** | migrations/2025-11-24-comprehensive-feature-tables.sql | run-migrations (migrations/) |
| **audit_log** | db/add_featured_moderation.sql | Not in run-migrations |
| **events** | models/eznet.sql, seed_data.js | Manual |
| **experience_metadata** | 2026-02-experience-metadata | run-migrations |
| **venue_time_slots** | 2026-02-enterprise-booking-engine | run-bookings-migrations |
| **booking_waitlist** | 2026-02-operating-hours-waitlist | run-migrations |
| **loyalty_tiers** / **user_tier_history** | 20250108_tier_system_compatibility | db/ (not in run-migrations) |
| **transactions** | elizian_schema | Base schema |
| **token_ledger** | elizian_schema + 20251108_ezt_token_updates | run-bookings-migrations |
| **system_settings** | missing_tables.sql (db.js) | Auto-init |

---

## 3. Columns Code Expects (Optional / Conditional)

| Table | Column | Migration | Code Handling |
|-------|--------|-----------|---------------|
| **users** | last_login | elizian_schema | authService, adminRepository — conditional SELECT |
| **users** | ez_club_member, ez_club_network_check_ins, ez_club_qualified_at | 2026-02-ez-club | nfcController, authService |
| **users** | signup_bonus_credited | 20251108_retrospective_signup_bonus | authService |
| **partners** | partner_tier | 2026-02-partner-subscription-tier | adminRepository — conditional |
| **partners** | status | db.js patchPartnersTable, add_featured_moderation | offerRepository, adminRepository |
| **partners** | rating, cuisine_types, avg_cost_for_two, approved_for_featured | Various | offerRepository — conditional |
| **partners** | place_id, geo_verified, formatted_address | 2026-02-partners-geo-place-id-verified | — |
| **partners** | accepting_bookings | 2026-02-operating-hours-waitlist | — |
| **partner_offers** | status | 20241118_add_offer_status | offerRepository — conditional |
| **partner_offers** | perk_type, perk_description | 2026-02-stabilization-indexes, 2026-02-gap-analysis-features | offerRepository — conditional |
| **partner_offers** | co_pay_percentage | 2026-02-offer-co-pay-percentage | offerRepository — conditional |
| **partner_offers** | savings, ezt_equivalent, featured_request_pending, forced_by_admin | 20251108_offer_discount_updates | offerRepository — conditional |
| **partner_offers** | min_tier_name | 2026-02-partner-offers-min-tier | offerRepository, tierGate |
| **partner_offers** | trending_approval_reason | 2026-02-trending-tier-flow | adminRepository — conditional |
| **bookings** | checked_in_at, check_in_lat, check_in_lng, check_in_distance | 2026-02-redemption-overhaul | nfcController, enhancedRedemptionService |
| **redemption_audit** | visit_session_id, offer_discount_percentage, discount_amount, ezt_tokens_required, customer_confirmation_status, etc. | 2026-02-redemption-overhaul | enhancedRedemptionService |

---

## 4. Migrations Not Picked Up by run-migrations.js

`scripts/run-migrations.js` only runs from:
- `backend/db/migrations/`
- `backend/migrations/`

**Files in `backend/db/` (root) are NOT run:**
- db/20251108_ezt_token_updates.sql
- db/20251108_offer_discount_updates.sql
- db/20251108_retrospective_signup_bonus.sql
- db/20251108_update_tiers.sql
- db/20250106_voucher_fixes.sql
- db/20250107_loyalty_tiers_system.sql
- db/20250107_bank_offers_reservations.sql
- db/20250108_tier_system_compatibility.sql
- db/20241118_add_offer_status.sql
- db/add_otp_registration_tracking.sql
- db/add_role_id_column.sql
- db/add_featured_moderation.sql
- db/20251205_admin_console_fix.sql
- db/deal_slots.sql
- db/food_menu_categories.sql
- db/event_categories.sql
- db/multi_tier_partners.sql
- db/bank_offers_schema.sql
- etc.

**Recommendation:** Either move critical migrations to `db/migrations/` or extend run-migrations to include `db/` with explicit ordering.

---

## 5. bookingRepository Migration Hint (Outdated)

Current hint in `bookingRepository.js`:
```
Run migrations: db/migrations/2025-01-21-fix-all-bookings-columns.sql, 
db/migrations/2025-01-22-voucher-redemption-system.sql, 
db/migrations/20251108_ezt_token_updates.sql, db/deal_slots.sql
```

**Missing from hint:** 2025-01-22-enterprise-voucher-system, 2025-01-23-bookings-expires-at, 2026-02-enterprise-booking-engine

**Recommendation:** Update hint to: "Run: node run-bookings-migrations.js"

---

## 6. Critical Gaps — Action Required

### 6.1 Create nfc_pucks and nfc_tap_events migration

**No migration exists.** Add `db/migrations/2026-02-nfc-pucks-and-tap-events.sql`:

```sql
-- nfc_pucks: partner-registered NFC pucks
CREATE TABLE IF NOT EXISTS nfc_pucks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  puck_code VARCHAR(20) NOT NULL UNIQUE,
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  label VARCHAR(255),
  location_hint TEXT,
  is_active BOOLEAN DEFAULT true,
  tap_count INT DEFAULT 0,
  last_tapped_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_nfc_pucks_partner ON nfc_pucks(partner_id);
CREATE INDEX IF NOT EXISTS idx_nfc_pucks_code ON nfc_pucks(puck_code);

-- nfc_tap_events: consumer tap log
CREATE TABLE IF NOT EXISTS nfc_tap_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  puck_id UUID NOT NULL REFERENCES nfc_pucks(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  tap_type VARCHAR(20) DEFAULT 'checkin',
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_nfc_tap_events_puck ON nfc_tap_events(puck_id);
CREATE INDEX IF NOT EXISTS idx_nfc_tap_events_partner ON nfc_tap_events(partner_id);
CREATE INDEX IF NOT EXISTS idx_nfc_tap_events_user ON nfc_tap_events(user_id);
CREATE INDEX IF NOT EXISTS idx_nfc_tap_events_created ON nfc_tap_events(created_at DESC);
```

### 6.2 Run order for full setup

1. Base: elizian_schema.sql + missing_tables.sql (via db.js)
2. Bookings: `node run-bookings-migrations.js`
3. Campaigns: `node run-campaign-migrations.js`
4. All migrations: `node scripts/run-migrations.js` (db/migrations + migrations)
5. NFC (after creating migration): include in run-migrations or run manually
6. Redemption overhaul: 2026-02-redemption-overhaul (visit_sessions, redemption_audit columns, bookings checked_in_*)
7. Notifications: migrations/2025-11-24-comprehensive-feature-tables.sql
8. Partner tier: `node run-partner-tier-migration.js`

---

## 7. Summary

| Category | Count |
|----------|-------|
| Tables with **no migration** | 2 (nfc_pucks, nfc_tap_events) |
| Migrations in db/ not run by run-migrations | ~15+ |
| Optional columns (code has fallbacks) | 20+ |
| bookingRepository hint | Outdated (missing 3 migrations) |

**Immediate fix:** Create `2026-02-nfc-pucks-and-tap-events.sql` and run it (or add to run-migrations). Update bookingRepository hint to reference `run-bookings-migrations.js`.
