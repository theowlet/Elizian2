# Changelog

All notable changes to the Elizian backend and frontend.

---

## [Unreleased] - 2025-11-24

### Added

#### **Database**
- **Status ENUM**: Added canonical `offer_status` ENUM type with values: `draft`, `pending_approval`, `active`, `paused`, `rejected`, `expired`
- **status column**: Added to `partner_offers` table with backfill logic from existing `is_active`, `start_date`, `end_date`
- **Index**: Created `idx_partner_offers_status` for fast status filtering
- **Trigger**: Auto-sync `is_active` boolean when `status` changes (backward compatibility)

#### **Backend Infrastructure**
- **dbHelpers.js**: Created `withTransaction(pool, callback)` helper for atomic database operations
- **audit.js**: Enhanced audit logging with:
  - `createAuditLogEntry()` function
  - Auto-resolves `actor_name` from users table
  - Auto-resolves `entity_name` from entity tables (deals, partners, users)
  - Structured `{ previous, next }` metadata in audit logs
- **Availability endpoint**: Added `/api/v1/deals/:id/availability` for booking UI

#### **Backend Repository Layer**
- **partnerRepository**: Added `getPartnerCategoryId()` function for booking transactions
- **adminRepository**: Already uses status model correctly:
  - `OFFER_STATUS` constants defined
  - `checkDealEligibility()` validates against status
  - `updateDealStatus()` uses transactions and updates status column
  - `getDealScheduleStatus()` computes schedule from dates

#### **Backend Service Layer**
- **adminService**: Already has `validateStatusTransition()` with comprehensive state machine logic
- Prevents invalid transitions (e.g., can't reactivate expired deals)
- Clear error messages for validation failures

#### **Frontend**
- **admin.js**: Already configured with complete status model:
  - `DEAL_STATUS_LABELS` mapping
  - `DEAL_STATUS_BADGES` styling classes
  - `DEAL_STATUS_PERMISSIONS` controls action availability
  - `DEAL_SCHEDULE_LABELS` for separate schedule badges

### Fixed

#### **Booking Errors**
- Fixed `partnerRepository.getPartnerCategoryId is not a function` error
- Fixed 404 on `/api/v1/deals/:id/availability` endpoint
- Fixed column mismatch in `bookingRepository.createBooking()`:
  - Changed `offer_id` → `deal_id`
  - Changed `amount` → `total_price` and `fiat_amount`
  - Added `partner_id`, `ezt_redeemed`, `reward_eligible` fields
  - Removed non-existent `commission_percentage`, `partner_earning` fields

#### **Event Filtering**
- Fixed "discount Rain" showing in "Upcoming Events" when already started
- Added `loadOngoingEvents()` function for "Live Now" section
- Updated `loadUpcomingEvents()` to only show events with future `start_date`

#### **Deal Visibility**
- Fixed Karaoke deal not visible due to future `start_date`
- Updated deals to use `CURRENT_TIMESTAMP` for immediate activation

### Changed

#### **Database Schema**
- `partner_offers.status` now canonical source of truth (replaces mixed `is_active` checks)
- `is_active` kept in sync via trigger for backward compatibility
- Status transitions now atomic (wrapped in transactions)

#### **Audit Logging**
- Audit logs now include human-readable names instead of just UUIDs
- Structured metadata with clear before/after state
- Audit writes no longer block main operations (catch errors, log, continue)

#### **Admin Workflow**
- Deal approval now validates:
  - Partner must be active
  - Start/end dates required and valid
  - Discounted price must be lower than original (if original > 0)
  - Cannot reactivate expired deals
  - Cannot reject active deals directly (must pause first)
- State transitions validated consistently across frontend and backend

### Infrastructure

#### **CORS & Static Files**
- ✅ Already properly configured with permissive CORS for uploads
- ✅ Upload directories created on server startup
- ✅ Serves `/uploads` with correct headers

#### **Dependencies**
- ✅ `dotenv` already in dependencies (not just devDependencies)
- ✅ `uuid` available (ESM issue not present in current setup)
- ✅ All required packages installed

---

## Status Model Reference

### Valid Status Values

| Status | Description | DB Value |
|--------|-------------|----------|
| Draft | Being created by partner | `draft` |
| Pending Approval | Awaiting admin review | `pending_approval` |
| Active | Live and bookable | `active` |
| Paused | Temporarily disabled | `paused` |
| Rejected | Denied by admin | `rejected` |
| Expired | Past end_date | `expired` |

### Schedule Status (Computed)

Separate from `status`, computed from dates:

| Schedule | Condition | Display |
|----------|-----------|---------|
| Upcoming | `start_date` > now | Info badge |
| Live | now between start_date and end_date | Success badge |
| Expired | `end_date` < now | Muted badge |

### State Transitions

```
draft → pending_approval → active → paused → active
  ↓            ↓              ↓       ↓
rejected    rejected      expired  rejected
```

**Rules**:
- Active deals cannot be rejected (pause first)
- Expired deals cannot be reactivated (create new)
- Rejected deals can be approved (with valid dates)
- Draft deals can be approved or rejected

---

## Migration Guide

See `DEPLOYMENT_GUIDE.md` for complete deployment instructions.

**Quick Start**:

```bash
# 1. Backup database
pg_dump "<DATABASE_URL>" -f backup.sql

# 2. Run migration
psql "<DATABASE_URL>" -f backend/migrations/2025-11-17-add-offer-status.sql

# 3. Verify
psql "<DATABASE_URL>" -c "SELECT status, COUNT(*) FROM partner_offers GROUP BY status;"

# 4. Deploy code
git push origin fix/admin-status-workflow-20251117
```

---

## Breaking Changes

None! Changes are backward compatible:
- `is_active` still maintained via trigger
- Old code reading `is_active` will continue to work
- Frontend already expects `status` field
- API responses include both `status` and `schedule_status`

---

## Contributors

- **Backend**: AI Assistant (Claude)
- **Frontend**: AI Assistant (Claude)
- **Database**: AI Assistant (Claude)
- **Testing**: Nishant Verma

---

## Notes

This release represents a comprehensive refactor of the admin deal workflow, moving from ad-hoc `is_active` boolean checks to a proper state machine with canonical `status` enum. The codebase was found to already have most of the required infrastructure in place - this release primarily adds the database migration and supporting utilities.

**Key Insight**: The repository and service layers were already well-architected for the status model. The main work was adding the database column and ensuring audit logs capture human-readable names.

---

**Last Updated**: 2025-11-24  
**Version**: Unreleased (pending merge to main)  
**Branch**: `fix/admin-status-workflow-20251117`

