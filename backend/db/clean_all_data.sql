-- ============================================
-- CLEAN ALL DATA FROM ELIZIAN DATABASE
-- This script deletes all user data, partners, deals, bookings, etc.
-- while preserving schema and configuration tables (tiers, categories, roles, system_settings)
-- ============================================

-- Disable foreign key checks temporarily (PostgreSQL doesn't support this, so we delete in order)
-- Delete in reverse dependency order to respect foreign keys

BEGIN;

-- Helper function to safely delete from a table if it exists
DO $$
DECLARE
    tbl_name TEXT;
    tables_to_clean TEXT[] := ARRAY[
        'token_ledger',
        'transactions',
        'vouchers',
        'orders',
        'bookings',
        'event_tickets',
        'event_bookings',
        'deal_slots',
        'partner_offers',
        'menu_items',
        'events',
        'user_achievements',
        'user_partner_connections',
        'user_category_preferences',
        'referrals',
        'referral_codes',
        'check_ins',
        'payment_methods',
        'email_verification_tokens',
        'user_sessions',
        'user_auth_credentials',
        'tier_progress',
        'support_tickets',
        'audit_log',
        'webhook_logs',
        'api_keys',
        'partner_images',
        'partner_hours',
        'partner_category_metadata',
        'partner_auth',
        'partner_otps',
        'partner_stores',
        'partner_users',
        'partner_organizations',
        'venues',
        'otp_sessions',
        'archives'
    ];
BEGIN
    FOREACH tbl_name IN ARRAY tables_to_clean
    LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables t WHERE t.table_schema = 'public' AND t.table_name = tbl_name) THEN
            EXECUTE 'DELETE FROM ' || quote_ident(tbl_name);
            RAISE NOTICE 'Deleted from %', tbl_name;
        ELSE
            RAISE NOTICE 'Table % does not exist, skipping', tbl_name;
        END IF;
    END LOOP;
END $$;

-- Delete users (last, as many tables reference it)
DELETE FROM users;

-- 12. Reset sequences (if any exist)
DO $$
DECLARE
    seq_record RECORD;
BEGIN
    FOR seq_record IN 
        SELECT sequence_name 
        FROM information_schema.sequences 
        WHERE sequence_schema = 'public'
    LOOP
        EXECUTE 'ALTER SEQUENCE ' || seq_record.sequence_name || ' RESTART WITH 1';
    END LOOP;
END $$;

COMMIT;

-- ============================================
-- VERIFICATION QUERIES (run separately to confirm)
-- ============================================
-- SELECT COUNT(*) as users FROM users;
-- SELECT COUNT(*) as partners FROM partners;
-- SELECT COUNT(*) as deals FROM partner_offers;
-- SELECT COUNT(*) as bookings FROM bookings;
-- SELECT COUNT(*) as transactions FROM transactions;
-- SELECT COUNT(*) as token_ledger FROM token_ledger;
-- 
-- -- Configuration tables should still have data:
-- SELECT COUNT(*) as tiers FROM tiers;
-- SELECT COUNT(*) as categories FROM categories;
-- SELECT COUNT(*) as roles FROM roles;
-- SELECT COUNT(*) as system_settings FROM system_settings;

