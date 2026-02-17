# Trending vs Featured: Diagnostic & Recommendations

## Problem Statement
There's confusion and overlap between "Trending" and "Featured" flags, causing inconsistent behavior in the marketplace.

---

## Current State Analysis

### Database Schema

**`partner_offers` table**:
- ✅ `is_trending BOOLEAN DEFAULT false` - Offer-level trending flag
- ❌ NO `is_featured` or `featured` column
- ✅ `featured_request_pending BOOLEAN DEFAULT false` - Partner requests featured status

**`partners` table**:
- ✅ `approved_for_featured BOOLEAN DEFAULT false` - Partner-level featured flag (venue is featured)

### Current Data (Production)
```sql
-- 3 active offers total:
-- 2 with is_trending = true
-- 1 with is_trending = false
-- 0 offers have their own "featured" flag (column doesn't exist!)
```

### Code Logic Issues

#### Issue #1: Frontend creates phantom `featured` field
**File**: `frontend/src/pages/HomePage.jsx`

Lines 357-358, 400-401:
```javascript
is_trending: item.is_trending || item.featured || false,  // ❌ item.featured doesn't exist in DB!
featured: item.featured || item.partner_approved_for_featured || false,
```

**Problem**: The code references `item.featured` which **doesn't exist** in `partner_offers` table. This creates confusion.

#### Issue #2: Trending filter includes non-existent featured flag
**File**: `frontend/src/pages/HomePage.jsx`

Line 102-103:
```javascript
let trending = deals.filter(
  (deal) => deal.is_trending === true || deal.featured === true,
);
```

**Problem**: Filters for `deal.featured` which is constructed from non-existent data.

#### Issue #3: Dual badge display logic is convoluted
Lines 949-951, 1024-1025, 1331-1335:
```javascript
{deal.is_trending && (
  <div className="card-badge trending">Trending</div>
)}
{(deal.featured || deal.partner_approved_for_featured) && (
  <div className="card-badge featured">⭐ Featured</div>
)}
```

**Problem**: `deal.featured` is always falsy (doesn't exist), so featured badge only shows for `partner_approved_for_featured`.

#### Issue #4: Backend doesn't return `featured` at all
**File**: `backend/src/repositories/offerRepository.js`

Lines 544-579 (mapping function):
- ✅ Returns `is_trending`
- ✅ Returns `partner_approved_for_featured` (from partners table)
- ❌ Does NOT return any `featured` field for offers

**Result**: Frontend assumes `item.featured` exists, but it's always `undefined`.

---

## Semantic Confusion

### What SHOULD each flag mean?

| Flag | Level | Meaning | Who Controls | Example |
|------|-------|---------|--------------|---------|
| **`is_trending`** | Offer | High engagement, time-sensitive, popular NOW | Algorithm or Admin | "Valentine's Offer" with 50+ bookings this week |
| **`approved_for_featured`** (partner) | Venue | Premium venue, high quality, trusted brand | Admin approval | Taj Hotel, high-rated restaurant |
| **`is_featured`** (offer) | Offer | Highlighted deal, editorial pick, sponsored | Admin or Algorithm | "Deal of the Day", sponsored placement |

### Current vs Recommended

| Current Behavior | Problem | Recommended |
|------------------|---------|-------------|
| `is_trending` on offers | ✅ Works correctly | Keep, but auto-populate based on metrics |
| `partner.approved_for_featured` | ✅ Works, but name is confusing | Rename to `is_premium_venue` or keep as-is |
| Frontend `deal.featured` | ❌ Doesn't exist in DB, always undefined | Add `is_featured` column to `partner_offers` |
| Trending filter includes `featured` | ❌ Broken logic | Separate "Trending" and "Featured" sections |

---

## Recommended Fix

### Option A: Minimal Fix (Fastest)

**Keep current schema, just fix frontend logic confusion.**

1. **Remove phantom `featured` references**:
```javascript
// Line 357-358, 400-401 - REMOVE featured fallback
is_trending: item.is_trending || false,  // Remove: || item.featured
featured: item.partner_approved_for_featured || false,  // Remove: item.featured ||
```

2. **Fix trending filter**:
```javascript
// Line 102-103
let trending = deals.filter((deal) => deal.is_trending === true);  // Remove: || deal.featured
```

3. **Clarify badge logic**:
```javascript
// Trending badge: shows if offer.is_trending
{deal.is_trending && <div className="card-badge trending">🔥 Trending</div>}

// Premium venue badge: shows if partner.approved_for_featured
{deal.partner_approved_for_featured && <div className="card-badge featured">⭐ Premium</div>}
```

**Result**:
- Trending = high-engagement offers
- Premium badge = high-quality venues
- No confusion, no phantom fields

---

### Option B: Full Semantic Clarity (Recommended)

**Add proper `is_featured` column to offers, separate concerns properly.**

#### 1. Database Migration
```sql
-- Add offer-level featured flag
ALTER TABLE partner_offers ADD COLUMN is_featured BOOLEAN DEFAULT FALSE;

-- Add index for filtering
CREATE INDEX idx_partner_offers_featured ON partner_offers(is_featured)
WHERE is_featured = true;

-- Optionally rename partner column for clarity
-- (or just update documentation)
COMMENT ON COLUMN partners.approved_for_featured IS
  'Premium venue status: high-quality, trusted, admin-approved';
```

#### 2. Backend - Return `is_featured`
**File**: `backend/src/repositories/offerRepository.js`

Line 567 (in mapping):
```javascript
is_trending: row.is_trending,
is_featured: row.is_featured || false,  // NEW
partner_approved_for_featured: row.partner_approved_for_featured,
```

Line 502 (in SELECT):
```sql
po.is_trending,
po.is_featured,  -- NEW
-- ...
p.approved_for_featured AS partner_approved_for_featured
```

#### 3. Frontend - Proper Logic
**File**: `frontend/src/pages/HomePage.jsx`

```javascript
// Line 357-358 - Clean mapping
is_trending: item.is_trending || false,
is_featured: item.is_featured || false,  // Offer-level featured
partner_approved_for_featured: item.partner_approved_for_featured || false,

// Line 102-103 - Trending section shows ONLY trending
let trending = deals.filter((deal) => deal.is_trending === true);

// NEW: Featured section (optional, separate section)
const getFeaturedDeals = (deals) => {
  return deals.filter((deal) => deal.is_featured === true);
};

// Badge display
{deal.is_trending && <div className="card-badge trending">🔥 Trending</div>}
{deal.is_featured && <div className="card-badge featured">⭐ Featured</div>}
{deal.partner_approved_for_featured && <div className="card-badge premium">👑 Premium Venue</div>}
```

#### 4. Admin Console - Featured Toggle
**File**: `frontend/src/pages/AdminDashboard.jsx` or Partner Console

Add toggle for `is_featured` per offer:
```jsx
<label>
  <input
    type="checkbox"
    checked={offer.is_featured}
    onChange={(e) => updateOffer({ is_featured: e.target.checked })}
  />
  Featured (Editor's Pick / Sponsored)
</label>
```

---

## Recommended Badge Hierarchy

### 3-Badge System

1. **🔥 Trending** (offer.is_trending)
   - Color: Red (`#ef4444`)
   - Auto-populated by algorithm
   - Top-left corner
   - Criteria: High bookings in last 7 days, high view-to-book ratio

2. **⭐ Featured** (offer.is_featured)
   - Color: Amber/Gold (`#f59e0b`)
   - Manually set by admin (editorial pick or sponsored)
   - Top-right corner
   - Criteria: Admin discretion, sponsorship deals

3. **👑 Premium Venue** (partner.approved_for_featured)
   - Color: Purple/Violet (`#7c3aed`)
   - Venue-level quality badge
   - Below title or as venue name prefix
   - Criteria: High ratings, trusted partner, admin-approved

### Badge Positioning (CSS)
```css
.card-badge.trending {
  top: 12px;
  left: 12px;
  background: #ef4444;
}

.card-badge.featured {
  top: 12px;
  right: 12px;
  background: #f59e0b;
}

.card-badge.premium {
  /* Option 1: Third corner */
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  background: #7c3aed;

  /* Option 2: Below title (preferred) */
  /* Display as venue badge next to venue name */
}
```

---

## Migration Path

### Phase 1: Fix Immediate Confusion (Today)
- ✅ Remove phantom `item.featured` references in HomePage.jsx
- ✅ Fix trending filter to ONLY use `is_trending`
- ✅ Update badge display to be clear (Trending vs Premium Venue)
- **Impact**: No DB changes, immediate clarity

### Phase 2: Add Proper Featured Column (Next Sprint)
- Add `is_featured` column to `partner_offers`
- Update backend to return `is_featured`
- Add admin UI to toggle featured status
- Update frontend to display featured badge
- **Impact**: Enables true "Featured" deals (editor's picks, sponsored)

### Phase 3: Auto-Trending Algorithm (Future)
- Build algorithm to auto-populate `is_trending` based on:
  - Booking velocity (bookings per day)
  - View-to-book conversion rate
  - Recency (newer offers prioritized)
  - Time-decay (trending fades after 2 weeks)
- **Impact**: Dynamic, real-time trending without manual intervention

---

## Immediate Action Items

1. **Fix HomePage.jsx** (lines 357, 400, 102-103)
   - Remove `item.featured` references (doesn't exist)
   - Remove `deal.featured` from trending filter

2. **Update badge labels**:
   - "Trending" for `is_trending`
   - "Premium Venue" for `partner_approved_for_featured`

3. **Document the semantics**:
   - Add comments in code explaining what each flag means
   - Update partner documentation

4. **Test**:
   - Verify trending section only shows `is_trending = true` offers
   - Verify premium badge only shows for approved partners
   - Verify no console errors about undefined properties

---

## SQL Queries for Debugging

### Check current flag distribution
```sql
-- Offers: trending status
SELECT
  is_trending,
  COUNT(*) as count,
  ARRAY_AGG(title) as offers
FROM partner_offers
WHERE status = 'active' AND end_date > NOW()
GROUP BY is_trending;

-- Partners: featured status
SELECT
  approved_for_featured,
  COUNT(*) as count
FROM partners
WHERE is_active = true AND status IN ('active', 'approved')
GROUP BY approved_for_featured;

-- Combined: offers from featured partners
SELECT
  po.title,
  po.is_trending as offer_trending,
  p.approved_for_featured as venue_featured
FROM partner_offers po
JOIN partners p ON po.partner_id = p.id
WHERE po.status = 'active' AND po.end_date > NOW()
  AND p.is_active = true;
```

### Set featured status (manual fix for testing)
```sql
-- Make an offer trending
UPDATE partner_offers
SET is_trending = true
WHERE title ILIKE '%valentine%';

-- Make a partner featured
UPDATE partners
SET approved_for_featured = true
WHERE name ILIKE '%basant%';
```

---

## Conclusion

**Root Cause**: Frontend references `item.featured` which doesn't exist in database schema, causing phantom logic.

**Immediate Fix**: Remove phantom references, clarify that only `is_trending` (offer) and `partner_approved_for_featured` (venue) exist.

**Long-term Fix**: Add proper `is_featured` column to offers for admin-curated deals, separate from algorithmic trending.

**Recommended Action**: **Option A** (minimal fix) today, **Option B** (full semantic clarity) in next sprint.
