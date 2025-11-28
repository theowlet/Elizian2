# Partner Eligibility Criteria for Trending Deals

## Overview
A partner must meet specific criteria before their deals can be marked as "trending" (featured/promoted). This is controlled by the `approved_for_featured` flag on the `partners` table.

## Primary Criteria

### 1. **Partner Must Be Approved for Featured Content**
   - **Database Field:** `partners.approved_for_featured` (BOOLEAN)
   - **Default Value:** `false` (new partners are NOT eligible by default)
   - **Required:** `true` for deals to be marked as trending

### 2. **Partner Status Requirements**
   - Partner status must be `'active'` OR `'approved'`
   - Partner `is_active` flag must be `true`

### 3. **Deal Status Requirements**
   - Deal must have `status = 'active'`
   - Deal must not be expired (`end_date >= NOW()`)
   - Deal must have valid start and end dates

## How Eligibility Works

### Automatic Check
When attempting to mark a deal as trending:
1. System checks `partners.approved_for_featured`
2. If `false` → Deal cannot be marked as trending (unless admin forces it)
3. If `true` → Deal can be marked as trending (if other criteria are met)

### Admin Override
- **Super Admins can override** eligibility by sending `force: true` in the request
- When forced, the system sets `forced_by_admin = true` on the deal
- This is logged in the audit trail for compliance

## Code Implementation

### Eligibility Check (from `adminRepository.js`)
```javascript
// Check eligibility: partner must be approved OR admin has forced it
if (isTrendingDeal && !row.approved_for_featured && !row.forced_by_admin) {
  reasons.push('Partner is not approved for featured/trending content. Partner must be approved for featured content or admin must force the promotion.');
}
```

### Update Logic (from `adminRepository.js`)
```javascript
const partnerEligible = !!offer.approved_for_featured;

if (setTrending) {
  if (offer.status !== OFFER_STATUS.ACTIVE || (offer.end_date && new Date(offer.end_date) < now)) {
    throw new Error('Cannot promote an inactive or expired deal');
  }
  if (!partnerEligible && !forced_by_admin) {
    throw new Error('Partner is not eligible for promotion');
  }
}
```

## How to Approve a Partner for Featured Content

### Via Admin Console
1. Navigate to **Partners** section
2. Select a partner
3. Use the **"Toggle Featured Eligibility"** action
4. Set `approved_for_featured = true`

### Via API
```http
PUT /api/v1/admin/partners/:id/featured-eligibility
Content-Type: application/json

{
  "approved_for_featured": true,
  "reason": "Partner has met quality standards"
}
```

### Direct Database Update
```sql
UPDATE partners 
SET approved_for_featured = true 
WHERE id = '<partner-id>';
```

## Complete Eligibility Checklist

For a deal to be marked as trending, ALL of the following must be true:

✅ **Partner Requirements:**
- [ ] `partners.approved_for_featured = true` (OR admin uses `force: true`)
- [ ] `partners.status IN ('active', 'approved')`
- [ ] `partners.is_active = true`

✅ **Deal Requirements:**
- [ ] `partner_offers.status = 'active'`
- [ ] `partner_offers.end_date >= NOW()` (not expired)
- [ ] `partner_offers.start_date` and `partner_offers.end_date` are set
- [ ] `partner_offers.start_date < partner_offers.end_date`

## Workflow

### Normal Flow (Partner Eligible)
1. Partner has `approved_for_featured = true`
2. Admin marks deal as trending
3. System checks deal status (must be active, not expired)
4. Deal is marked as trending ✅

### Override Flow (Partner Not Eligible)
1. Partner has `approved_for_featured = false`
2. Admin marks deal as trending with `force: true`
3. System sets `forced_by_admin = true` on the deal
4. Deal is marked as trending ✅ (with override flag)

### Rejection Flow
1. Partner has `approved_for_featured = false`
2. Admin attempts to mark deal as trending (without `force: true`)
3. System returns error: `"Partner is not eligible for trending. Use force=true to override."`
4. Deal is NOT marked as trending ❌

## Database Schema

### `partners` Table
```sql
approved_for_featured BOOLEAN DEFAULT false
```

### `partner_offers` Table
```sql
is_trending BOOLEAN DEFAULT false
forced_by_admin BOOLEAN DEFAULT false
featured_request_pending BOOLEAN DEFAULT false
```

## Best Practices

1. **Review Partners Before Approval:**
   - Check partner quality, reviews, compliance
   - Verify business credentials
   - Review past performance

2. **Use Force Sparingly:**
   - Only use `force: true` for exceptional cases
   - Document the reason in audit logs
   - Review forced promotions periodically

3. **Monitor Trending Deals:**
   - Track which partners have trending deals
   - Ensure quality standards are maintained
   - Revoke eligibility if standards drop

## Related API Endpoints

- `PUT /api/v1/admin/partners/:id/featured-eligibility` - Approve/revoke partner eligibility
- `PUT /api/v1/admin/offers/:offerId/feature` - Mark deal as trending (requires eligibility or force)
- `GET /api/v1/admin/partners` - List partners (includes `approved_for_featured` status)

## Summary

**The single most important criterion is:**
> **`partners.approved_for_featured` must be `true`**

Without this flag set to `true`, deals from that partner cannot be marked as trending unless a super admin explicitly forces it using `force: true`.

