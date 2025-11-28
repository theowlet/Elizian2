# How Users Move Across Tiers - Complete Flow

## Overview

Users progress through loyalty tiers based on their **annual spending** (not lifetime spending). The system automatically checks for tier upgrades after every booking and promotes users when they reach the next tier's spending threshold.

## Tier Structure

The system uses the `loyalty_tiers` table with the following structure:
- **tier_level**: Numeric level (1, 2, 3, 4, 5...)
- **tier_name**: Name of the tier (e.g., "Aether", "Nova", "Luminar", "Valiant", "Echelon")
- **min_annual_spend**: Minimum annual spending required to qualify for this tier
- **max_annual_spend**: Maximum annual spending for this tier (NULL for highest tier)
- **ezt_reward_percentage**: EZT earning percentage for this tier (1%, 2%, 3%, etc.)

## Complete Tier Progression Flow

### Step 1: User Makes a Booking

**Location**: `backend/src/services/bookingService.js` → `createBooking()`

When a user completes a booking:
1. Booking is created with `fiat_amount` (actual amount paid)
2. `tierService.processBookingWithTier()` is called with the booking amount

### Step 2: Annual Spend is Updated

**Location**: `backend/src/repositories/tierRepository.js` → `addToAnnualSpend()`

```javascript
// Updates user's annual spending
UPDATE users 
SET 
  annual_spend_current = CASE 
    WHEN annual_spend_year = $2 THEN annual_spend_current + $3
    ELSE $3  // Reset if new year
  END,
  annual_spend_year = $2,
  lifetime_spend = lifetime_spend + $3
WHERE id = $1
```

**Key Points**:
- `annual_spend_current`: Running total for the current calendar year
- `annual_spend_year`: The year this spend is for (resets each January 1st)
- `lifetime_spend`: Total spending across all time (never resets)

### Step 3: Tier Eligibility Check

**Location**: `backend/src/repositories/tierRepository.js` → `getTierBySpendAmount()`

After updating annual spend, the system checks which tier the user qualifies for:

```sql
SELECT * FROM loyalty_tiers 
WHERE min_annual_spend <= $1 
  AND (max_annual_spend >= $1 OR max_annual_spend IS NULL)
ORDER BY tier_level DESC
LIMIT 1
```

This query finds the **highest tier** the user qualifies for based on their current annual spend.

### Step 4: Tier Upgrade (if applicable)

**Location**: `backend/src/repositories/tierRepository.js` → `updateUserTier()`

If the user's new annual spend qualifies them for a higher tier:

```javascript
if (appropriateTier && appropriateTier.tier_name !== user.current_tier_name) {
  await updateUserTier(userId, appropriateTier.tier_name, newAnnualSpend, client);
  // Returns: { tierUpgraded: true, oldTier, newTier, annualSpend }
}
```

**What happens during upgrade**:
1. User's `current_tier_name` is updated
2. User's `current_tier_id` is updated (foreign key to `loyalty_tiers`)
3. Previous tier is saved to `previous_tier_name`
4. `tier_upgraded_at` timestamp is set
5. **Tier history is recorded** in `user_tier_history` table:
   - `from_tier_name`
   - `to_tier_name`
   - `tier_level_change` (e.g., +1 for upgrade, -1 for downgrade)
   - `annual_spend_at_change`
   - `reason`: "Annual spend threshold reached"

### Step 5: EZT Reward Calculation

**Location**: `backend/src/repositories/tierRepository.js` → `calculateEZTReward()`

The EZT reward is calculated based on the **tier at the time of booking**:

```javascript
const percentage = tierInfo.ezt_reward_percentage; // e.g., 2% for Nova
const eztValue = 100; // 1 EZT = ₹100
const eztAmount = (cashAmount * percentage / 100) / eztValue;
```

**Example**:
- User in Nova tier (2%) books ₹1,000
- EZT earned = (1000 × 2 / 100) / 100 = 0.2 EZT

**Important**: If a user upgrades during booking, the EZT is still calculated based on their **previous tier** (the tier they had when the booking was made).

## Tier Progression Examples

### Example 1: User Upgrades from Aether to Nova

**Initial State**:
- Current Tier: Aether (1% EZT, min_spend: ₹0)
- Annual Spend: ₹9,500

**Booking**:
- User books ₹600 worth of services
- New Annual Spend: ₹10,100

**Tier Check**:
- System checks: `min_annual_spend <= 10100`
- Finds: Nova tier (min_spend: ₹10,000)
- **Upgrade Triggered**: Aether → Nova

**Result**:
- User tier updated to "Nova"
- EZT earned calculated at **Aether rate (1%)** = 0.006 EZT
- Next booking will earn at **Nova rate (2%)**
- Tier history entry created

### Example 2: User Stays in Same Tier

**Initial State**:
- Current Tier: Nova (2% EZT)
- Annual Spend: ₹15,000

**Booking**:
- User books ₹5,000 worth of services
- New Annual Spend: ₹20,000

**Tier Check**:
- System checks: `min_annual_spend <= 20000`
- Finds: Nova tier (min_spend: ₹10,000, max_spend: ₹25,000)
- **No Upgrade**: Still in Nova tier

**Result**:
- User stays in Nova tier
- EZT earned at Nova rate (2%) = 1.0 EZT
- No tier history entry

### Example 3: User Skips a Tier

**Initial State**:
- Current Tier: Aether (1% EZT)
- Annual Spend: ₹8,000

**Large Booking**:
- User books ₹20,000 worth of services
- New Annual Spend: ₹28,000

**Tier Check**:
- System checks: `min_annual_spend <= 28000`
- Finds: Luminar tier (min_spend: ₹25,000)
- **Upgrade Triggered**: Aether → Luminar (skips Nova)

**Result**:
- User tier updated directly to "Luminar"
- EZT earned calculated at **Aether rate (1%)** = 2.0 EZT
- Next booking will earn at **Luminar rate (3%)**
- Tier history entry: Aether → Luminar

## Annual Reset

**Location**: `backend/src/repositories/tierRepository.js` → `resetAnnualSpendForNewYear()`

At the start of each calendar year (January 1st), the system resets:

```sql
UPDATE users 
SET 
  annual_spend_current = 0,
  annual_spend_year = $1,  -- New year
  current_tier_name = 'Aether',  -- Reset to base tier
  current_tier_id = (SELECT id FROM loyalty_tiers WHERE tier_name = 'Aether')
WHERE annual_spend_year < $1
```

**Important**: 
- Annual spend resets to 0
- **Tier resets to Aether** (base tier)
- Lifetime spend is **NOT reset** (continues accumulating)
- Users must re-qualify for higher tiers each year

## Manual Tier Adjustments (Admin)

**Location**: `backend/src/services/tierService.js` → `adminAdjustUserTier()`

Admins can manually change a user's tier:
- Useful for promotions, corrections, or special cases
- Creates a tier history entry with reason: "Manual adjustment by admin: {reason}"
- Does not affect annual spend calculations

## Tier Progression Visualization

```
┌─────────────────────────────────────────────────────────────┐
│                    TIER PROGRESSION FLOW                    │
└─────────────────────────────────────────────────────────────┘

User Makes Booking
       │
       ▼
Update Annual Spend (annual_spend_current += booking_amount)
       │
       ▼
Check Tier Eligibility (getTierBySpendAmount)
       │
       ├─── Annual Spend >= Next Tier Threshold?
       │    │
       │    ├─── YES ──► Upgrade Tier
       │    │              │
       │    │              ├──► Update current_tier_name
       │    │              ├──► Update current_tier_id
       │    │              ├──► Save previous_tier_name
       │    │              ├──► Set tier_upgraded_at
       │    │              └──► Record in user_tier_history
       │    │
       │    └─── NO ───► Stay in Current Tier
       │
       ▼
Calculate EZT Reward (based on tier AT TIME OF BOOKING)
       │
       ▼
Award EZT Tokens to User
       │
       ▼
Return Booking Result with Tier Info
```

## Key Database Tables

### `users` Table (Tier Fields)
- `current_tier_name`: Current tier name (e.g., "Nova")
- `current_tier_id`: Foreign key to `loyalty_tiers.id`
- `previous_tier_name`: Previous tier before last upgrade
- `annual_spend_current`: Total spending in current calendar year
- `annual_spend_year`: The year this spend is for
- `lifetime_spend`: Total spending across all time
- `tier_upgraded_at`: Timestamp of last tier upgrade

### `loyalty_tiers` Table
- `id`: Primary key
- `tier_name`: Tier name (e.g., "Aether", "Nova")
- `tier_level`: Numeric level (1, 2, 3...)
- `min_annual_spend`: Minimum annual spend to qualify
- `max_annual_spend`: Maximum annual spend (NULL for highest tier)
- `ezt_reward_percentage`: EZT earning percentage

### `user_tier_history` Table
- `user_id`: Foreign key to users
- `from_tier_name`: Previous tier
- `to_tier_name`: New tier
- `tier_level_change`: Change in tier level (+1, -1, etc.)
- `annual_spend_at_change`: Annual spend when tier changed
- `reason`: Reason for tier change
- `changed_at`: Timestamp of change

## Important Notes

1. **Tier is checked AFTER every booking** - not on a schedule
2. **EZT is calculated based on tier at booking time** - not after upgrade
3. **Annual spend resets each January 1st** - users start fresh each year
4. **Tier can skip levels** - if spend jumps significantly
5. **Tier downgrades are possible** - if annual spend resets (new year) or admin adjustment
6. **Lifetime spend never resets** - but doesn't affect tier progression

## API Endpoints

- `GET /api/v1/tiers` - Get all tiers
- `GET /api/v1/tiers/user/:userId` - Get user's tier info
- `GET /api/v1/rewards/tier/history` - Get user's tier upgrade history
- `POST /api/v1/admin/tiers/user/:userId/adjust` - Admin manual tier adjustment

