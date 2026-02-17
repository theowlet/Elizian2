-- Consolidate discount_percentage and co_pay_percentage into co_pay_percentage only.
-- Both represent the same concept: EZT co-pay as % of bill (e.g. 30 = EZT pays 30%).
-- Run after 2026-02-offer-co-pay-percentage.sql.

-- 1. Ensure co_pay_percentage exists
ALTER TABLE partner_offers ADD COLUMN IF NOT EXISTS co_pay_percentage NUMERIC(5,2);
COMMENT ON COLUMN partner_offers.co_pay_percentage IS 'EZT co-pay as % of bill (e.g. 30 = 30%). Used at redemption: ezt_co_pay = total_bill * (co_pay_percentage/100).';

-- 2. Migrate data: copy discount_percentage to co_pay_percentage where co_pay is null
UPDATE partner_offers
SET co_pay_percentage = discount_percentage
WHERE co_pay_percentage IS NULL AND discount_percentage IS NOT NULL;

-- 3. Drop discount_percentage from partner_offers
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'partner_offers' AND column_name = 'discount_percentage'
  ) THEN
    ALTER TABLE partner_offers DROP COLUMN discount_percentage;
    RAISE NOTICE 'Dropped discount_percentage from partner_offers (consolidated to co_pay_percentage)';
  END IF;
END $$;
