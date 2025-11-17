# Menu Items vs Offers/Discounts: Architecture & Relationship

## Current State

### Menu Items (`menu_items` table)
- **Purpose**: Core service/product catalog
- **Contains**: Restaurant dishes, spa treatments, events, healthcare services, etc.
- **Fields**: `name`, `description`, `price`, `service_type`, `image_url`, `is_available`, etc.
- **Service Types**: `dining`, `events`, `spa-and-salon`, `wellness`, `healthcare`, `travel`, `others`
- **Special Behavior**: Event-type menu items automatically sync to `events` table for frontend carousel

### Offers/Discounts (`partner_offers` table)
- **Purpose**: Promotional deals and discounts
- **Contains**: Discount campaigns, promotional offers, time-bound deals
- **Fields**: `title`, `description`, `original_price`, `discounted_price`, `discount_percentage`, `start_date`, `end_date`, `promo_code`, `max_redemptions`, etc.
- **Currently**: Standalone system with no direct link to menu items

## Problem: No Relationship

Currently, **Menu Items** and **Offers** are completely separate:
- ❌ Offers cannot reference specific menu items
- ❌ Menu items don't know if they're part of an offer
- ❌ Partners must create offers separately from menu items
- ❌ No way to apply discounts to existing menu items

## Recommended Architecture

### Option 1: Offers Reference Menu Items (Recommended)

**Concept**: Offers can apply discounts to specific menu items or be standalone promotions.

```
Menu Items (Catalog)
    ↓
Offers (Promotions)
    ├─→ Can reference specific menu_items
    ├─→ Can be standalone (general discounts)
    └─→ Can apply to categories/service_types
```

**Database Schema Changes**:
```sql
-- Add to partner_offers table
ALTER TABLE partner_offers
ADD COLUMN IF NOT EXISTS menu_item_id UUID REFERENCES menu_items(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS applicable_menu_items UUID[], -- Array of menu item IDs
ADD COLUMN IF NOT EXISTS applicable_service_types TEXT[], -- e.g., ['dining', 'spa-and-salon']
ADD COLUMN IF NOT EXISTS discount_applies_to VARCHAR(50) DEFAULT 'standalone' 
    CHECK (discount_applies_to IN ('standalone', 'menu_item', 'menu_items', 'category', 'service_type'));
```

**Use Cases**:
1. **Menu Item Offer**: "20% off on Butter Chicken" → References specific `menu_item_id`
2. **Category Offer**: "15% off on all Spa services" → Uses `applicable_service_types = ['spa-and-salon']`
3. **Multiple Items**: "Buy 2 Get 1 Free on Appetizers" → Uses `applicable_menu_items = [id1, id2, id3]`
4. **Standalone**: "₹500 off on orders above ₹2000" → No menu item reference

### Option 2: Menu Items Have Offer References

**Concept**: Menu items can have active offers attached.

```sql
-- Add to menu_items table
ALTER TABLE menu_items
ADD COLUMN IF NOT EXISTS active_offer_id UUID REFERENCES partner_offers(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS discounted_price DECIMAL(10,2); -- Calculated from offer
```

**Use Cases**:
- Menu item shows: "Original: ₹500, Now: ₹400 (20% off)" when offer is active
- Frontend automatically displays discounted price when offer exists

### Option 3: Hybrid Approach (Best for Flexibility)

**Combine both approaches**:
- Offers can reference menu items (Option 1)
- Menu items can show active offers (Option 2)
- Supports both directions

## Recommended Implementation

### Phase 1: Add Offer-to-Menu-Item Relationship

1. **Add foreign key to `partner_offers`**:
```sql
ALTER TABLE partner_offers
ADD COLUMN IF NOT EXISTS menu_item_id UUID REFERENCES menu_items(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS applicable_menu_items UUID[],
ADD COLUMN IF NOT EXISTS applicable_service_types TEXT[],
ADD COLUMN IF NOT EXISTS discount_applies_to VARCHAR(50) DEFAULT 'standalone';
```

2. **Update Partner Console**:
   - When creating an offer, allow selecting:
     - "Standalone Offer" (no menu item)
     - "Apply to Specific Menu Item" (dropdown of menu items)
     - "Apply to Service Type" (dropdown: dining, spa, etc.)
     - "Apply to Multiple Menu Items" (multi-select)

3. **Update Frontend Display**:
   - Menu items show discounted price if offer exists
   - Offers show which menu items they apply to
   - Offers page can filter by service type

### Phase 2: Auto-Calculate Discounted Prices

When an offer is created/updated:
- If `menu_item_id` is set, calculate `discounted_price` from menu item's `price`
- Update menu item's display to show both original and discounted prices

### Phase 3: Offer Management from Menu Items

- In Menu Items table, show "Create Offer" button
- Pre-fill offer form with menu item details
- Link offer back to menu item automatically

## Example Workflows

### Workflow 1: Create Offer for Existing Menu Item
1. Partner goes to "Menu Items" tab
2. Clicks "Create Offer" on a menu item (e.g., "Butter Chicken")
3. Form pre-fills: `menu_item_id`, `original_price` from menu item
4. Partner enters: `discount_percentage = 20`, `start_date`, `end_date`
5. System calculates: `discounted_price = original_price * 0.8`
6. Offer is created and linked to menu item
7. Frontend shows: "Butter Chicken: ₹400 (was ₹500, 20% off)"

### Workflow 2: Create Standalone Promotional Offer
1. Partner goes to "Offers" tab
2. Clicks "Create New Offer"
3. Selects "Standalone Offer" (no menu item)
4. Enters: "₹500 off on orders above ₹2000"
5. Sets `discount_applies_to = 'standalone'`
6. Offer appears in general offers list

### Workflow 3: Category-Wide Discount
1. Partner creates offer: "15% off all Spa services"
2. Sets `discount_applies_to = 'service_type'`
3. Sets `applicable_service_types = ['spa-and-salon']`
4. All spa menu items show discounted price during offer period

## API Changes Needed

### Create Offer Endpoint
```javascript
POST /api/v1/partners/:partnerId/offers
{
  "title": "20% off Butter Chicken",
  "menu_item_id": "uuid-here", // NEW: Link to menu item
  "discount_percentage": 20,
  "start_date": "2025-11-01",
  "end_date": "2025-11-30",
  "discount_applies_to": "menu_item" // NEW
}
```

### Get Menu Items with Offers
```javascript
GET /api/v1/partners/:partnerId/menu
// Response includes:
{
  "id": "...",
  "name": "Butter Chicken",
  "price": 500,
  "active_offer": {
    "id": "...",
    "discount_percentage": 20,
    "discounted_price": 400,
    "valid_until": "2025-11-30"
  }
}
```

## Benefits

1. **Unified Experience**: Partners can create offers directly from menu items
2. **Automatic Pricing**: Discounted prices calculated automatically
3. **Better UX**: Users see original vs discounted prices clearly
4. **Flexibility**: Supports both item-specific and general offers
5. **Analytics**: Track which menu items have most offers/redemptions

## Migration Path

1. **Step 1**: Add new columns to `partner_offers` (nullable, backward compatible)
2. **Step 2**: Update Partner Console UI to support menu item selection
3. **Step 3**: Update API endpoints to handle new fields
4. **Step 4**: Update frontend to display linked offers
5. **Step 5**: Migrate existing offers (if any should be linked)

## Questions to Consider

1. **Can one menu item have multiple active offers?** (Recommended: No, only one active offer per item)
2. **Can offers apply to multiple menu items?** (Recommended: Yes, via `applicable_menu_items` array)
3. **What happens when menu item price changes?** (Recommended: Recalculate `discounted_price` if offer is active)
4. **Should expired offers be archived?** (Recommended: Yes, keep for analytics)

