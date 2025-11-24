# Deployment Guide - Admin Status Workflow

## 🎯 **Overview**

This guide covers deploying the comprehensive admin status workflow refactor completed on **2025-11-24**.

**Branch**: `fix/admin-status-workflow-20251117`  
**Commit**: `a94b748`

---

## ✅ **What Was Completed**

### **1. Database Infrastructure**
- ✅ Created SQL migration: `backend/migrations/2025-11-17-add-offer-status.sql`
- ✅ Adds `offer_status` ENUM type
- ✅ Adds `status` column to `partner_offers`
- ✅ Backfills status from existing `is_active`, `start_date`, `end_date`
- ✅ Creates index on `status` column
- ✅ Adds trigger to keep `is_active` in sync (backward compatibility)

### **2. Backend Repository Layer**
- ✅ Created `backend/src/repositories/dbHelpers.js` with `withTransaction()` helper
- ✅ `adminRepository.js` **already uses status model correctly**:
  - Uses `OFFER_STATUS` constants
  - `updateDealStatus()` updates status column with transactions
  - `listAdminDeals()` reads status column
  - `checkDealEligibility()` validates against status

### **3. Backend Service Layer**
- ✅ `adminService.js` **already has `validateStatusTransition()`**
- ✅ Validates state transitions: draft → pending_approval → active → paused → rejected → expired
- ✅ Prevents invalid transitions (e.g., can't reactivate expired deals)

### **4. Audit Logging**
- ✅ Created `backend/utils/audit.js` with `createAuditLogEntry()`
- ✅ Automatically fetches `actor_name` from users table
- ✅ Automatically fetches `entity_name` based on entity type
- ✅ Stores structured `{ previous, next }` in meta column
- ✅ Integrated into `adminRepository.updateDealStatus()`

### **5. Frontend Admin Console**
- ✅ `frontend/public/js/admin.js` **already configured for status model**:
  - `DEAL_STATUS_LABELS` mapping
  - `DEAL_STATUS_BADGES` styling
  - `DEAL_STATUS_PERMISSIONS` controls which actions are allowed
  - `DEAL_SCHEDULE_LABELS` for separate schedule badges

### **6. Additional Fixes**
- ✅ Fixed booking errors:
  - Added `getPartnerCategoryId()` to `partnerRepository`
  - Added `/api/v1/deals/:id/availability` endpoint
  - Fixed column mismatches in booking creation
- ✅ CORS and static uploads already properly configured
- ✅ `dotenv` already in dependencies
- ✅ Upload directories created on server startup

---

## 🚀 **Deployment Steps**

### **Step 1: Backup Database**

**CRITICAL**: Always backup before running migrations!

```bash
# Using pg_dump
pg_dump "<YOUR_DATABASE_URL>" \
  --schema=public \
  --no-owner \
  --no-privileges \
  --format=plain \
  -f backup_pre_status_migration_$(date +%Y%m%d).sql

# Or using Neon dashboard:
# Project → Database → Backups → Create backup
```

### **Step 2: Run Migration**

```bash
# Navigate to backend directory
cd backend

# Verify migration file exists
ls -la migrations/2025-11-17-add-offer-status.sql

# Run migration
psql "<YOUR_DATABASE_URL>" -f migrations/2025-11-17-add-offer-status.sql

# Expected output:
# BEGIN
# DO
# ALTER TABLE
# UPDATE 123  (or however many offers you have)
# ALTER TABLE
# CREATE INDEX
# COMMENT
# DO
# COMMIT
```

### **Step 3: Verify Migration**

```bash
# Check if status column exists
psql "<YOUR_DATABASE_URL>" -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'partner_offers' AND column_name = 'status';"

# Expected output:
#  column_name |   data_type
# -------------+--------------
#  status      | USER-DEFINED

# Check status values distribution
psql "<YOUR_DATABASE_URL>" -c "SELECT status, COUNT(*) FROM partner_offers GROUP BY status ORDER BY status;"

# Expected output similar to:
#       status       | count
# -------------------+-------
#  active            |    45
#  draft             |    12
#  expired           |     8
#  paused            |     3
#  pending_approval  |     5
#  rejected          |     2
```

### **Step 4: Deploy Backend**

#### **Option A: Vercel (Serverless)**

```bash
# Ensure vercel.json is configured
# Push to main/production branch
git push origin fix/admin-status-workflow-20251117

# Or deploy directly
vercel --prod
```

#### **Option B: Railway / Heroku**

```bash
# Push to main/production branch
git push origin fix/admin-status-workflow-20251117

# Railway auto-deploys from main
# Or trigger manual deploy from dashboard
```

#### **Option C: VPS / Manual**

```bash
# SSH to server
ssh user@your-server.com

# Pull latest code
cd /path/to/elizian-backend
git pull origin fix/admin-status-workflow-20251117

# Install dependencies
npm install

# Restart server
pm2 restart elizian-backend
# or
systemctl restart elizian-backend
```

### **Step 5: Set Environment Variables**

Ensure these are set in your deployment environment:

```bash
# Required
DATABASE_URL=postgresql://user:pass@host:5432/dbname
JWT_SECRET=<at least 32 characters>
PORT=5001

# Optional but recommended
FRONTEND_URL=https://your-frontend.com
NODE_ENV=production
REDIS_URL=redis://...

# Email (if using)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

---

## 🧪 **Verification Steps**

### **1. Health Check**

```bash
curl https://your-api.com/health

# Expected:
# {"ok":true,"status":"healthy","uptime":123.45,"timestamp":"2025-11-24T..."}
```

### **2. Admin Deals Endpoint**

```bash
# Get all deals with status
curl -H "Authorization: Bearer <ADMIN_TOKEN>" \
  https://your-api.com/api/v1/admin/deals?status=all

# Expected response includes:
# {
#   "success": true,
#   "data": [
#     {
#       "id": "...",
#       "title": "...",
#       "status": "active",           ← NEW
#       "schedule_status": "live",    ← NEW
#       "is_promoted": false,
#       ...
#     }
#   ]
# }
```

### **3. Deal Status Update**

```bash
# Approve a pending deal
curl -X POST \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  https://your-api.com/api/v1/admin/deals/<DEAL_ID>/approve

# Expected:
# {
#   "success": true,
#   "data": {
#     "id": "...",
#     "status": "active",        ← Changed from "pending_approval"
#     "is_active": true,         ← Kept in sync
#     ...
#   }
# }
```

### **4. Admin Activity Log**

```bash
# Get recent admin activity
curl -H "Authorization: Bearer <ADMIN_TOKEN>" \
  https://your-api.com/api/v1/admin/activity

# Expected response includes:
# {
#   "success": true,
#   "data": [
#     {
#       "actor_name": "John Smith",      ← NEW: Resolved from users table
#       "entity_name": "Karaoke Night",  ← NEW: Resolved from partner_offers table
#       "action": "deal_approve",
#       "meta": {
#         "previous": { "status": "pending_approval", ... },
#         "next": { "status": "active", ... }
#       },
#       ...
#     }
#   ]
# }
```

### **5. Frontend Admin Console**

1. **Login**: Navigate to `https://your-frontend.com/admin-login.html`
2. **Deals Section**: 
   - Should see status badges: Draft, Pending Approval, Active, Paused, Rejected, Expired
   - Should see schedule badges: Upcoming, Live, Expired
   - Actions should be disabled/enabled based on status
3. **Approve a deal**:
   - Should only be enabled for pending/draft/paused deals
   - Should be disabled for active/expired deals
4. **Activity Log**:
   - Should show actor names and entity names
   - Should not show "null" or "undefined"

---

## 🔍 **Status Model Reference**

### **Status Values**

| Status | Meaning | Can Approve? | Can Reject? | Can Pause? | Can Promote? |
|--------|---------|--------------|-------------|------------|--------------|
| `draft` | Being created | ❌ | ✅ | ❌ | ❌ |
| `pending_approval` | Awaiting admin | ✅ | ✅ | ❌ | ❌ |
| `active` | Live & bookable | ❌ | ❌ | ✅ | ✅ |
| `paused` | Temporarily disabled | ✅ | ✅ | ❌ | ✅ |
| `rejected` | Denied by admin | ✅ | ❌ | ❌ | ❌ |
| `expired` | Past end_date | ❌ | ❌ | ❌ | ❌ |

### **Schedule Status (Separate)**

Computed from `start_date` and `end_date`:

- **`upcoming`**: `start_date` is in the future
- **`live`**: Between `start_date` and `end_date`
- **`expired`**: `end_date` is in the past

### **State Transitions**

```
draft ──→ pending_approval ──→ active ──→ paused ──→ active
  │              │                │         │
  │              │                │         └──→ rejected
  │              │                │
  │              │                └──→ expired (auto)
  │              │
  │              └──→ rejected
  │
  └──→ rejected

Notes:
- Active deals CANNOT be rejected (must pause first)
- Expired deals CANNOT be reactivated (create new deal)
- All transitions are validated by validateStatusTransition()
```

---

## 🐛 **Troubleshooting**

### **Issue: Column "status" does not exist**

**Cause**: Migration not run yet

**Fix**:
```bash
psql "<YOUR_DATABASE_URL>" -f backend/migrations/2025-11-17-add-offer-status.sql
```

### **Issue: actor_name or entity_name is null in activity log**

**Cause**: Audit helper can't find user/entity in database

**Fix**: Check that:
- User IDs exist in `users` table
- Deal IDs exist in `partner_offers` table
- audit helper is using correct client (for transactions)

### **Issue: Can't approve active deal**

**Cause**: Working as designed!

**Fix**: Active deals are already approved. To deactivate, use "Pause" action.

### **Issue: Can't reactivate expired deal**

**Cause**: Working as designed!

**Fix**: Create a new deal with updated dates instead.

---

## 📊 **Rollback Plan**

If issues occur, rollback procedure:

### **1. Restore Database**

```bash
# Restore from backup
psql "<YOUR_DATABASE_URL>" < backup_pre_status_migration_YYYYMMDD.sql
```

### **2. Revert Code**

```bash
git revert a94b748  # Revert the commit
git push origin main
```

### **3. Redeploy Previous Version**

Deploy from `main` branch before the merge.

---

## 📝 **Post-Deployment Checklist**

- [ ] Database migration completed successfully
- [ ] No SQL errors in server logs
- [ ] `/health` endpoint returns 200
- [ ] `/api/v1/admin/deals` returns deals with `status` field
- [ ] Admin can approve/reject/pause deals
- [ ] Status transitions are validated correctly
- [ ] Activity log shows `actor_name` and `entity_name`
- [ ] Frontend admin console shows status badges
- [ ] Frontend admin console disables invalid actions
- [ ] Booking flow still works (test a booking)
- [ ] Partner console still works (test partner login)

---

## 🎉 **Success Criteria**

Your deployment is successful if:

1. ✅ All deals have a valid `status` value
2. ✅ Admin can manage deal lifecycle (approve/reject/pause)
3. ✅ Invalid transitions are prevented with clear error messages
4. ✅ Activity log shows who did what to which entity
5. ✅ Frontend UI correctly reflects status and disables invalid actions
6. ✅ Booking flow continues to work
7. ✅ No "column does not exist" errors in logs

---

## 📞 **Support**

If you encounter issues:

1. Check server logs: `tail -f backend/logs/error.log`
2. Check database: `psql "<URL>" -c "SELECT * FROM partner_offers LIMIT 1;"`
3. Check browser console: Open DevTools → Console tab
4. Review this guide's Troubleshooting section

---

**Last Updated**: 2025-11-24  
**Author**: AI Assistant  
**Branch**: `fix/admin-status-workflow-20251117`

