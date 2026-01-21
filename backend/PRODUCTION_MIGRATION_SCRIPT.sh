#!/bin/bash
# ============================================
# Production Database Migration Script
# Run all database migrations in correct order
# ============================================

set -e  # Exit on error

# Configuration
DB_NAME="${DB_NAME:-elizian}"
DB_USER="${DB_USER:-postgres}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to run SQL file
run_sql_file() {
    local file=$1
    local description=$2
    
    if [ ! -f "$file" ]; then
        echo -e "${YELLOW}⚠️  File not found: $file${NC}"
        return 1
    fi
    
    echo -e "${GREEN}▶ Running: $description${NC}"
    echo "  File: $file"
    
    if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$file" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Success: $description${NC}\n"
        return 0
    else
        echo -e "${RED}❌ Failed: $description${NC}\n"
        return 1
    fi
}

# Main execution
echo "============================================"
echo "Production Database Migration Script"
echo "============================================"
echo "Database: $DB_NAME"
echo "User: $DB_USER"
echo "Host: $DB_HOST:$DB_PORT"
echo "============================================\n"

# Change to script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# CRITICAL FILES (Must run first)
echo -e "${YELLOW}📋 STEP 1: Core Schema${NC}"
run_sql_file "elizian_schema.sql" "Core Schema (Base Tables)"

echo -e "${YELLOW}📋 STEP 2: Role System${NC}"
run_sql_file "add_role_id_column.sql" "Role-Based Access Control"

echo -e "${YELLOW}📋 STEP 3: Critical Features${NC}"
run_sql_file "20250107_bank_offers_reservations.sql" "Bank Offers & Reservations"
run_sql_file "20250107_loyalty_tiers_system.sql" "Loyalty Tier System"
run_sql_file "20250108_tier_system_compatibility.sql" "Tier System Compatibility"
run_sql_file "20250106_voucher_fixes.sql" "Voucher System Fixes"

echo -e "${YELLOW}📋 STEP 4: Booking System Fixes (CRITICAL)${NC}"
run_sql_file "migrations/2025-01-21-create-restaurant-availability.sql" "Restaurant Availability Table"
run_sql_file "migrations/2025-01-21-fix-all-bookings-columns.sql" "Fix All Bookings Columns"
run_sql_file "migrations/2025-01-21-fix-booking-type-constraint-final.sql" "Fix Booking Type Constraint"
run_sql_file "migrations/2025-01-21-fix-loyalty-points-fk-deferrable.sql" "Fix Loyalty Points FK Constraint"

echo -e "${YELLOW}📋 STEP 5: Feature Enhancements${NC}"
run_sql_file "20251108_ezt_token_updates.sql" "EZT Token Updates"
run_sql_file "20251108_offer_discount_updates.sql" "Offer Discount Updates"
run_sql_file "20241118_add_offer_status.sql" "Offer Status"
run_sql_file "20251205_admin_console_fix.sql" "Admin Console Fixes"

echo -e "${YELLOW}📋 STEP 6: Partner & Admin Features${NC}"
run_sql_file "migrations/2025-01-20-add-partner-email-verification.sql" "Partner Email Verification"
run_sql_file "migrations/2025-01-20-add-partner-webhooks.sql" "Partner Webhooks"
run_sql_file "migrations/2025-01-20-add-payments-table.sql" "Payments Table"
run_sql_file "migrations/2025-11-28-add-gst-number.sql" "GST Number"
run_sql_file "migrations/2025-11-29-add-dietary-and-cost.sql" "Dietary & Cost Info"
run_sql_file "migrations/2025-11-29-partner-dining-metadata.sql" "Partner Dining Metadata"
run_sql_file "migrations/add_cuisine_to_partners.sql" "Cuisine to Partners"

echo -e "${YELLOW}📋 STEP 7: Data Structure Enhancements${NC}"
run_sql_file "event_categories.sql" "Event Categories"
run_sql_file "event_v2_taxonomy.sql" "Event V2 Taxonomy"
run_sql_file "food_menu_categories.sql" "Food Menu Categories"
run_sql_file "deal_slots.sql" "Deal Slots"
run_sql_file "add_featured_moderation.sql" "Featured Moderation"
run_sql_file "migrations/2025-01-18-consolidate-trending.sql" "Trending Consolidation"

echo -e "${YELLOW}📋 STEP 8: Optional Fixes${NC}"
run_sql_file "fix_multi_tier_schema.sql" "Multi-Tier Schema Fix" || true
run_sql_file "multi_tier_partners.sql" "Multi-Tier Partners" || true
run_sql_file "add_otp_registration_tracking.sql" "OTP Registration Tracking" || true
run_sql_file "20251108_retrospective_signup_bonus.sql" "Retrospective Signup Bonus" || true
run_sql_file "20251108_update_tiers.sql" "Update Tiers" || true

echo "============================================"
echo -e "${GREEN}✅ Migration Complete!${NC}"
echo "============================================"
echo ""
echo "Next steps:"
echo "1. Verify database schema"
echo "2. Run verification queries (see PRODUCTION_DB_DEPLOYMENT.md)"
echo "3. Test application functionality"

