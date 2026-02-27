# Elizian — Safe Global Timezone Refactor

**Status:** Audit complete. Migrations and utilities generated (NOT executed).  
**Date:** 2026-02-27  
**Scope:** Backend only. No frontend changes.

---

## PHASE 1 — AUDIT REPORT

### 1.1 Current State Summary

| Aspect | Finding |
|--------|---------|
| **DB connection timezone** | `SET timezone = 'Asia/Kolkata'` on connect (db.js:41–43) |
| **Stored timestamps** | **Mixed**: Most columns use `TIMESTAMP` (no TZ); some use `TIMESTAMPTZ` |
| **Assumption** | Prompt says "we store timestamps in UTC" — **incorrect**. With IST session, `CURRENT_TIMESTAMP` stores IST. Historic data may be UTC if connection was previously UTC. |
| **Analytics** | `analyticsFilterEngine.js` uses `DEFAULT_TZ = 'UTC'` for date filtering |

### 1.2 Timestamp Columns by Type

#### TIMESTAMP (without time zone) — majority

| Table | Columns |
|-------|---------|
| **users** | created_at, updated_at, last_login, phone_verified_at, email_verified_at, last_password_change, account_locked_until |
| **partners** | created_at, updated_at, promoted_at, email_verified_at |
| **partner_offers** | start_date, end_date, created_at, updated_at |
| **bookings** | created_at, expires_at (booking_date=DATE, booking_time=TIME) |
| **menu_items** | event_date (DATE in repo), event_time (TIME), created_at, updated_at |
| **orders** | created_at, updated_at |
| **redemption_audit** | redeemed_at, settled_at, frozen_at, created_at |
| **voucher_state_transitions** | transitioned_at, created_at |
| **voucher_audit_log** | created_at |
| **venue_time_slots** | slot_datetime, created_at, updated_at |
| **restaurant_availability** | created_at, updated_at |
| **venue_messages** | delivered_at, read_at, deleted_at, created_at |
| **venue_conversations** | user_last_read_at, partner_last_read_at |
| **otp_sessions** | created_at |
| **partner_otps** | used_at, expires_at, created_at |
| **loyalty_tiers, user_tier_history** | created_at, updated_at, changed_at, tier_upgraded_at |
| **bank_offers, bank_offer_rules, reservations** | valid_from, valid_until, confirmed_at, cancelled_at, created_at, updated_at |
| **subscription_passes, user_subscription_passes** | valid_from, valid_until, redeemed_at, created_at |
| **staff_check_ins, partner_staff** | created_at, checked_in_at |
| **nfc_pucks, nfc_tap_events** | last_tapped_at, created_at |
| **reputation_reviews** | (some TIMESTAMPTZ: marked_malicious_at, dispute_requested_at) |
| **blocked_review_users** | blocked_at, created_at (TIMESTAMPTZ) |
| **developer_api_keys** | last_used_at, created_at (TIMESTAMPTZ) |
| **governance_proposals, governance_votes** | voting_ends_at, created_at, updated_at, earned_at (TIMESTAMPTZ) |
| **push_subscriptions, user_unlocked_experiences** | created_at, updated_at, unlocked_at (TIMESTAMPTZ) |
| **campaigns** | start_at, end_at (TIMESTAMPTZ) |
| **redemption_audit** | dispute_window_expires_at (TIMESTAMPTZ) |
| **bookings** | booked_at_client (TIMESTAMPTZ) |

#### TIMESTAMPTZ — newer tables

- platform_earnings_ledger, partner_tiers
- campaigns, campaign_targets, campaign_rules, campaign_audit_log
- developer_api_keys, governance_proposals, governance_votes
- user_venue_membership_cards (earned_at)
- push_subscriptions, user_unlocked_experiences
- reputation_reviews (marked_malicious_at, dispute_requested_at)
- blocked_review_users
- redemption_audit (dispute_window_expires_at)
- bookings (booked_at_client)

### 1.3 Timezone Conversions & Manual Logic

| Location | Logic |
|----------|-------|
| `db.js` | `SET timezone = 'Asia/Kolkata'` — session uses IST |
| `bookingController.js` | `Intl.DateTimeFormat(..., timeZone: "Asia/Kolkata")` for booked_on_ist |
| `partnerController.js` | `(created_at AT TIME ZONE 'UTC')::date` for "today" checks |
| `slotCapacityService.js` | `Date.UTC(y,m,d,h,m)` — builds UTC from date+time |
| `analyticsFilterEngine.js` | `DEFAULT_TZ = 'UTC'`, `timezone` param for display |
| `bookingValidation.js` | `new Date(\`${date}T${time}:00\`)` — local interpretation |
| `lifecycle.js` | `new Date(item.start_time)` — no explicit TZ |
| `offerService.js` | `new Date(start_date)` — no TZ |
| `adminRepository.js` | `getDealScheduleStatus(startUTC, endUTC)` — expects UTC |

### 1.4 APIs Accepting Datetime Input

| API | Fields | Format |
|-----|--------|--------|
| POST /api/v1/bookings | booking_date, booking_time, booked_at_client | YYYY-MM-DD, HH:MM, ISO8601 |
| POST /api/v1/reservations | reservation_data.date, reservation_data.time | YYYY-MM-DD, HH:MM |
| POST /api/v1/waitlist/join | booking_date, booking_time | YYYY-MM-DD, HH:MM |
| Admin analytics | start_date, end_date | ISO date |
| Partner analytics | start_date, end_date, timezone | ISO date, IANA |
| Campaign create/update | start_at, end_at, start_date, end_date | ISO8601 |
| Offer create/update | start_date, end_date | ISO date/datetime |

### 1.5 APIs Returning Datetime Output

| API | Fields | Current format |
|-----|--------|----------------|
| GET /api/v1/bookings/:id | created_at, booking_date, booking_time, expires_at, booked_on_ist | ISO string, formatted IST |
| GET /api/v1/bookings | created_at, booking_date, booking_time | Raw from DB |
| GET /api/v1/offers | start_date, end_date | Raw from DB |
| Admin/Partner dashboards | created_at, redeemed_at, etc. | Raw from DB |
| Analytics | date ranges | ISO |

### 1.6 Confirmation

- **All timestamps in UTC at rest?** **No.** Session uses IST; `TIMESTAMP` columns store session-local (IST). Historic data may be UTC.
- **Columns using timestamp without time zone?** **Yes.** Majority of tables (see 1.2).

---

## PHASE 2 — SAFE DATABASE STRATEGY

### 2.1 Principle

- **Do NOT alter existing columns** in a way that shifts stored values.
- **New columns** use `TIMESTAMPTZ`.
- **Migrations** convert `TIMESTAMP` → `TIMESTAMPTZ` only when we can safely assume stored values (e.g. UTC or session TZ at write time).

### 2.2 Migration Scripts (Generated, NOT Executed)

See `db/migrations/2026-02-timezone-hardening.sql` (created below).

### 2.3 New Timezone Context Columns (Optional, Phase 2b)

- `partners.timezone` VARCHAR(50) DEFAULT 'Asia/Kolkata' — IANA
- `users.timezone` VARCHAR(50) — nullable, for display
- No `bookings.partner_timezone` — derivable from partners

---

## PHASE 3 — BACKEND TimeService UTILITY

See `src/utils/timeService.js` (created below).

---

## PHASE 4 — API COMPATIBILITY

- **Response shape:** Unchanged.
- **Datetime values:** Ensure ISO 8601 (with Z for UTC).
- **booked_on_ist:** Keep as formatted string for display; no breaking change.

---

## PHASE 5 — DEAL VALIDITY LOGIC

- **Current:** `start_date`, `end_date` (TIMESTAMP) compared with `CURRENT_TIMESTAMP`.
- **Future:** Store `start_time_local`, `end_time_local` (TIME) + `timezone` (IANA) for time-bound deals. Convert at runtime to UTC for comparison. **Not implemented** — requires schema + business logic change.

---

## PHASE 6 — VALIDATION TESTS

Test stubs generated in `test/timezone.test.js` (created below).

---

## PHASE 7 — SAFETY CHECKS

| Check | Status |
|-------|--------|
| No data loss risk | ✅ Migrations additive / reversible |
| Migrations reversible | ✅ Backup scripts documented |
| Timestamps UTC at rest | ⚠️ After migration, new data will be |
| No breaking API changes | ✅ |
| Timezone as IANA | ✅ |
| DST safe | ✅ TIMESTAMPTZ handles DST |

---

## RISK ASSESSMENT

| Risk | Mitigation |
|------|------------|
| Historic TIMESTAMP values interpreted wrong | Assume UTC for pre-migration data; document in migration |
| Session TZ change affects new writes | Standardize on UTC session for new connections (optional) |
| Frontend expects local time | Keep booked_on_ist; add display TZ only at presentation |

---

## FILES CREATED

1. `db/migrations/2026-02-timezone-hardening.sql` — Schema migrations (partners.timezone, users.timezone)
2. `src/utils/timeService.js` — Centralized TimeService (convertToUTC, convertFromUTC, validateISO8601, getUserTimezone)
3. `test/timezone.test.js` — Validation test stubs

---

## RECOMMENDATIONS

1. **DB session timezone:** Consider reverting `db.js` to `SET timezone = 'UTC'` for new connections. Store all timestamps in UTC. Display in user/partner TZ only at presentation. (Current: IST — acceptable for India-only; problematic for global scale.)

2. **Gradual adoption:** Use `timeService.js` in new code paths first. Migrate existing logic incrementally.

3. **Deal validity (Phase 5):** Defer until business defines "Valid 6 PM–10 PM local partner time" requirements. Requires `start_time_local`, `end_time_local`, `timezone` on offers/partners.
