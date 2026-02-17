# Integration Instructions: Operating Hours + Waitlist + Echelon Override

## ✅ COMPLETED SO FAR

1. ✅ Database migration applied (`2026-02-operating-hours-waitlist.sql`)
   - `partner_hours` enhanced with break periods
   - `partner_special_closures` table created
   - `booking_waitlist` table created
   - `bookings` table: added `is_priority_override`, `override_reason`
   - `partners` table: added `accepting_bookings`, `allow_echelon_override`, `echelon_capacity_buffer_percent`
   - Default hours seeded (9 AM - 9 PM for existing partners)

2. ✅ Services created:
   - `backend/src/services/operatingHoursService.js` - Hours validation logic
   - `backend/src/services/bookingValidation.js` - Booking validation + Echelon override

---

## 🔧 INTEGRATION STEPS (Manual)

### Step 1: Integrate into Booking Service

**File**: `backend/src/services/bookingService.js`

**Location**: After line 56 (`await client.query('BEGIN');`)

**Add this code**:

```javascript
// ============================================
// CRITICAL: OPERATING HOURS + ECHELON VALIDATION
// ============================================
// This is the MANDATORY gatekeeper for all bookings
// NO booking can bypass this check

const bookingValidation = require('./bookingValidation');
const operatingHoursService = require('./operatingHoursService');

// ... (at line 270-310, after extracting booking_date/booking_time, BEFORE creating booking)

// Get user's tier for Echelon check
const userTier = await bookingValidation.getUserTier(user_id);

// Validate booking time against operating hours + capacity
if (bookingDate && bookingTime && partner_id) {
  const validation = await bookingValidation.validateBookingRequest({
    partner_id,
    user_id,
    booking_date: bookingDate,
    booking_time: bookingTime,
    party_size: num_tickets || 1,
    user_tier: userTier
  });

  if (!validation.allowed) {
    await client.query('ROLLBACK');

    // Return different messages based on reason
    if (validation.reason === 'CAPACITY_FULL' && validation.can_waitlist) {
      throw new AppError(409, `Time slot fully booked. Join waitlist?`, {
        can_waitlist: true,
        waitlist_info: validation.waitlist_info
      });
    }

    throw new AppError(400, validation.message || `Booking not allowed: ${validation.reason}`, {
      reason: validation.reason,
      can_waitlist: validation.can_waitlist || false
    });
  }

  // If Echelon override was used, mark the booking
  if (validation.override_used) {
    bookingPayload.is_priority_override = true;
    bookingPayload.override_reason = validation.override_reason;
    log(`👑 Echelon override used for user ${user_id} at ${bookingDate} ${bookingTime}`);
  }
}
```

**Exact insertion point**:
After line 310 where `bookingTime` is finalized, before line 312 where partner_id validation happens.

---

### Step 2: Add API Endpoints

**File**: `backend/src/routes/partnerRoutes.js`

**Add these routes** (after line 100, before module.exports):

```javascript
// Operating Hours Management
const operatingHoursController = require('../controllers/operatingHoursController');
router.get('/me/operating-hours', authenticateToken, operatingHoursController.getHours);
router.put('/me/operating-hours', authenticateToken, operatingHoursController.updateHours);
router.post('/me/special-closures', authenticateToken, operatingHoursController.addClosure);
router.get('/me/special-closures', authenticateToken, operatingHoursController.listClosures);
router.delete('/me/special-closures/:id', authenticateToken, operatingHoursController.deleteClosure);
router.post('/me/accepting-bookings', authenticateToken, operatingHoursController.toggleAccepting);

// Public endpoint for users to see venue hours
router.get('/:id/operating-hours', operatingHoursController.getPublicHours);
```

**Create**: `backend/src/controllers/operatingHoursController.js`

```javascript
const operatingHoursService = require('../services/operatingHoursService');
const { successResponse, errorResponse } = require('../utils/response');

async function getHours(req, res) {
  try {
    const partnerId = req.userId; // From authenticateToken
    const hours = await operatingHoursService.getPartnerOperatingHours(partnerId);
    return successResponse(res, hours);
  } catch (error) {
    return errorResponse(res, error);
  }
}

async function updateHours(req, res) {
  try {
    const partnerId = req.userId;
    const { hours } = req.body; // Array of day objects
    const result = await operatingHoursService.setPartnerHours(partnerId, hours);
    return successResponse(res, result);
  } catch (error) {
    return errorResponse(res, error);
  }
}

async function addClosure(req, res) {
  try {
    const partnerId = req.userId;
    const closureData = { ...req.body, created_by: req.userId };
    const closure = await operatingHoursService.addSpecialClosure(partnerId, closureData);
    return successResponse(res, closure);
  } catch (error) {
    return errorResponse(res, error);
  }
}

async function listClosures(req, res) {
  try {
    const partnerId = req.userId;
    const closures = await operatingHoursService.getSpecialClosures(partnerId, true);
    return successResponse(res, closures);
  } catch (error) {
    return errorResponse(res, error);
  }
}

async function deleteClosure(req, res) {
  try {
    const partnerId = req.userId;
    const { id } = req.params;
    const deleted = await operatingHoursService.deleteSpecialClosure(id, partnerId);
    return successResponse(res, deleted);
  } catch (error) {
    return errorResponse(res, error);
  }
}

async function toggleAccepting(req, res) {
  try {
    const partnerId = req.userId;
    const { accepting } = req.body;
    const result = await operatingHoursService.toggleAcceptingBookings(partnerId, accepting);
    return successResponse(res, result);
  } catch (error) {
    return errorResponse(res, error);
  }
}

async function getPublicHours(req, res) {
  try {
    const { id } = req.params;
    const hours = await operatingHoursService.getPartnerOperatingHours(id);
    return successResponse(res, hours);
  } catch (error) {
    return errorResponse(res, error);
  }
}

module.exports = {
  getHours,
  updateHours,
  addClosure,
  listClosures,
  deleteClosure,
  toggleAccepting,
  getPublicHours
};
```

---

### Step 3: Add Booking Availability Check Endpoint

**File**: `backend/src/routes/bookingRoutes.js`

**Add**:

```javascript
router.post('/check-availability', async (req, res) => {
  try {
    const { partner_id, booking_date, booking_time, party_size } = req.body;
    const bookingValidation = require('../services/bookingValidation');

    // Get user tier if authenticated
    let user_tier = 'Ather';
    if (req.userId) {
      user_tier = await bookingValidation.getUserTier(req.userId);
    }

    const validation = await bookingValidation.validateBookingRequest({
      partner_id,
      user_id: req.userId,
      booking_date,
      booking_time,
      party_size: party_size || 1,
      user_tier
    });

    return res.json({
      success: true,
      data: {
        canBook: validation.allowed,
        canWaitlist: validation.can_waitlist || false,
        reason: validation.reason,
        message: validation.message,
        waitlistInfo: validation.waitlist_info || null
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});
```

---

## 📋 TESTING CHECKLIST

### Operating Hours Validation
- [ ] Book within hours → ✅ allowed
- [ ] Book before opening → ❌ rejected "BEFORE_OPENING_TIME"
- [ ] Book after closing → ❌ rejected "AFTER_CLOSING_TIME"
- [ ] Book during break period → ❌ rejected "DURING_BREAK_PERIOD"
- [ ] Book on closed day → ❌ rejected "VENUE_CLOSED_ON_DAY"
- [ ] Book on special closure date → ❌ rejected "VENUE_CLOSED_ON_DATE"
- [ ] Partner pauses bookings → ❌ rejected "PARTNER_NOT_ACCEPTING_BOOKINGS"

### Echelon Override
- [ ] Echelon user books when capacity at 100% → ✅ allowed (within 110% buffer)
- [ ] Echelon user books when capacity at 110% → ❌ rejected
- [ ] Echelon user tries booking OUTSIDE hours → ❌ rejected (override doesn't apply)
- [ ] Non-Echelon user books when capacity full → ❌ rejected, waitlist offered

### Database Verification

```sql
-- Check hours seeded
SELECT COUNT(*) FROM partner_hours; -- Should be 49 (7 partners × 7 days)

-- Check tables exist
SELECT tablename FROM pg_tables WHERE tablename LIKE '%waitlist%' OR tablename LIKE '%closure%';

-- Check columns added
SELECT column_name FROM information_schema.columns
WHERE table_name = 'bookings' AND column_name IN ('is_priority_override', 'override_reason');

SELECT column_name FROM information_schema.columns
WHERE table_name = 'partners' AND column_name IN ('accepting_bookings', 'allow_echelon_override');
```

---

## 🎯 NEXT STEPS

1. **Frontend Partner Console UI** - Add Operating Hours tab
2. **Waitlist Service** - Full implementation (backend/src/services/waitlistService.js)
3. **Frontend EventBooking.jsx** - Add hours validation + waitlist UI
4. **Partner Console Availability UI** - Manage slots + waitlist
5. **Auto-notification job** - Notify waitlist users when slots free up

---

## 📝 NOTES

- **Backward Compatibility**: If no hours configured, validation is skipped (allows booking)
- **Default Hours**: All existing partners have 9 AM - 9 PM seeded
- **Echelon Buffer**: Hardcoded 10% but configurable per partner via `echelon_capacity_buffer_percent`
- **Partner Opt-Out**: Partners can set `allow_echelon_override = false` to disable Echelon override
- **"Not Accepting Bookings"**: Toggle at partner level, independent of hours
