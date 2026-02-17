# Database Schema Gap Analysis

This document lists **missing or inconsistent database objects** (tables, columns, migrations) when comparing **application code expectations** vs **existing SQL files** in `backend/db/`, `backend/migrations/`, and runtime init in `backend/src/config/db.js`.

---

## 1. Tables that code expects but may not exist

| Table | Created in | Used by | Risk if missing |
|-------|------------|---------|------------------|
| **notifications** | `backend/migrations/2025-11-24-comprehensive-feature-tables.sql` | notificationService, campaign notifications | In-app notifications and campaign pushes fail. Migration lives in `backend/migrations/`, not `backend/db/migrations/` — may not be run by your normal migration path. |
| **events** | `backend/models/eznet.sql` (and seed_data.js) | bookings FK, eventCleanupJob, eventRepository | Bookings that reference events fail; event listing/booking broken. `missing_tables.sql` references `events(id)` — if events table is never created, missing_tables can fail. |
| **audit_log** | `backend/db/add_featured_moderation.sql` | adminRepository, accountDeletionService, src/utils/audit.js | Admin activity log and account deletion audit fail. |
| **experience_metadata** | `backend/db/migrations/2026-02-experience-metadata.sql` | offerRepository (dynamic filters), dynamicFilterBuilder | Optional; code falls back if missing. |
| **visit_sessions** | `backend/db/migrations/2026-02-redemption-overhaul.sql` | partnerController, redemption flow | Check-in/redemption flow may fail. |
| **nfc_tap_events** | Not found in repo | partnerController (dashboard stats) | Query fails if table missing. |
| **campaigns** + **campaign_targets** + **campaign_rules** + **campaign_experience_mapping** + **campaign_audit_log** | `backend/db/migrations/2026-02-campaign-architecture.sql` + enterprise-campaign-engine | adminCampaignRepository, triggerProcessor, actionExecutor | Campaign manager and campaign notifications fail. |
| **loyalty_tiers** | `backend/db/20250108_tier_system_compatibility.sql` | tierRepository, adminService, tokenService | Tier names (Ather, Nova, etc.) and tier-based logic fail; code also uses `tiers` (elizian_schema) in some paths. |
| **user_tier_history** | `backend/db/20250108_tier_system_compatibility.sql` | tierRepository, adminService | Tier history and reporting fail. |
| **transactions** | elizian_schema | adminService (redemption flow), enhancedRedemptionService | Redemption and token ledger fail. |
| **token_ledger** | elizian_schema (+ 20251108 adds booking_id, etc.) | adminService, tokenService | Token balance and ledger fail. |
| **redemption_audit** | `backend/db/migrations/2025-01-22-voucher-redemption-system.sql` | enhancedRedemptionService, adminRepository | Redemption tracking and admin redemption views fail. |
| **system_settings** | missing_tables.sql (and comprehensive-feature-tables) | adminRepository, systemSettingsService | Admin settings and dashboard counts may fail. |

---

## 2. Columns that code expects but may be missing (minimal / local DB)

These are **handled in code** with `information_schema` checks or fallbacks so the app runs without the column; run migrations to enable full features.

| Table | Column | Migration / source | Code handling |
|-------|--------|--------------------|----------------|
| **users** | last_login | elizian_schema | authService.getUserProfile, adminRepository.listAdminUsers — conditional SELECT. |
| **partners** | partner_tier | 2026-02-partner-subscription-tier.sql | adminRepository — conditional SELECT and update. |
| **partners** | status | add_featured_moderation / 20251205 / db.js patchPartnersTable | Used in listAdminPartners; fallback to is_active. |
| **partners** | rating, cuisine_types, avg_cost_for_two, approved_for_featured | elizian_schema (rating); add_cuisine; 2025-11-29-add-dietary-and-cost; add_featured_moderation | offerRepository.listPublicOffers — conditional SELECT. |
| **partner_offers** | status | 20241118_add_offer_status / 20251205 | offerRepository — conditional SELECT and INSERT/UPDATE; fallback to is_active. |
| **partner_offers** | perk_type, perk_description | 2026-02-stabilization-indexes / gap-analysis | offerRepository — conditional SELECT, INSERT, UPDATE. |
| **partner_offers** | co_pay_percentage | 2026-02-offer-co-pay-percentage.sql | offerRepository — conditional INSERT, UPDATE. |
| **partner_offers** | savings, ezt_equivalent, featured_request_pending, forced_by_admin | 20251108_offer_discount_updates, add_featured_moderation | offerRepository — conditional INSERT, UPDATE. |
| **partner_offers** | min_tier_name | 2026-02-partner-offers-min-tier.sql | offerRepository maps row.min_tier_name ?? null. |

---

## 3. Schema drift / missing migrations (code expects, no migration found)

| Issue | Detail | Recommendation |
|-------|--------|----------------|
| **otp_sessions** | Code uses columns: `verified`, `attempts`, `user_id`. elizian_schema has: `is_verified`, `attempt_count`, and no `user_id`. `add_otp_registration_tracking.sql` creates an index on `verified` — so something must add/rename these. | Add a migration: add `verified` (or rename is_verified → verified), `attempts` (or rename attempt_count → attempts), and `user_id UUID REFERENCES users(id)`. Or make authService use is_verified and attempt_count and add user_id. |
| **archives** | missing_tables creates: event_id, offer_id, archived_by, archived_on, reason, can_reactivate, reactivated_at, created_at. adminRepository inserts: entity_type, entity_id, original_data, archived_at. eventCleanupJob uses: offer_id, event_id, archived_on. | Either add columns entity_type, entity_id, original_data, archived_at to archives (and keep archived_on for compatibility), or add a migration that aligns admin archive flow with the same column set. |
| **bookings.deal_id** | Code uses deal_id everywhere. missing_tables creates only offer_id. deal_slots.sql and 2025-01-21-fix-all-bookings-columns add deal_id. | Run deal_slots.sql or 2025-01-21-fix-all-bookings-columns.sql so bookings has deal_id (and partner_id, booking_reference, etc.). |
| **bookings** | Code expects: voucher_state, voucher_code, qr_code_url, partner_id, booking_reference, fiat_amount, total_price, user_tier_at_booking, slot_id, etc. | Run 2025-01-22-voucher-redemption-system, 2025-01-22-enterprise-voucher-system, 2025-01-21-fix-all-bookings-columns, 20251108_ezt_token_updates, 2026-02-operating-hours-waitlist, 2026-02-redemption-overhaul as needed. |
| **token_ledger** | Code uses booking_id, ledger_type. 20251108_offer_discount_updates adds booking_id, change_type, source. | Ensure 20251108 and any voucher/redemption migrations are run. |
| **audit_log** | 20251205_admin_console_fix adds actor_name, entity_name, description to audit_log. src/utils/audit.js also ensures these columns. | Run add_featured_moderation.sql then 20251205_admin_console_fix.sql so audit_log exists and has these columns. |

---

## 4. Tables created only at runtime (db.js)

These are created by `initializeAllTables()` in `backend/src/config/db.js` (not by a standalone migration file):

- partner_offers (if missing)
- menu_items
- accounts
- orders

`missing_tables.sql` is also run from db.js and creates: roles, bookings, vouchers, loyalty_points, archives, system_settings, and adds role_id to users.

So a **minimal local DB** that only runs elizian_schema + db.js init will have: users, partners, partner_offers, roles, bookings, vouchers, loyalty_points, archives, system_settings, menu_items, accounts, orders, plus elizian_schema tables. It will **not** have: events, notifications, audit_log, redemption_audit, visit_sessions, campaigns, loyalty_tiers, user_tier_history, experience_metadata, nfc_tap_events, etc., unless you run the corresponding migrations.

---

## 5. Recommended migration order (for a fresh or minimal DB)

1. **Base**: elizian_schema.sql (or your chosen base).
2. **Core app**: missing_tables.sql (run via db.js or manually).
3. **Auth/RBAC**: add_role_id_column, 20251205_admin_console_fix (partners/offers status, audit_log).
4. **Featured/audit**: add_featured_moderation.sql (audit_log, partner/offer flags).
5. **OTP**: Resolve otp_sessions column names (verified/attempts/user_id) — add migration if needed.
6. **Bookings**: 2025-01-21-fix-all-bookings-columns.sql, deal_slots.sql, 2025-01-22-voucher-redemption-system, 2025-01-22-enterprise-voucher-system, 20251108_ezt_token_updates.
7. **Redemption**: 2026-02-redemption-overhaul (visit_sessions, redemption_audit columns).
8. **Notifications**: backend/migrations/2025-11-24-comprehensive-feature-tables.sql (creates notifications), then db/migrations/2026-02-notifications-campaign-type.sql.
9. **Events**: backend/models/eznet.sql (events, venues) if you use events.
10. **Tiers**: 20250108_tier_system_compatibility.sql (loyalty_tiers, user_tier_history, users.current_tier_name).
11. **Partners/offers**: add_cuisine_to_partners, 2025-11-29-add-dietary-and-cost, 2026-02-partner-subscription-tier, 2026-02-partner-offers-min-tier, 2026-02-stabilization-indexes (perk_type, perk_description), 20241118_add_offer_status.
12. **Campaigns**: 2026-02-campaign-architecture, 2026-02-enterprise-campaign-engine.
13. **Operating hours / waitlist**: 2026-02-operating-hours-waitlist, 2026-02-partner-hours-breaks-column.
14. **Archives**: Add entity_type, entity_id, original_data, archived_at to archives if you use admin archive flow (or align code with existing columns).

---

## 6. Summary: “What is missing” for a typical local run

- **Notifications table** — create via backend/migrations/2025-11-24-comprehensive-feature-tables.sql.
- **events table** — create via backend/models/eznet.sql (or seed) if you use events.
- **audit_log table** — create via backend/db/add_featured_moderation.sql.
- **otp_sessions columns** — align schema with code: verified (or is_verified), attempts (or attempt_count), user_id.
- **archives columns** — add entity_type, entity_id, original_data, archived_at for admin archive, or reuse archived_on/offer_id/event_id.
- **bookings columns** — deal_id, partner_id, voucher_state, booking_reference, fiat_amount, etc. via the migrations in §5.
- **Campaign / redemption / tier / partner-offer migrations** — run the 2026-02-* and 2025-* migrations in order so all code paths have the tables and columns they expect.

After running the missing migrations (and fixing otp_sessions/archives drift), the “column does not exist” and “relation does not exist” errors on a minimal or local DB should be resolved.

---

## 7. Code resilience added (debug missing fields)

The following **code changes** make the app tolerate missing tables/columns and give clear errors or fallbacks:

| Area | Change |
|------|--------|
| **offerRepository** | createOffer and updateOffer only include optional columns (status, perk_type, perk_description, co_pay_percentage, savings, ezt_equivalent, featured_request_pending, forced_by_admin) when they exist. listPublicOffers and getPublicOffersByIds omit optional partner_offers columns from SELECT when missing. |
| **bookingRepository** | createBooking wrapped in try/catch; on "column does not exist" (42703) throws a clear error with migration hint (2025-01-21-fix-all-bookings-columns, 2025-01-22-voucher-redemption-system, 20251108_ezt_token_updates, deal_slots). |
| **partnerController.getCheckInsToday** | If nfc_tap_events or visit_sessions table is missing (42P01), returns `{ count: 0 }` instead of 500. |
| **notificationService** | create/createBulk: on "relation notifications does not exist" (42P01), throw AppError with message to run 2025-11-24-comprehensive-feature-tables.sql. getUserNotifications: on missing table, return `{ notifications: [], unreadCount: 0, total: 0 }` instead of 500. |
| **authService.getUserProfile** | Conditional SELECT for users.last_login. |
| **adminRepository** | Conditional SELECT and update for partners.partner_tier; conditional SELECT for users.last_login in listAdminUsers. |

To fully fix "missing field" errors: run the migrations in §5 and, where needed, add the otp_sessions/archives columns described in §3.
