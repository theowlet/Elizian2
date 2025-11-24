# Duplicate and Unused Files Cleanup Plan

## Analysis Summary

Based on code analysis, here are the files that can be safely removed:

### 1. DUPLICATE FILES (Confirmed Unused)

#### Services
- `backend/services/voucherService.js` - DUPLICATE
  - Used: `backend/src/services/voucherService.js` (imported by voucherController)
  - Unused: `backend/services/voucherService.js` (old version)

#### Utils (Both locations are used, but need to check)
- `backend/utils/` - Used by `backend/src/` files via `../../utils/`
- `backend/src/utils/` - Used by `backend/src/` files via `../utils/`
- **Both are actually used!** The root `backend/utils/` is imported with `../../utils/` and `backend/src/utils/` is imported with `../utils/`

### 2. DOCUMENTATION FILES (Outdated/Redundant)

These markdown files appear to be temporary documentation and can be removed:
- `BACKEND_FILES_FOR_REVIEW.md` (just created, but can keep)
- `BACKEND_FILES_LIST.txt` (just created, but can keep)
- `BUG_REPORT_AND_FIXES.md`
- `CODE_REVIEW_FILES.md`
- `CRITICAL_FILES_FOR_REVIEW.md`
- `FEATURED_DEAL_ELIGIBILITY_FLOW.md`
- `IMAGE_DEBUGGING_GUIDE.md`
- `IMAGE_DIAGNOSTIC.md`
- `IMAGE_STORAGE_ANALYSIS.md`
- `IMAGE_UPLOAD_FIX_SUMMARY.md`
- `IMAGE_URL_FIX.md`
- `IMAGE_VISIBILITY_FIX.md`
- `JAVASCRIPT_FILES_INDEX.md`
- `MENU_ITEMS_VS_OFFERS_ARCHITECTURE.md`
- `REACT_MIGRATION_PLAN.md`
- `STYLING_REFACTOR_SUMMARY.md`
- `TRENDING_ELIGIBILITY_COMPLETE_GUIDE.md`
- `TRENDING_ELIGIBILITY_FIXES.md`
- `TRENDING_ELIGIBILITY_LOGIC_ANALYSIS.md`
- `VOUCHER_SYSTEM_FIXES_SUMMARY.md`
- `WORKFLOW_ANALYSIS.md`
- `backend/CLEANUP_ANALYSIS.md`
- `backend/CLEANUP_COMPLETE.md`
- `backend/CLEANUP_PLAN.md`
- `backend/CORS_FIX_SUMMARY.md`
- `backend/FIX_ADMIN_ISSUES.md`
- `backend/IMAGE_FIXES_SUMMARY.md`
- `backend/IMPORT_FIXES.md`
- `backend/IMPORT_PATH_FIXES.md`
- `backend/MIGRATION_STATUS.md`
- `backend/PORT_CONFLICT_FIX.md`
- `backend/QUICK_START.md`
- `backend/REFACTORING_PROGRESS.md`
- `backend/REFACTORING_STATUS.md`
- `backend/RUN_INSTRUCTIONS.md`
- `backend/START_SERVER.md`

### 3. OLD MIGRATION FILES (Potentially Merged)

These might be old migrations that have been merged into the main schema:
- `backend/db/add_featured_moderation.sql`
- `backend/db/add_otp_registration_tracking.sql`
- `backend/db/add_role_id_column.sql`
- `backend/db/clean_all_data.sql`
- `backend/db/clean_dummy_data.sql`
- `backend/db/deal_slots.sql`
- `backend/db/event_categories.sql`
- `backend/db/event_v2_taxonomy.sql`
- `backend/db/fix_multi_tier_schema.sql`
- `backend/db/food_menu_categories.sql`
- `backend/db/migrate_promoted_to_trending.sql`
- `backend/db/missing_tables.sql`
- `backend/db/multi_tier_partners.sql`
- `backend/db/verify_super_admin.sql`
- `backend/migrations/` (entire folder - check if these are merged)

### 4. UNUSED SCRIPTS

- `backend/check_otp.sh`
- `backend/get_otp.sh`
- `backend/cleanup_unused_files.sh`
- `backend/run_lifecycle_migration.sh`
- `backend/setup-env.sh`
- `backend/start-server.sh` (if not used)
- `backend/reset_partner_password.js` (if not used)
- `backend/generate-jwt-secret.js` (if not used)
- `backend/emailService.js` (if not used)

### 5. LOG FILES

- `backend/otp.log`

### 6. UNUSED FOLDERS

- `api/` folder (if not used)
- `deal images/` (if not used)
- `EZNet/` (if not used)

## Files to KEEP

### Critical Files
- `README.md` - Main documentation
- `backend/db/elizian_schema.sql` - Main schema
- All files in `backend/src/` - Active codebase
- `backend/middleware/` - Used by src files
- `backend/routes/authRoutes.js`, `loyaltyRoutes.js`, `theatreRoutes.js` - Used by app.js
- `backend/services/authService.js`, `loyaltyEngineService.js`, `loyaltyService.js`, `settingsService.js`, `theatreService.js` - Used by bookingService
- `backend/utils/` - Used by src files
- `backend/controllers/authController.js`, `loyaltyController.js`, `theatreController.js` - Used by routes
- Recent migration files (2024-2025 dated)

