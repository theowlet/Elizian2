-- Co-pay percentage: explicit numeric field for "Co-pay up to X% using EZT".
-- EZT co-pay % (replaces discount_percentage; see 2026-02-consolidate-co-pay-percentage.sql).
ALTER TABLE partner_offers ADD COLUMN IF NOT EXISTS co_pay_percentage NUMERIC(5,2);
COMMENT ON COLUMN partner_offers.co_pay_percentage IS 'EZT co-pay as % of bill (e.g. 30 = 30%). Used at redemption: ezt_co_pay = total_bill * (co_pay_percentage/100).';
