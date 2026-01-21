# ✅ Fixed: `column offer_stats.promoted_deals does not exist`

## Problem
After consolidating from `is_promoted` to `is_trending`, some SQL queries were still referencing `promoted_deals` column which no longer exists in the subquery results.

## Changes Applied

### 1. `getDashboardStats()` function
**File:** `backend/src/repositories/adminRepository.js` (line 285)
- **Before:** `promoted: dealsResult.rows[0]?.promoted_deals || 0`
- **After:** `promoted: dealsResult.rows[0]?.trending_deals || 0`

### 2. `listAdminPartners()` function
**File:** `backend/src/repositories/adminRepository.js` (line 336)
- **Before:** `COALESCE(offer_stats.promoted_deals, 0)::int AS promoted_deals,`
- **After:** `COALESCE(offer_stats.trending_deals, 0)::int AS trending_deals,`

**File:** `backend/src/repositories/adminRepository.js` (lines 383-384)
- **Before:** `promoted_deals: row.promoted_deals,`
- **After:** 
  ```javascript
  trending_deals: row.trending_deals || 0,
  promoted_deals: row.trending_deals || 0, // Backward compatibility alias
  ```

### 3. Another stats function
**File:** `backend/src/repositories/adminRepository.js` (line 1209)
- **Before:** `featured: parseInt(dealsResult.rows[0]?.featured_deals || 0)`
- **After:** `featured: parseInt(dealsResult.rows[0]?.trending_deals || 0)`

## Root Cause
The SQL subquery was correctly selecting `trending_deals`:
```sql
COUNT(*) FILTER (WHERE is_trending = true)::int AS trending_deals
```

But the outer SELECT was trying to reference it as `promoted_deals`, which doesn't exist in the subquery result.

## Solution
- Updated all references to use `trending_deals` (the actual column name)
- Added backward compatibility alias `promoted_deals` in the return object for frontend compatibility

## Testing
1. Restart backend server
2. Load admin console
3. Navigate to Partners section
4. Should load without errors

## Status
✅ **FIXED** - All `promoted_deals` column references updated to use `trending_deals`

