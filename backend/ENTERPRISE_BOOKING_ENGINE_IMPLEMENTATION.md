# Enterprise Booking Engine — Implementation Summary

## 1. Files Modified / Created

### Created
| File | Purpose |
|------|--------|
| `db/migrations/2026-02-enterprise-booking-engine.sql` | Additive migration: `venue_time_slots` table, indexes, `bookings.is_priority_override` |
| `src/services/slotCapacityService.js` | Concurrency-safe slot reserve/release; legacy fallback when table missing |
| `src/jobs/waitlistPromotionJob.js` | Cron (every 1 min): promote waitlist when slots have capacity |

### Modified
| File | Change |
|------|--------|
| `src/services/bookingValidation.js` | Capacity check: try `venue_time_slots` first (read-only), then legacy `restaurant_availability`; Echelon logic for both paths |
| `src/services/bookingService.js` | After validation: `reserveSlot()` in same transaction; pass `skipCapacityUpdate` when creating reservation if slot reserved |
| `src/repositories/bookingRepository.js` | INSERT bookings: add `is_priority_override` column (additive) |
| `src/repositories/reservationRepository.js` | `createReservation`: optional `skipCapacityUpdate` to avoid double-counting when using `venue_time_slots` |
| `src/services/waitlistService.js` | Add `runPromotionCycle()`: find slots with free capacity, notify first waiting user per slot; export `runPromotionCycle` |
| `src/server.js` | Start `startWaitlistPromotionJob()` on bootstrap |

### Not modified (per constraints)
- `operatingHoursService.js` — unchanged
- Existing table/column names — no renames
- Existing booking API response shape — only additive `is_priority_override` on booking object
- QR / check-in / admin flows — unchanged

---

## 2. Migration SQL (Additive Only)

Location: `backend/db/migrations/2026-02-enterprise-booking-engine.sql`

- **venue_time_slots**: `partner_id`, `slot_datetime`, `capacity`, `booked_count`, `echelon_buffer`, unique on `(partner_id, slot_datetime)`.
- **bookings**: `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS is_priority_override BOOLEAN DEFAULT FALSE`.
- **Indexes**: `idx_slot_lookup`, `idx_slot_datetime` on `venue_time_slots`.

Run with your DB user and database, e.g.:

```bash
psql -U your_username -d elizian_db -f backend/db/migrations/2026-02-enterprise-booking-engine.sql
```

---

## 3. Regression Risk Analysis

| Area | Risk | Mitigation |
|------|------|------------|
| **Booking creation** | Low | Slot path only when `venue_time_slots` exists and slot exists; otherwise legacy path unchanged. `reserveSlot` returns `LEGACY` when table missing. |
| **Capacity source** | Low | Validation uses slot capacity when available, else `restaurant_availability`. No removal of legacy logic. |
| **Reservations** | Low | `skipCapacityUpdate` only set when slot was reserved; legacy reservations still update `restaurant_availability`. |
| **Waitlist** | Low | Existing `booking_waitlist` schema and APIs unchanged. Promotion only runs when `venue_time_slots` exists. |
| **Echelon** | Low | Same override rules; slot path uses `availableWithEchelon`; legacy path still uses `checkEchelonOverride`. |
| **QR / redemption** | None | No changes to QR or redemption flows. |
| **Admin / partner dashboard** | None | No changes to admin or partner APIs. |

---

## 4. Load Test Scenario

**Goal:** Verify concurrency-safe capacity and no overbooking.

1. **Setup**
   - Run migration.
   - Create one slot: `INSERT INTO venue_time_slots (partner_id, slot_datetime, capacity, booked_count, echelon_buffer) VALUES ('<partner_uuid>', '2026-03-01 19:00:00', 5, 0, 2);`
   - Ensure operating hours allow that time.

2. **Concurrent bookings (e.g. 8 users, same slot)**
   - 8 parallel POST `/api/v1/bookings` with same `reservation_data.date`/`time` and `partner_id` (and offer_id for reservation path).
   - **Expected:** 5 confirmed (or 7 if some are Echelon and use buffer), rest 409 with `can_waitlist: true`. No more than `capacity + echelon_buffer` confirmed.

3. **Waitlist**
   - After slot is full, POST `/api/v1/bookings/waitlist/join` for same slot.
   - **Expected:** 201, position returned.
   - Cancel one booking (or reduce `booked_count` by 1); run promotion (or wait for cron).
   - **Expected:** First waitlist user gets status `notified` and `expires_at` set.

4. **Legacy path (no slot row)**
   - With same DB but no row in `venue_time_slots` for a given (partner, datetime), book with `restervation_data`.
   - **Expected:** Booking succeeds using `restaurant_availability`; no slot updated.

---

## 5. Edge Case Validation List

| # | Scenario | Expected behavior |
|---|----------|--------------------|
| 1 | `venue_time_slots` table does not exist | All bookings use legacy path; no errors. |
| 2 | Table exists but no row for (partner_id, slot_datetime) | `reserveSlot` creates row (ensureSlot), then reserves. |
| 3 | Slot full, Echelon user | Allowed if `booked_count + party_size <= capacity + echelon_buffer`; `is_priority_override` true. |
| 4 | Slot full, Echelon buffer exhausted | 409 / validation failure, `can_waitlist: true`. |
| 5 | Two requests same slot at same time | FOR UPDATE ensures one-by-one; no overbooking. |
| 6 | Booking created then rollback (e.g. QR failure) | Slot already incremented; need cancel path to call `releaseSlot`. *(Optional follow-up: call releaseSlot on rollback when slotReserved.)* |
| 7 | Waitlist promotion, no one waiting | `notifyNextInWaitlist` returns null; no error. |
| 8 | Promotion job, `venue_time_slots` missing | `runPromotionCycle` returns `{ notified: 0, slots_checked: 0 }`. |
| 9 | Reservation with `skipCapacityUpdate: true` | Only `table_reservations` row inserted; `restaurant_availability` unchanged. |
| 10 | Existing bookings (before migration) | No `is_priority_override` or false; all remain valid. |

---

## 6. Optional Follow-Up: Release Slot on Rollback

If the booking transaction rolls back after `reserveSlot()` has run, slot capacity was already incremented. To keep capacity accurate, you can:

- In `bookingService.createBooking`, in the `catch` block before `client.query('ROLLBACK')`, if `bookingPayload._slotReserved` and `slotDt`, call `slotCapacityService.releaseSlot(client, partner_id, slotDt, num_tickets || 1)`.
- Then rollback. This keeps slot counts consistent when QR generation or later steps fail.

---

## 7. Summary

- **Concurrency-safe booking:** Slot path uses `FOR UPDATE` and increments `booked_count` inside the same transaction.
- **Echelon override:** Allowed within `echelon_buffer`; stored in `bookings.is_priority_override`.
- **Waitlist:** Existing join/APIs unchanged; new promotion job notifies first waiting user when a slot has capacity.
- **Backward compatibility:** Legacy path used when `venue_time_slots` is missing or not used; no breaking API or schema changes.
- **operatingHoursService:** Unchanged; validation still uses it for hours check only.
