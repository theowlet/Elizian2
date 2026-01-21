# Tier System Field Mapping & Compatibility Guide

## Overview

The tier system uses the existing `loyalty_tiers` schema but provides compatibility views and mappings for the proposed field names.

## Field Mapping

### Users Table Fields

| Proposed Field Name | Existing Field Name | Notes |
|---------------------|---------------------|-------|
| `tier` | `current_tier_name` | Use `current_tier_name` in code |
| `tier_annual_spend` | `annual_spend_current` | Use `annual_spend_current` in code |
| `tier_year` | `annual_spend_year` | Use `annual_spend_year` in code |
| `previous_tier` | `previous_tier_name` | Use `previous_tier_name` in code |
| `tier_upgraded_at` | `tier_upgraded_at` | ✅ Same name |

### Table Mapping

| Proposed Table Name | Existing Table Name | Compatibility View |
|---------------------|---------------------|-------------------|
| `tier_benefits` | `loyalty_tiers` | `tier_benefits` (view) |
| `tier_history` | `user_tier_history` | `tier_history` (view) |

## Database Schema

### Existing Tables (Use These)

1. **`loyalty_tiers`** - Tier definitions
   - `tier_name` (VARCHAR) - Tier name (Aether, Nova, Luminar, Valiant, Echelon)
   - `tier_level` (INTEGER) - Tier level (1-5)
   - `min_annual_spend` (DECIMAL) - Minimum spend for tier
   - `max_annual_spend` (DECIMAL) - Maximum spend for tier (NULL for Echelon)
   - `ezt_reward_percentage` (DECIMAL) - EZT reward percentage
   - `benefits` (JSONB) - Tier benefits
   - `badge_color` (VARCHAR) - Badge color
   - `badge_icon` (VARCHAR) - Badge icon

2. **`users`** - User tier tracking
   - `current_tier_id` (UUID) - Reference to `loyalty_tiers.id`
   - `current_tier_name` (VARCHAR) - Tier name (for quick access)
   - `annual_spend_current` (DECIMAL) - Annual spend in current year
   - `annual_spend_year` (INTEGER) - Year for annual spend
   - `lifetime_spend` (DECIMAL) - Total lifetime spend
   - `tier_upgraded_at` (TIMESTAMP) - When tier was last upgraded
   - `previous_tier_name` (VARCHAR) - Previous tier before upgrade

3. **`user_tier_history`** - Tier upgrade history
   - `user_id` (UUID) - User reference
   - `from_tier_name` (VARCHAR) - Previous tier
   - `to_tier_name` (VARCHAR) - New tier
   - `tier_level_change` (INTEGER) - Level change (+1, +2, etc.)
   - `annual_spend_at_change` (DECIMAL) - Spend at time of change
   - `reason` (VARCHAR) - Reason for change
   - `changed_at` (TIMESTAMP) - When change occurred

### Compatibility Views

1. **`user_tier_compat`** - Maps existing fields to proposed field names
   ```sql
   SELECT 
     id,
     current_tier_name AS tier,
     annual_spend_current AS tier_annual_spend,
     annual_spend_year AS tier_year,
     tier_upgraded_at,
     previous_tier_name AS previous_tier
   FROM users;
   ```

2. **`tier_benefits`** - Maps `loyalty_tiers` to proposed `tier_benefits` structure
   ```sql
   SELECT 
     tier_name AS tier,
     min_annual_spend AS min_spend,
     max_annual_spend AS max_spend,
     ezt_reward_percentage,
     -- Computed fields
     CASE WHEN tier_level >= 3 THEN true ELSE false END AS priority_support,
     CASE WHEN tier_level >= 3 THEN true ELSE false END AS exclusive_deals,
     CASE WHEN tier_level >= 4 THEN true ELSE false END AS early_access,
     -- Free cancellations based on tier
     CASE 
       WHEN tier_name = 'Nova' THEN 1
       WHEN tier_name = 'Luminar' THEN 2
       WHEN tier_name = 'Valiant' THEN 5
       WHEN tier_name = 'Echelon' THEN 10
       ELSE 0
     END AS free_cancellations,
     tier_level AS tier_order
   FROM loyalty_tiers;
   ```

3. **`tier_history`** - Maps `user_tier_history` to proposed `tier_history` structure
   ```sql
   SELECT 
     id,
     user_id,
     from_tier_name AS previous_tier,
     to_tier_name AS new_tier,
     annual_spend_at_change AS annual_spend,
     EXTRACT(YEAR FROM changed_at)::INT AS year,
     changed_at AS upgraded_at
   FROM user_tier_history;
   ```

## Code Usage

### ✅ CORRECT: Use Existing Field Names

```javascript
// Get user tier info
const result = await pool.query(
  `SELECT 
     current_tier_name,
     annual_spend_current,
     annual_spend_year,
     previous_tier_name,
     tier_upgraded_at
   FROM users 
   WHERE id = $1`,
  [userId]
);

// Update tier
await pool.query(
  `UPDATE users 
   SET current_tier_name = $1,
       annual_spend_current = $2,
       annual_spend_year = $3
   WHERE id = $4`,
  [tierName, annualSpend, year, userId]
);
```

### ✅ CORRECT: Use Compatibility View (if needed)

```javascript
// If you need the proposed field names, use the view
const result = await pool.query(
  `SELECT 
     tier,
     tier_annual_spend,
     tier_year,
     previous_tier
   FROM user_tier_compat 
   WHERE id = $1`,
  [userId]
);
```

### ❌ INCORRECT: Don't Use Proposed Field Names Directly

```javascript
// DON'T DO THIS - these columns don't exist
const result = await pool.query(
  `SELECT tier, tier_annual_spend FROM users WHERE id = $1`,
  [userId]
);
```

## Migration Steps

1. **Run the compatibility migration:**
   ```bash
   psql -d elizian -f backend/db/20250108_tier_system_compatibility.sql
   ```

2. **Verify the views exist:**
   ```sql
   SELECT * FROM user_tier_compat LIMIT 1;
   SELECT * FROM tier_benefits;
   SELECT * FROM tier_history LIMIT 1;
   ```

3. **Update existing code** to use `current_tier_name`, `annual_spend_current`, etc.

## Backward Compatibility

- ✅ Existing code using `current_tier_name`, `annual_spend_current` will continue to work
- ✅ New code can use compatibility views if needed
- ✅ All tier data is stored in the existing schema
- ✅ No data loss during migration

## Tier Configuration

The tier system uses the following tiers (stored in `loyalty_tiers`):

| Tier | Level | Min Spend | Max Spend | EZT % | Free Cancellations |
|------|-------|-----------|-----------|-------|-------------------|
| Aether | 1 | ₹0 | ₹9,999.99 | 1% | 0 |
| Nova | 2 | ₹10,000 | ₹49,999.99 | 2% | 1 |
| Luminar | 3 | ₹50,000 | ₹149,999.99 | 3% | 2 |
| Valiant | 4 | ₹150,000 | ₹499,999.99 | 4% | 5 |
| Echelon | 5 | ₹500,000 | NULL | 5% | 10 |

## EZT Calculation

- **EZT Value**: 1 EZT = ₹100
- **Calculation**: `(amount_spent * tier_percentage / 100) / 100`
- **Example**: ₹10,000 spent at Nova tier (2%) = ₹200 reward = 2 EZT tokens

## Notes

- The trigger `trigger_sync_tier_fields` automatically updates `current_tier_id` when `current_tier_name` changes
- Annual spend resets automatically when `annual_spend_year` changes
- Tier upgrades are logged in `user_tier_history` automatically
- Use the existing `tierRepository` and `tierService` functions - they already use the correct field names

