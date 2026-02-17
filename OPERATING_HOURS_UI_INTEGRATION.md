# Operating Hours UI - Integration Guide

## ✅ What's Been Created

1. **OperatingHoursManager.jsx** - Complete React component for managing operating hours
2. **operatingHours.css** - Full styling with responsive design

---

## 🔌 Integration into Partner Console

### Step 1: Add to PartnerConsole.jsx Sidebar

**File**: `frontend/src/pages/PartnerConsole.jsx`

**Line 28-42** - Update the nav array to include 'hours':

```javascript
function Sidebar({ active, onNavigate }) {
  const nav = [
    ['dashboard', 'Dashboard'],
    ['profile', 'Profile'],
    ['hours', 'Operating Hours'], // ← ADD THIS LINE
    ['menu', 'Menu Items'],
    ['orders', 'Bookings'],
    ['analytics', 'Analytics'],
    ['offers', 'Offers'],
    ['campaigns', 'Campaigns'],
    ['guests', 'Guests'],
    ['tiers', 'Venue Tiers'],
    ['messages', 'Messages'],
    ['staff', 'Staff Rewards'],
    ['nfc', 'NFC Pucks'],
    ['scanner', 'QR Scanner']
  ];
  ...
}
```

### Step 2: Import the Component

**File**: `frontend/src/pages/PartnerConsole.jsx`

**Top of file** - Add import:

```javascript
import OperatingHoursManager from '../components/OperatingHoursManager';
```

### Step 3: Add Section Rendering

**File**: `frontend/src/pages/PartnerConsole.jsx`

**In the main render function** - Find where sections are conditionally rendered (likely around line 1200-1500, after `{activeSection === 'dashboard' && ...}`). Add:

```javascript
{activeSection === 'hours' && partner && (
  <OperatingHoursManager
    partnerId={partner.id}
    token={token}
  />
)}
```

---

## 🎨 Features Included

### Weekly Hours Tab
- ✅ 7-day week view with checkboxes to enable/disable days
- ✅ Open/close time pickers (24-hour format)
- ✅ Optional break period configuration (e.g., 2 PM - 5 PM siesta)
- ✅ Save button with loading state
- ✅ Auto-formatted time inputs

### Special Closures Tab
- ✅ Add holiday or temporary closures
- ✅ Full-day closure OR modified hours (partial closure)
- ✅ Date picker (prevents past dates)
- ✅ Reason/description field
- ✅ Delete functionality
- ✅ Sorted by upcoming dates

### Global Toggle
- ✅ "Accepting Bookings" ON/OFF switch in header
- ✅ Pause all bookings without changing hours
- ✅ Visual indicator (green = active, orange = paused)
- ✅ Instant API call on toggle

### UX Details
- ✅ Success/error message banners (auto-dismiss after 3 seconds)
- ✅ Loading states for all async operations
- ✅ Disabled states for closed days (grayed out, inputs hidden)
- ✅ Responsive design (mobile-friendly)
- ✅ Smooth animations (slide-in messages, toggle transitions)

---

## 📱 Responsive Design

- **Desktop** (>768px): Full grid layout, side-by-side inputs
- **Mobile** (<768px): Stacked layout, full-width inputs, simplified break period display

---

## 🧪 Testing Checklist

### Weekly Hours
- [ ] Toggle a day on/off → inputs appear/disappear
- [ ] Set hours (e.g., 9 AM - 9 PM) → Click "Save Hours" → Verify success message
- [ ] Reload page → Hours should persist
- [ ] Add break period (e.g., 2 PM - 5 PM) → Save → Verify in database
- [ ] Set invalid break (start > end) → Should still save (validation on backend)

### Special Closures
- [ ] Click "+ Add Closure" → Form appears
- [ ] Add full-day closure (Dec 25, "Christmas") → Verify in list
- [ ] Add partial closure (Dec 24, 10 AM - 6 PM) → Verify displays "Modified Hours"
- [ ] Delete closure → Confirm prompt → Verify removed
- [ ] Try adding past date → Should be blocked by date picker

### Accepting Bookings Toggle
- [ ] Toggle OFF → Verify "Bookings Paused" label + orange color
- [ ] Test booking attempt → Should be rejected "PARTNER_NOT_ACCEPTING_BOOKINGS"
- [ ] Toggle ON → Verify "Accepting Bookings" label + green color
- [ ] Reload page → Toggle state should persist

---

## 🔗 API Endpoints Used

```
Partner-only (require auth token):
GET    /api/v1/partner/me/operating-hours
PUT    /api/v1/partner/me/operating-hours
POST   /api/v1/partner/me/special-closures
GET    /api/v1/partner/me/special-closures
DELETE /api/v1/partner/me/special-closures/:id
POST   /api/v1/partner/me/accepting-bookings
GET    /api/v1/partner/me (to get accepting_bookings status)
```

---

## 🎯 Next Steps (Optional Enhancements)

1. **Copy Hours Feature** - "Copy Monday's hours to all weekdays" button
2. **Recurring Closures** - Mark closures as recurring (e.g., "Closed every Monday")
3. **Capacity per Time Slot** - Advanced view to set different capacities per time slot
4. **Preview Mode** - Show customer-facing view of hours
5. **Import/Export** - Export hours to CSV, import from template
6. **Waitlist Dashboard** - View live waitlist, manually notify guests (already in API!)

---

## 📂 File Structure

```
frontend/
  src/
    components/
      OperatingHoursManager.jsx  ← NEW (600 lines)
    styles/
      operatingHours.css         ← NEW (450 lines)
    pages/
      PartnerConsole.jsx         ← UPDATE (3 changes)
```

---

## 🚀 Quick Start

1. Copy files to frontend directories
2. Add 3 lines to PartnerConsole.jsx (import + sidebar + render)
3. Restart frontend dev server: `npm run dev`
4. Login to Partner Console
5. Click "Operating Hours" in sidebar
6. Set hours → Save → Test booking validation

---

**The Partner Console UI is now complete! Partners can fully manage their operating hours, closures, and booking acceptance. 🎉**
