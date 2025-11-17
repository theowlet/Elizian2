-- Clean Dummy Data from Multi-Tier Partner System
-- This script removes all sample/dummy data and prepares the system for real data

-- Delete all sample data from multi-tier tables
DELETE FROM compliance_audits;
DELETE FROM quality_standards;
DELETE FROM localization_settings;
DELETE FROM partner_analytics;
DELETE FROM approval_requests;
DELETE FROM approval_workflows;
DELETE FROM standardization_templates;
DELETE FROM partner_stores;
DELETE FROM partner_users;
DELETE FROM partner_organizations;

-- Reset sequences if any
-- (PostgreSQL auto-increment sequences will reset automatically)

-- Verify tables are clean
SELECT 'partner_organizations' as table_name, COUNT(*) as count FROM partner_organizations
UNION ALL
SELECT 'partner_users', COUNT(*) FROM partner_users
UNION ALL
SELECT 'partner_stores', COUNT(*) FROM partner_stores
UNION ALL
SELECT 'standardization_templates', COUNT(*) FROM standardization_templates
UNION ALL
SELECT 'approval_workflows', COUNT(*) FROM approval_workflows
UNION ALL
SELECT 'approval_requests', COUNT(*) FROM approval_requests
UNION ALL
SELECT 'partner_analytics', COUNT(*) FROM partner_analytics
UNION ALL
SELECT 'localization_settings', COUNT(*) FROM localization_settings
UNION ALL
SELECT 'quality_standards', COUNT(*) FROM quality_standards
UNION ALL
SELECT 'compliance_audits', COUNT(*) FROM compliance_audits;

-- Show clean tables
SELECT 'All dummy data has been removed. Tables are now clean and ready for real data.' as status;
