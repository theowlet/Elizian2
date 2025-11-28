# Tier Filter Fix - Super Admin Console

## Issue
The tier filter in the super admin console was showing all users regardless of the selected tier filter.

## Root Cause
The SQL WHERE clause was using:
```sql
u.current_tier_name = $X
```

This doesn't match users with `NULL` values in `current_tier_name`. Since the application defaults NULL to 'Ather' in the SELECT clause (`COALESCE(u.current_tier_name, 'Ather')`), the WHERE clause should also handle NULL values.

## Fix Applied
Changed the tier filter condition to use `COALESCE` to handle NULL values:

```sql
COALESCE(u.current_tier_name, 'Ather') = $X
```

This ensures that:
1. Users with `current_tier_name = NULL` are treated as 'Ather' tier
2. Users with explicit tier names match correctly
3. The filter works consistently with the display logic

## File Modified
- `backend/src/repositories/adminRepository.js` (line 1074)

## Testing
To verify the fix:
1. Open Super Admin Console → Users section
2. Select a tier from the dropdown (e.g., "Nova")
3. Verify only users with that tier are displayed
4. Select "Ather" and verify users with NULL or 'Ather' tier are shown
5. Select "All tiers" and verify all users are shown

## Notes
- Tier names are case-sensitive: Ather, Nova, Luminar, Valiant, Echelon
- Users with NULL `current_tier_name` are treated as 'Ather' tier
- The filter works in combination with other filters (role, status, search)

