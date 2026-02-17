# Operating Hours, Waitlist & Echelon Override Implementation Plan

## Executive Summary

Implement a globally compliant booking system with:
- Partner-configurable operating hours enforcement
- Intelligent waitlist with wait time estimation
- Echelon tier capacity override (NOT opening hours)
- Full backward compatibility with existing booking flow

**Non-negotiable constraints:**
- Bookings ONLY within operating hours
- Waitlist ONLY within operating hours
- Echelon overrides capacity, NOT hours
- Backend validation (not just UI)
- No breaking changes to existing schema

---

## Current State Analysis

### Existing Database Tables

✅ **`partner_hours`** (already exists, currently empty)
- Columns: `partner_id`, `day_of_week`, `opens_at`, `closes_at`, `is_closed`
- **Can be reused** for operating hours

✅ **`restaurant_availability`** (already exists, actively used)
- Columns: `partner_id`, `date`, `time_slot`, `max_capacity`, `booked_capacity`, `is_available`, `is_blocked`
- **Can be reused** for capacity management

✅ **`bookings`** table has all necessary fields
- Already has: `booking_date`, `booking_time`, `partner_id`, `user_tier_at_booking`

### Existing Services

✅ **`reservationService.js`** - Already has:
- `checkAvailability(partnerId, date, timeSlot)`
- `getAvailableTimeSlots(partnerId, date, partySize)`
- Uses `restaurant_availability` table

✅ **`bookingService.js`** - Creates bookings but NO time validation against hours

❌ **Missing**: Opening hours validation
❌ **Missing**: Waitlist system
❌ **Missing**: Echelon override logic
❌ **Missing**: Partner console UI for hours/capacity

---

## Implementation Strategy

### PHASE 1: Operating Hours Foundation (CRITICAL)

#### 1.1 Database Enhancements

**Reuse `partner_hours`** (already exists):
```sql
-- Already exists, just needs to be populated
-- Add break periods support
ALTER TABLE partner_hours ADD COLUMN break_start TIME;
ALTER TABLE partner_hours ADD COLUMN break_end TIME;
```

**New table: `partner_special_closures`**:
```sql
CREATE TABLE partner_special_closures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  closure_date DATE NOT NULL,
  closure_reason TEXT,
  is_full_day BOOLEAN DEFAULT TRUE,
  custom_opens_at TIME,
  custom_closes_at TIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(partner_id, closure_date)
);
CREATE INDEX idx_special_closures_partner_date ON partner_special_closures(partner_id, closure_date);
```

#### 1.2 Operating Hours Service

**New file**: `backend/src/services/operatingHoursService.js`

Methods:
- `getPartnerOperatingHours(partnerId)` - Get full week schedule
- `isOpenAt(partnerId, dateTime)` - Check if partner is open at specific date/time
- `getOpeningHoursForDate(partnerId, date)` - Get opens_at, closes_at, break periods for a date
- `validateBookingTime(partnerId, bookingDate, bookingTime)` - **CRITICAL** validation
- `setPartnerHours(partnerId, hoursData)` - Partner console API
- `addSpecialClosure(partnerId, closureData)` - Holiday/temp closures

**Validation logic**:
```javascript
async function validateBookingTime(partnerId, bookingDate, bookingTime) {
  // 1. Check if date is in special_closures
  const closure = await checkSpecialClosure(partnerId, bookingDate);
  if (closure && closure.is_full_day) {
    return { valid: false, reason: 'VENUE_CLOSED_ON_DATE' };
  }

  // 2. Get day of week, fetch partner_hours
  const dayOfWeek = new Date(bookingDate).getDay();
  const hours = await getHoursForDay(partnerId, dayOfWeek);

  if (hours.is_closed) {
    return { valid: false, reason: 'VENUE_CLOSED_ON_DAY' };
  }

  // 3. Validate time is within opens_at - closes_at
  if (bookingTime < hours.opens_at || bookingTime > hours.closes_at) {
    return { valid: false, reason: 'OUTSIDE_OPERATING_HOURS' };
  }

  // 4. Check break period
  if (hours.break_start && hours.break_end) {
    if (bookingTime >= hours.break_start && bookingTime <= hours.break_end) {
      return { valid: false, reason: 'DURING_BREAK_PERIOD' };
    }
  }

  return { valid: true };
}
```

#### 1.3 Booking Service Integration

**Modify**: `backend/src/services/bookingService.js`

**BEFORE creating booking**:
```javascript
// NEW: Validate against operating hours (MANDATORY)
if (bookingDate && bookingTime && partner_id) {
  const hoursValidation = await operatingHoursService.validateBookingTime(
    partner_id, bookingDate, bookingTime
  );

  if (!hoursValidation.valid) {
    throw new AppError(400, `Booking not allowed: ${hoursValidation.reason}`);
  }
}
```

---

### PHASE 2: Waitlist System

#### 2.1 Waitlist Database

**New table**: `booking_waitlist`
```sql
CREATE TABLE booking_waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  booking_date DATE NOT NULL,
  booking_time TIME NOT NULL,
  party_size INTEGER NOT NULL,
  user_tier VARCHAR(50),
  position INTEGER NOT NULL,
  estimated_wait_minutes INTEGER,
  status VARCHAR(50) DEFAULT 'waiting', -- waiting | notified | confirmed | expired | cancelled
  notified_at TIMESTAMP,
  expires_at TIMESTAMP, -- 10 min after notification
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_waitlist_partner_datetime ON booking_waitlist(partner_id, booking_date, booking_time);
CREATE INDEX idx_waitlist_user ON booking_waitlist(user_id, status);
CREATE INDEX idx_waitlist_status ON booking_waitlist(status) WHERE status IN ('waiting', 'notified');
```

#### 2.2 Waitlist Service

**New file**: `backend/src/services/waitlistService.js`

Methods:
- `addToWaitlist(partnerId, userId, bookingDate, bookingTime, partySize)` - Add user
- `getWaitPosition(waitlistId)` - Current position
- `estimateWaitTime(partnerId, bookingDate, bookingTime, position)` - Calculate ETA
- `notifyNextInQueue(partnerId, bookingDate, bookingTime)` - Auto-notify
- `confirmWaitlistBooking(waitlistId)` - Convert to booking
- `expireWaitlistEntry(waitlistId)` - Mark expired, notify next

**Wait time calculation**:
```javascript
async function estimateWaitTime(partnerId, bookingDate, bookingTime, position) {
  // Get average visit duration from historical data
  const avgDuration = await getAverageVisitDuration(partnerId);

  // Get capacity for this slot
  const capacity = await getSlotCapacity(partnerId, bookingDate, bookingTime);

  // Formula: (avg turnover × queue position) ÷ capacity
  const estimatedMinutes = Math.ceil((avgDuration * position) / capacity);

  return {
    min: estimatedMinutes - 5,
    max: estimatedMinutes + 5
  };
}
```

**Waitlist activation logic**:
```javascript
async function canBookOrWaitlist(partnerId, bookingDate, bookingTime, partySize) {
  // 1. Validate operating hours FIRST
  const hoursCheck = await operatingHoursService.validateBookingTime(
    partnerId, bookingDate, bookingTime
  );

  if (!hoursCheck.valid) {
    return {
      canBook: false,
      canWaitlist: false, // NEVER allow waitlist outside hours
      reason: hoursCheck.reason
    };
  }

  // 2. Check capacity
  const availability = await reservationRepository.checkAvailability(
    partnerId, bookingDate, bookingTime
  );

  if (availability.available && availability.availableCapacity >= partySize) {
    return { canBook: true, canWaitlist: false };
  }

  if (availability.is_blocked) {
    return { canBook: false, canWaitlist: true, reason: 'SLOT_BLOCKED' };
  }

  // Capacity full, but slot exists and is within hours
  return { canBook: false, canWaitlist: true, reason: 'CAPACITY_FULL' };
}
```

---

### PHASE 3: Echelon Override

#### 3.1 Database Changes

**Extend `bookings` table**:
```sql
ALTER TABLE bookings ADD COLUMN is_priority_override BOOLEAN DEFAULT FALSE;
ALTER TABLE bookings ADD COLUMN override_reason TEXT;
```

**Partner settings** (optional, add to `partners` table):
```sql
ALTER TABLE partners ADD COLUMN allow_echelon_override BOOLEAN DEFAULT TRUE;
ALTER TABLE partners ADD COLUMN echelon_capacity_buffer_percent DECIMAL(5,2) DEFAULT 10.0;
```

#### 3.2 Override Logic

**Modify**: `backend/src/services/bookingService.js`

```javascript
// After hours validation, before capacity check
const userTier = await getUserTier(user_id);

if (userTier === 'Echelon') {
  // Check if partner allows override
  const partner = await getPartner(partner_id);

  if (partner.allow_echelon_override) {
    // Calculate buffer
    const maxCapacity = availability.maxCapacity;
    const bufferPercent = partner.echelon_capacity_buffer_percent || 10;
    const maxWithBuffer = Math.ceil(maxCapacity * (1 + bufferPercent / 100));

    if (availability.bookedCapacity < maxWithBuffer) {
      // Allow override
      bookingPayload.is_priority_override = true;
      bookingPayload.override_reason = 'Echelon tier capacity override';

      log(`Echelon override: booking ${user_id} at ${partner_id}, capacity ${availability.bookedCapacity}/${maxWithBuffer}`);

      // Continue with booking creation
    } else {
      // Even Echelon can't override beyond buffer
      throw new AppError(409, 'Capacity fully booked (including Echelon buffer)');
    }
  }
}
```

**CRITICAL RULE**: Echelon override MUST still pass operating hours check:
```javascript
// This check happens BEFORE Echelon override
if (!hoursValidation.valid) {
  // Even Echelon cannot book outside hours
  throw new AppError(400, `Booking not allowed outside operating hours`);
}
```

---

### PHASE 4: Partner Console UI

#### 4.1 Operating Hours Tab

**Add to**: `frontend/src/pages/PartnerConsole.jsx`

New section: `'hours'` → Operating Hours

**UI Components**:
- **Weekly Schedule Grid**:
  - 7 rows (Mon-Sun)
  - Each row: Day | Is Closed | Opens At | Closes At | Break Start | Break End
  - Time pickers for all time fields

- **Special Closures Section**:
  - Add holiday/temporary closure
  - Date picker + full/partial day toggle
  - List of upcoming closures with delete option

- **Save button** → POST `/api/v1/partners/me/operating-hours`

#### 4.2 Availability Management Tab

**Add to**: `frontend/src/pages/PartnerConsole.jsx`

New section: `'availability'` → Capacity & Slots

**UI Components**:
- **Date picker** to select date
- **Time slot grid** for selected date (e.g., 11:00 AM - 11:00 PM in 30-min intervals)
- For each slot:
  - Current bookings / Max capacity (editable)
  - Block/Unblock toggle
  - Block reason (if blocked)

- **Bulk actions**:
  - Set default capacity for all slots
  - Block all slots for date
  - Copy from another date

#### 4.3 Waitlist Dashboard

**Add to**: `frontend/src/pages/PartnerConsole.jsx`

New section: `'waitlist'` → Waitlist Management

**UI Components**:
- **Active waitlist** table:
  - Date/Time | Customer Name | Party Size | Position | Est. Wait | Status
  - Actions: Notify, Cancel

- **Auto-notification settings**:
  - Enable/disable auto-notify
  - Notification window (default: 10 minutes)

---

### PHASE 5: User-Facing Booking Flow

#### 5.1 EventBooking.jsx Enhancements

**Date/Time picker validation**:

```javascript
// After user selects date + time
const checkAvailability = async () => {
  try {
    const response = await fetch(
      `${API_BASE}/api/v1/bookings/check-availability`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partner_id: deal.partner_id,
          booking_date: bookingDate,
          booking_time: bookingTime,
          party_size: numTickets
        })
      }
    );

    const result = await response.json();

    if (!result.canBook && !result.canWaitlist) {
      // Outside operating hours or closed
      setError(`Booking not available: ${result.reason}`);
      setShowWaitlistOption(false);
    } else if (!result.canBook && result.canWaitlist) {
      // Capacity full or slot blocked
      setShowWaitlistOption(true);
      setWaitlistInfo(result.waitlistInfo);
    } else {
      // Can book normally
      setShowWaitlistOption(false);
    }
  } catch (err) {
    setError('Failed to check availability');
  }
};

// Call on date/time change
useEffect(() => {
  if (bookingDate && bookingTime) {
    checkAvailability();
  }
}, [bookingDate, bookingTime]);
```

**Waitlist UI**:
```jsx
{showWaitlistOption && (
  <div style={{ background: '#fffbeb', padding: '1rem', borderRadius: '8px', marginTop: '1rem' }}>
    <div style={{ fontWeight: '600', color: '#92400e', marginBottom: '0.5rem' }}>
      ⏰ Slot Fully Booked
    </div>
    <div style={{ fontSize: '0.9rem', color: '#78350f' }}>
      You're #{waitlistInfo.position} in queue.
      Estimated wait: {waitlistInfo.estimatedWait.min}–{waitlistInfo.estimatedWait.max} minutes.
    </div>
    <button
      onClick={handleJoinWaitlist}
      style={{ marginTop: '0.75rem', background: '#d97706', color: '#fff' }}
    >
      Join Waitlist
    </button>
  </div>
)}
```

---

## API Endpoints Summary

### New Endpoints

**Operating Hours**:
- `GET /api/v1/partners/me/operating-hours` - Get partner's hours
- `PUT /api/v1/partners/me/operating-hours` - Update hours
- `GET /api/v1/partners/:id/operating-hours` - Public endpoint (for booking UI)
- `POST /api/v1/partners/me/special-closures` - Add closure
- `DELETE /api/v1/partners/me/special-closures/:id` - Remove closure

**Availability**:
- `GET /api/v1/partners/me/availability?date=YYYY-MM-DD` - Get slots for date
- `PUT /api/v1/partners/me/availability` - Bulk update slots
- `POST /api/v1/bookings/check-availability` - User-facing validation

**Waitlist**:
- `POST /api/v1/waitlist` - Join waitlist
- `GET /api/v1/waitlist/me` - User's waitlist entries
- `DELETE /api/v1/waitlist/:id` - Cancel waitlist
- `GET /api/v1/partners/me/waitlist` - Partner view
- `POST /api/v1/partners/me/waitlist/:id/notify` - Manual notify

---

## Migration Strategy

### Step 1: Schema Migrations (Zero Downtime)
```sql
-- Add optional columns to existing tables
ALTER TABLE partner_hours ADD COLUMN break_start TIME;
ALTER TABLE partner_hours ADD COLUMN break_end TIME;

ALTER TABLE bookings ADD COLUMN is_priority_override BOOLEAN DEFAULT FALSE;
ALTER TABLE bookings ADD COLUMN override_reason TEXT;

ALTER TABLE partners ADD COLUMN allow_echelon_override BOOLEAN DEFAULT TRUE;
ALTER TABLE partners ADD COLUMN echelon_capacity_buffer_percent DECIMAL(5,2) DEFAULT 10.0;

-- Create new tables
CREATE TABLE partner_special_closures (...);
CREATE TABLE booking_waitlist (...);
```

### Step 2: Deploy Backend Services (Backward Compatible)
- New services don't break existing booking flow
- Hours validation defaults to "allow" if no hours configured
- Waitlist features only activate if partner has hours configured

### Step 3: Deploy Partner Console UI
- Add new tabs to Partner Console
- Partners can configure hours at their own pace

### Step 4: Deploy User-Facing Enhancements
- Booking flow adds hours validation
- Waitlist option appears when capacity full

---

## Testing Checklist

### Operating Hours Validation
- [ ] Booking within hours → allowed
- [ ] Booking outside hours → rejected
- [ ] Booking during break period → rejected
- [ ] Booking on closed day → rejected
- [ ] Booking on special closure date → rejected
- [ ] Booking on partial closure with custom hours → validated against custom hours

### Echelon Override
- [ ] Echelon user can book beyond capacity (within buffer)
- [ ] Echelon user CANNOT book outside operating hours
- [ ] Echelon override respects partner's buffer limit (10%)
- [ ] Non-Echelon user cannot book when capacity full

### Waitlist
- [ ] Waitlist offered when capacity full + within hours
- [ ] Waitlist NOT offered when outside hours
- [ ] Wait time estimation accurate
- [ ] Auto-notify on cancellation works
- [ ] Waitlist confirmation window expires after 10 min
- [ ] Next in queue gets notified

### Concurrency
- [ ] Two users joining waitlist simultaneously → correct positions
- [ ] Booking + waitlist confirmation race condition handled
- [ ] Capacity updates lock correctly

---

## Rollout Plan

**Week 1**: Backend foundation
- Implement operatingHoursService
- Add hours validation to bookingService
- Deploy to staging

**Week 2**: Partner Console UI
- Operating Hours tab
- Availability Management tab
- Deploy to production (opt-in)

**Week 3**: Waitlist system
- Waitlist backend
- Waitlist UI (partner + user)
- Deploy to production

**Week 4**: Echelon override
- Override logic
- Partner settings
- Deploy to production

---

## Open Questions for User

1. **Database approach**: Use existing `partner_hours` or create new `venue_operating_hours`?
2. **Slot system**: Use existing `restaurant_availability` or create new `venue_time_slots`?
3. **Echelon override configuration**: Hardcoded global rule or partner-configurable?

*Awaiting user answers to finalize implementation details.*
