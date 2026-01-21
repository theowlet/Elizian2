-- Add savings and EZT tracking, and enforce non-negative discounted price
ALTER TABLE partner_offers
  ADD COLUMN IF NOT EXISTS savings NUMERIC(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ezt_equivalent NUMERIC(10, 2) DEFAULT 0;

ALTER TABLE partner_offers
  ALTER COLUMN discounted_price SET DEFAULT 0;

ALTER TABLE partner_offers
  ADD CONSTRAINT IF NOT EXISTS discounted_price_nonnegative CHECK (discounted_price >= 0);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'token_ledger'
  ) THEN
    CREATE TABLE token_ledger (
      id SERIAL PRIMARY KEY,
      user_id UUID NULL REFERENCES users(id),
      partner_id UUID NULL REFERENCES partners(id),
      booking_id UUID NULL REFERENCES bookings(id),
      offer_id UUID NULL REFERENCES partner_offers(id),
      transaction_id UUID NULL REFERENCES transactions(id),
      amount NUMERIC(10,2) NOT NULL,
      ledger_type VARCHAR(50),
      change_type VARCHAR(10),
      description TEXT,
      source VARCHAR(50),
      balance_before NUMERIC(10,2),
      balance_after NUMERIC(10,2),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  END IF;
END $$;

ALTER TABLE token_ledger ADD COLUMN IF NOT EXISTS change_type VARCHAR(10);
ALTER TABLE token_ledger ADD COLUMN IF NOT EXISTS source VARCHAR(50);

