# Code Review: Operating Hours, Multiple Breaks, Slot Booking & Waitlist

**Context:** Globally used, cross-vertical app (dining, events, theatre, loyalty, vouchers, NFC, governance, developer API, partner console, admin). Shared services (e.g. operating hours, slot capacity, booking) must stay backward compatible and safe across verticals.

**Scope:** App bootstrap and cross-vertical concerns; operatingHoursService, slotCapacityService, bookingValidation, bookingService (slot/reservation path), waitlistService, operatingHoursController, OperatingHoursManager (frontend), migrations.

---

## 0. App-wide / cross-vertical

### Bootstrap (app.js, server.js, config)
- **Routes:** 30+ route modules mounted under `/api/v1/*` (auth, loyalty, theatre, bookings, redemptions, vouchers, partners, conversations, passes, events, tickets, admin, user, categories, offers, services, tiers, bank offers, reservations, pre-orders, notifications, achievements, referrals, recommendations, developer, governance, settings, NFC). Partner routes include operating-hours and waitlist; booking routes are shared across verticals.
- **Config (env.js):** CORS, DB pool, Redis, JWT/OTP; production fails fast if `JWT_SECRET` is default.
- **Server:** DB init, Redis cache, upload dirs, cron jobs (booking auto-cancel, event cleanup, redemption expiration, **waitlist promotion**), optional WebSocket; unhandledRejection/warning handlers.
- **Security:** Helmet (CSP disabled for legacy), rate limiting (`apiLimiter`: dev/localhost skip, configurable max), request context, global error handler (statusCode, requestId, 500 logging).

### Error handling (middleware/errorHandler.js)
- Central handler: `err.statusCode`, `err.message`, `err.details`; 500s logged with stack and requestId. No leak of internals to client.

### Rate limiting (middleware/rateLimiters.js)
- API: 15 min window; dev/high limit or env; `RATE_LIMIT_DISABLED` and localhost skip. OTP limiter separate (5 min, 3–10 max). Safe for Partner Console bursts when disabled in dev.

### Cross-vertical usage
- **Operating hours:** Used by dining/reservation flow (validateBookingTime); public endpoints per partner (`/:id/operating-hours`, `/:id/operating-hours/:date`). Single service for all verticals that need “open/closed” or “hours for date”.
- **Slot capacity:** Dining/reservation path only when `venue_time_slots` exists; legacy path unchanged. Waitlist promotion reads slots; no conflict with events/theatre.
- **Booking createBooking:** Handles events, offers, shows, reservation_data, pre_order_data, bank offers; slot reserve/release is additive and only affects dining slot path.

---

## 1. operatingHoursService.js

### Strengths
- **Time handling:** `toHHMM`, `timeToMinutes` accept HH:MM and HH:MM:SS; all API-facing times normalized to HH:MM. No seconds in responses.
- **Validation:** `validateTimeRange` enforces start < end, breaks within hours, no overlap, overnight breaks don’t span midnight. Aligns with MULTIPLE_BREAKS_GUIDE.
- **Overlap:** `overlapsAnyBreak` correctly treats booking vs break as interval overlap (`start < breakEnd && end > breakStart`).
- **Overnight:** `isWithinWindow` and previous-day spillover for overnight hours are correct.
- **Schema:** `ensurePartnerHoursTable()` creates table with `breaks` JSONB and runs `ADD COLUMN IF NOT EXISTS breaks`; `getPartnerOperatingHours` and `getOpeningHoursForDate` call it before SELECT so the column exists.
- **Special closures:** Full-day and custom hours handled; closure table ensured before use.
- **setPartnerHours:** DELETE + INSERT in a transaction; validates all 7 days with `validateTimeRange`; stores `breaks` as JSONB.

### Issues & recommendations

| # | Issue | Severity | Recommendation |
|---|--------|----------|----------------|
| 1 | **JSONB shape from DB:** `dayHours.breaks` from PostgreSQL may be a parsed array or, in some setups, a string. Using `(dayHours.breaks \|\| []).map(...)` will throw if `breaks` is a string. | Low | Normalize: `const raw = dayHours.breaks; const arr = Array.isArray(raw) ? raw : (typeof raw === 'string' ? JSON.parse(raw \|\| '[]') : []);` and use `arr` for mapping. |
| 2 | **validateBookingTime date:** `bookingDate.split('-').map(Number)` can yield NaN for invalid dates; `dateObj.getUTCDay()` then NaN and the query uses invalid day_of_week. | Low | Validate format (e.g. `/^\d{4}-\d{2}-\d{2}$/`) and that `dateObj.getTime()` is not NaN; return `{ valid: false, reason: 'INVALID_DATE' }` when invalid. |
| 3 | **NO_HOURS_CONFIGURED:** When there are no rows for today or previous day, booking is allowed. Document or gate this (e.g. config flag) if “no hours” should mean “closed” in production. | Low | Product decision; optional config like `allowBookingWhenNoHours: false` to reject instead of allow. |

---

## 2. slotCapacityService.js

### Strengths
- **Legacy fallback:** `slotTableExists` uses `to_regclass`; when table is missing, `reserveSlot` returns `LEGACY` and callers don’t touch slots.
- **Concurrency:** `reserveSlot` uses `FOR UPDATE`, then checks capacity and increments in the same transaction. Prevents overbooking.
- **Echelon:** `maxAllowed = isEchelon ? cap + buf : cap`; `is_priority_override` set when booking uses buffer.
- **ensureSlot:** Idempotent INSERT with ON CONFLICT DO NOTHING so first booking for a slot creates the row.
- **toSlotDatetime:** Builds UTC timestamp from date + time; returns null on invalid input.

### Issues & recommendations

| # | Issue | Severity | Recommendation |
|---|--------|----------|----------------|
| 1 | **reserveSlot(..., capacity, echelonBuffer):** When creating a new slot via `ensureSlot`, default capacity/buffer are used. Booking flow passes `DEFAULT_CAPACITY` and `DEFAULT_ECHELON_BUFFER`; partner-specific defaults are not used. | Low | Optional: resolve partner-level defaults (e.g. from `partners` or config) and pass into `reserveSlot` for the new-slot case. |
| 2 | **releaseSlot on rollback** | ~~Medium~~ **Done** | Implemented: `releaseSlotStandalone(partnerId, slotDatetime, partySize)` runs in its own transaction; `bookingService.createBooking` catch calls it before `ROLLBACK` when `_slotReserved` is set, so slot count is corrected even when booking fails (e.g. QR generation). |

---

## 3. bookingValidation.js

### Strengths
- **Order:** Operating hours first (operatingHoursService.validateBookingTime); capacity second; Echelon override and waitlist messaging last.
- **Dual source:** Tries `getSlotCapacity` (venue_time_slots) first; falls back to `reservationRepository.checkAvailability` (restaurant_availability). No breaking change for legacy.
- **Echelon:** Slot path uses `availableWithEchelon`; legacy path uses `checkEchelonOverride` with partner buffer %. Consistent semantics.
- **Messages:** `can_waitlist`, `waitlist_info` set when capacity full and within hours.

### Issues & recommendations

| # | Issue | Severity | Recommendation |
|---|--------|----------|----------------|
| 1 | **Tier name:** Echelon check is `user_tier === 'Echelon'`. If DB or upstream uses different casing (e.g. `echelon`), override won’t apply. | Low | Normalize: e.g. `String(user_tier).toLowerCase() === 'echelon'` (or keep consistent casing in DB). |

---

## 4. bookingService.js (slot + reservation path)

### Strengths
- **Slot reserve before booking:** After validation, `reserveSlot` runs inside the same transaction; only then is the booking row created. Prevents double-booking.
- **skipCapacityUpdate:** When `_slotReserved` is true, reservation is created with `skipCapacityUpdate: true` so `restaurant_availability` is not updated. Avoids double-counting.
- **is_priority_override:** Set from validation and/or from `reserveSlot` result and passed in payload; repository persists it.

### Issues & recommendations

| # | Issue | Severity | Recommendation |
|---|--------|----------|----------------|
| 1 | **Rollback without release** | ~~Medium~~ **Done** | Release on rollback implemented: catch calls `releaseSlotStandalone(partner_id, slotDt, partySize)` (slotDt/partySize derived in catch) before `ROLLBACK`. |
| 2 | **Slot datetime for reserve** | Low | In catch, `slotDt` is recomputed via `toSlotDatetime(bookingDate, bookingTime)`; no need to store in outer scope. |

---

## 5. operatingHoursController.js

### Strengths
- **Auth:** Uses `req.partnerId`; 401 when missing.
- **GET/PUT:** Delegates to operatingHoursService; response shape consistent.

### Issues & recommendations

| # | Issue | Severity | Recommendation |
|---|--------|----------|----------------|
| 1 | **PUT validation:** Comment and validation still mention `break_start` / `break_end`. Frontend sends `breaks: [{ start, end }, ...]`. Controller doesn’t validate `breaks` (format or “both start and end”). | Low | Accept `breaks` in PUT validation: if `dayData.breaks` is present, require Array and for each item require `start`/`end` and time regex; keep backward compat for `break_start`/`break_end` if still used elsewhere. |

---

## 6. reservationRepository.js

### Strengths
- **skipCapacityUpdate:** When true, only `table_reservations` is inserted; `restaurant_availability` is not updated. Correct for slot-based path.
- **Legacy:** When false, existing availability check and update logic unchanged.

### Issues
- None material; behavior matches design.

---

## 7. waitlistService.js

### Strengths
- **runPromotionCycle:** Only runs when `venue_time_slots` exists; selects slots with `booked_count < capacity` and `slot_datetime >= CURRENT_TIMESTAMP`; maps to (partner_id, booking_date, booking_time) and calls `notifyNextInWaitlist`. Batch limit (50) avoids long runs.
- **notifyNextInWaitlist:** Locks one row with FOR UPDATE; sets status `notified` and 10-minute `expires_at`. Safe and clear.

### Issues & recommendations

| # | Issue | Severity | Recommendation |
|---|--------|----------|----------------|
| 1 | **booking_waitlist.booking_time type:** Waitlist uses `booking_date` + `booking_time`; promotion builds `booking_time` as HH:MM string. If column is TIME, comparison with string may depend on PG casting. | Low | Prefer consistent format (e.g. always 'HH:MM') and, if needed, cast in SQL (e.g. `booking_time::text` or `$2::time`) so comparison is reliable. |

---

## 8. Frontend (OperatingHoursManager.jsx)

### Strengths
- **Multiple breaks:** State uses `breaks: [{ start, end }, ...]` per day; add/remove/change handlers; payload sends only breaks with both start and end; times normalized with `toHHMM`.
- **Resilience:** Default 7-day grid; on load failure, shows defaults and error message; `step="60"` on time inputs.
- **API mapping:** `mapApiDayToState` maps API `breaks` array to state; save sends `breaks` array.

### Issues & recommendations

| # | Issue | Severity | Recommendation |
|---|--------|----------|----------------|
| 1 | **Break validation before save:** Incomplete breaks (e.g. only start) are filtered in payload but not flagged in UI. | Low | Optional: disable Save or show a short message when any break has only one of start/end set. |
| 2 | **showMessage:** Used but not defined in the snippet; likely from parent or hook. | N/A | Ensure `showMessage` is defined (e.g. in component or context). |

---

## 9. Migrations

### Files
- **2026-02-enterprise-booking-engine.sql:** venue_time_slots, bookings.is_priority_override, indexes (partial index on slot_datetime removed; non-partial kept).
- **2026-02-partner-hours-breaks-column.sql:** ADD COLUMN breaks to partner_hours; optional backfill from break_start/break_end.

### Issues
- None; additive and idempotent (IF NOT EXISTS / DO NOTHING where appropriate).

---

## 10. Summary table

| Area | Overall | Critical | Medium | Low |
|------|---------|----------|--------|-----|
| operatingHoursService | ✅ Solid | 0 | 0 | 3 |
| slotCapacityService | ✅ Solid | 0 | 0 (release on rollback done) | 1 |
| bookingValidation | ✅ Solid | 0 | 0 | 1 |
| bookingService (slot path) | ✅ Good | 0 | 0 (release on rollback done) | 1 |
| operatingHoursController | ✅ Good | 0 | 0 | 1 |
| waitlistService | ✅ Solid | 0 | 0 | 1 |
| Frontend | ✅ Solid | 0 | 0 | 2 |
| Migrations | ✅ Good | 0 | 0 | 0 |

---

## 11. Recommended next steps (priority)

1. ~~**High:** Add releaseSlot on rollback~~ **Done:** `releaseSlotStandalone` + catch in `createBooking`.
2. **Low:** Normalize `breaks` from DB in operatingHoursService (array vs string) before `.map(...)`.
3. **Low:** Validate `bookingDate` format and date validity in validateBookingTime; reject with INVALID_DATE when invalid.
4. **Low:** Align operatingHoursController PUT validation with `breaks` array (and optional break_start/break_end for backward compat).
5. **Low:** Optional: partner-specific default capacity/buffer when creating new slot rows.

---

**Conclusion:** The design is consistent, backward compatible, and matches the MULTIPLE_BREAKS_GUIDE and enterprise booking spec. Release-on-rollback is implemented for the cross-vertical booking flow; remaining items are low-priority hardening and alignment.
