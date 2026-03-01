# Event Booking Capacity Flow

This document describes the unified capacity logic for EVENT deals after the refactor that fixes the false "Time slot just became full" error.

## Flow Diagram

```
Event Booking (createBooking)
        │
        ▼
┌───────────────────────────────────────────────────────────────────────┐
│ 1. getEffectiveEventSlotCapacity(offer_id, booking_date, booking_time)│
│    - Normalizes time (HH:MM)                                           │
│    - Fetches matching event_slot from event_slots                       │
│    - Returns { capacity } from event_slots.capacity                     │
│    - Throws SLOT_NOT_FOUND if no matching slot                         │
└───────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────────────────┐
│ 2. Validation (validateBookingRequest)                                │
│    - is_event=true, effective_event_slot_capacity=from step 1         │
│    - getDealSlotCapacity(offer_id, date, time, effective_event_slot_   │
│      capacity) → checks deal_slots (capacity, booked)                 │
│    - If table missing → throw CAPACITY_SYSTEM_NOT_INITIALIZED          │
│    - If availableCapacity >= party_size → allowed                      │
│    - Else → CAPACITY_FULL + waitlist                                  │
│    - Never falls back to venue_time_slots for EVENT                    │
└───────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────────────────┐
│ 3. Reservation (reserveDealSlot)                                      │
│    - Uses SAME effective_event_slot_capacity from step 1               │
│    - If deal_slots table missing → throw CAPACITY_SYSTEM_NOT_INITIALIZED│
│    - INSERT ON CONFLICT DO NOTHING (creates row if missing)            │
│    - SELECT ... FOR UPDATE (lock row)                                  │
│    - If cap <= 0 → return FULL (with log)                             │
│    - If booked + partySize > cap → return FULL                         │
│    - Else: UPDATE deal_slots SET booked = booked + partySize          │
└───────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────────────────┐
│ 4. Update (booking creation)                                          │
│    - Create booking record                                             │
│    - Generate QR, etc.                                                 │
└───────────────────────────────────────────────────────────────────────┘
```

## Capacity Source Rules

| Deal Type | Capacity Source | Fallback |
|-----------|-----------------|----------|
| **EVENT** | `event_slots.capacity` only | None — throw SLOT_NOT_FOUND if no match |
| **Dining / Others** | `max_redemptions_per_slot` or `venue_time_slots` | `restaurant_availability` |

For EVENT deals, `offer.max_redemptions_per_slot` is **ignored**. Capacity is always from `event_slots.capacity`.

## Debug Logging

Set `DEBUG_BOOKING_CAPACITY=true` to enable structured logs:

- `[BOOKING DEBUG] createBooking` — offer_id, booking_date, booking_time, effective_event_slot_capacity
- `[BOOKING DEBUG] getDealSlotCapacity` — deal_slots row (capacity, booked), comparison
- `[BOOKING DEBUG] reserveDealSlot` — effectiveSlotCapacity, deal_slots row, booked+partySize vs cap

## Schema

- **event_slots**: `(offer_id, slot_time, capacity, ...)` — per-slot capacity for events
- **deal_slots**: `(deal_id, date, time_slot, capacity, booked)` — UNIQUE(deal_id, date, time_slot)

## Error Handling

| Error | When |
|-------|------|
| `SLOT_NOT_FOUND` | Selected time does not match any event_slot |
| `CAPACITY_SYSTEM_NOT_INITIALIZED` | deal_slots table missing |
| `CAPACITY_FULL` | booked + partySize > capacity (with waitlist option) |
