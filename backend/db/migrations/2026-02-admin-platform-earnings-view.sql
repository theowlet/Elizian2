-- Read-only reporting view for Admin Platform Earnings drill-down.
-- No table alteration. No recalculation. Uses only existing ledger + JOINs.
-- Ledger column is platform_fee_total (not platform_fee).

CREATE OR REPLACE VIEW admin_platform_earnings_view AS
SELECT
    pel.id,
    pel.booking_id,
    pel.partner_id,
    pel.tier_id,
    pel.redemption_id,
    pel.bill_amount,
    pel.platform_fee_total,
    pel.fiat_component,
    pel.ezt_component,
    pel.created_at,
    pel.tier_name,
    pel.tier_percentage,
    p.name AS partner_name,
    p.address AS partner_address,
    b.deal_id,
    po.title AS deal_title
FROM platform_earnings_ledger pel
LEFT JOIN partners p ON p.id = pel.partner_id
LEFT JOIN bookings b ON b.id = pel.booking_id
LEFT JOIN partner_offers po ON po.id = b.deal_id;

COMMENT ON VIEW admin_platform_earnings_view IS 'Read-only reporting view; drill-down only. Do not recalculate; ledger is source of truth.';

-- Indexes already exist from 2026-02-dynamic-partner-tiers.sql (idx_platform_earnings_ledger_created_at, idx_platform_earnings_ledger_partner_id). No duplicate indexes.
