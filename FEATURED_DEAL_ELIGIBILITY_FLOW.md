# Featured Deal Eligibility Flow

## Overview
Partners must be **approved by Super Admin** before they can feature their deals. This prevents unauthorized partners from promoting deals.

---

## 1. Database Structure

### Partners Table
```sql
ALTER TABLE partners
ADD COLUMN approved_for_featured BOOLEAN DEFAULT false;
```

- **Field**: `approved_for_featured` (BOOLEAN)
- **Default**: `false` (not eligible by default)
- **Set by**: Super Admin only
- **Purpose**: Controls whether a partner can feature deals without admin approval

---

## 2. How Eligibility is Set

### Super Admin Sets Eligibility
**Endpoint**: `PUT /api/v1/admin/partners/:id/featured-eligibility`

**Location**: `backend/server.js` lines 234-255

```javascript
app.put('/api/v1/admin/partners/:id/featured-eligibility', authenticateToken, requireSuperAdmin, async (req, res) => {
  const { approved_for_featured, reason } = req.body;
  
  // Update partner eligibility
  await pool.query('UPDATE partners SET approved_for_featured = $1 WHERE id = $2', 
    [!!approved_for_featured, id]);
  
  // Log to audit trail
  await writeAudit(req.userId, 'super_admin', 'partner_feature_eligibility', 'partner', id, {
    previous: before.rows[0],
    next: { approved_for_featured: !!approved_for_featured },
    reason: reason || null
  });
});
```

**UI Location**: `frontend/public/admin.html` - Partners Management tab
- Toggle switch for each partner
- Shows current eligibility status
- Logs action to audit trail

---

## 3. How Eligibility is Checked

### A. When Partner Tries to Promote a Deal

**Endpoint**: `PUT /api/v1/partners/:partnerId/offers/:offerId`

**Location**: `backend/server.js` lines 323-360

```javascript
// Check partner eligibility
const partner = await pool.query(
  'SELECT approved_for_featured FROM partners WHERE id = $1', 
  [partnerId]
);

const wantsPromoted = !!is_promoted;

if (wantsPromoted && partner.rows[0].approved_for_featured !== true) {
  // ❌ NOT ELIGIBLE: Mark as pending approval
  await pool.query(
    `UPDATE partner_offers
     SET featured_request_pending = true,
         updated_at = NOW()
     WHERE id = $1`,
    [offerId]
  );
  return res.status(202).json({ 
    success: true, 
    pendingApproval: true 
  });
}

// ✅ ELIGIBLE: Toggle is_promoted directly
await pool.query(
  `UPDATE partner_offers
   SET is_promoted = $1,
       featured_request_pending = false,
       updated_at = NOW()
   WHERE id = $2`,
  [wantsPromoted, offerId]
);
```

**Flow**:
1. Partner clicks "⭐ Promote" in Partner Console
2. Backend checks `partners.approved_for_featured`
3. **If `false`**: Deal marked as `featured_request_pending = true` → Goes to admin queue
4. **If `true`**: Deal immediately set to `is_promoted = true` → Featured instantly

---

### B. When Admin Approves a Featured Deal

**Endpoint**: `PUT /api/v1/admin/offers/:offerId/feature`

**Location**: `backend/server.js` lines 260-318

```javascript
// Get offer with partner info
const offerResult = await pool.query(
  `SELECT po.is_promoted, po.featured_request_pending, po.forced_by_admin, 
          po.partner_id, p.approved_for_featured, p.name as partner_name
   FROM partner_offers po
   JOIN partners p ON po.partner_id = p.id
   WHERE po.id = $1`,
  [offerId]
);

const offer = offerResult.rows[0];

// If promoting, check partner eligibility
if (setPromoted && !offer.approved_for_featured && !offer.forced_by_admin) {
  // ⚠️ WARNING: Admin promoting for ineligible partner
  log(`⚠️ Admin promoting deal for ineligible partner: ${offer.partner_name}`);
}

// Admin can still force it (super admin privilege)
await pool.query(
  `UPDATE partner_offers
   SET is_promoted = $1,
       featured_request_pending = false,
       forced_by_admin = $2,
       updated_at = NOW()
   WHERE id = $3`,
  [setPromoted, setPromoted, offerId]
);
```

**Flow**:
1. Admin clicks "✅ Approve" in Admin Console
2. Backend checks `partners.approved_for_featured`
3. **If `false`**: Logs warning but still allows (admin override)
4. Sets `forced_by_admin = true` to indicate admin override
5. Logs to audit trail with `partner_eligible: false`

---

## 4. How Eligibility is Displayed

### A. In Admin Console - Partners Tab

**Location**: `frontend/public/admin.html` lines 1050-1090

```javascript
// Shows eligibility status
<p><strong>Featured Eligibility:</strong> 
  <span class="badge ${partner.approved_for_featured ? 'success' : 'danger'}">
    ${partner.approved_for_featured ? '✅ Approved' : '❌ Not Approved'}
  </span>
</p>

// Toggle button
<button onclick="togglePartnerEligibility('${partner.id}', ${!partner.approved_for_featured})">
  ${partner.approved_for_featured ? 'Revoke Eligibility' : 'Grant Eligibility'}
</button>
```

### B. In Admin Console - Featured Requests

**Location**: `frontend/public/admin.html` lines 964-967

```javascript
// Shows different button based on eligibility
${offer.partner_eligible !== false ? 
  `<button onclick="approveFeaturedRequest(...)" style="background: #4CAF50;">
     ✅ Approve
   </button>` :
  `<button onclick="approveFeaturedRequest(...)" style="background: #ff9800;" 
            title="Partner not eligible - Admin override">
     ⚠️ Approve (Override)
   </button>`
}
```

### C. In Offers API Response

**Location**: `backend/server.js` line 2173

```javascript
SELECT 
  po.*,
  p.approved_for_featured as partner_eligible,  // ← Included in response
  ...
FROM partner_offers po
JOIN partners p ON po.partner_id = p.id
```

---

## 5. Featured Deals Filtering

**Location**: `backend/server.js` lines 2272-2276

When fetching featured deals (`?promoted=true`):

```javascript
if (promoted === 'true') {
  offersQuery += ` AND po.is_promoted = true 
    AND (p.approved_for_featured = true OR po.forced_by_admin = true)`;
  // Only show featured deals from:
  // 1. Eligible partners (approved_for_featured = true)
  // 2. OR admin-forced deals (forced_by_admin = true)
  
  // Exclude pending requests
  offersQuery += ` AND (po.featured_request_pending = false 
                     OR po.featured_request_pending IS NULL)`;
}
```

**Result**: Only shows deals that are:
- ✅ From eligible partners, OR
- ✅ Admin-forced (override)
- ❌ NOT pending approval

---

## 6. Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    PARTNER TRIES TO PROMOTE                  │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
        ┌──────────────────────────────────┐
        │  Check: approved_for_featured?    │
        └──────────────────────────────────┘
                   │              │
        ┌──────────┘              └──────────┐
        │                                    │
   YES (true)                          NO (false)
        │                                    │
        ▼                                    ▼
┌───────────────┐              ┌──────────────────────┐
│ Feature       │              │ Mark as PENDING      │
│ Immediately   │              │ featured_request_    │
│ is_promoted=  │              │ pending = true       │
│ true          │              └──────────────────────┘
└───────────────┘                         │
                                           ▼
                              ┌────────────────────────┐
                              │  Admin Reviews Queue   │
                              └────────────────────────┘
                                           │
                                           ▼
                              ┌────────────────────────┐
                              │  Admin Approves/       │
                              │  Rejects Request       │
                              └────────────────────────┘
                                           │
                                           ▼
                              ┌────────────────────────┐
                              │  If Approved:           │
                              │  - is_promoted = true  │
                              │  - forced_by_admin =   │
                              │    true (if ineligible)│
                              │  - Log to audit        │
                              └────────────────────────┘
```

---

## 7. Key Points

1. **Default State**: All partners start with `approved_for_featured = false`
2. **Super Admin Control**: Only super admin can grant/revoke eligibility
3. **Partner Experience**: 
   - Eligible partners: Instant featuring
   - Ineligible partners: Request goes to admin queue
4. **Admin Override**: Super admin can still feature deals from ineligible partners (with warning)
5. **Audit Trail**: All eligibility changes and feature approvals are logged
6. **UI Indicators**: Clear visual indicators show eligibility status and override warnings

---

## 8. Related Files

- **Backend**: `backend/server.js` (lines 232-360)
- **Frontend Admin**: `frontend/public/admin.html` (Partners & Deals tabs)
- **Database Migration**: `backend/db/add_featured_moderation.sql`
- **Partner Console**: `frontend/public/partner-console.html` (Promote button)

