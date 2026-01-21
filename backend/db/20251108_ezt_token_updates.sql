-- EZT booking enrichment
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS ezt_redeemed NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fiat_amount NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reward_eligible BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS reward_credited BOOLEAN DEFAULT false;

-- Optional wallet safeguard
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_name = 'users'
      AND constraint_name = 'users_available_tokens_nonnegative'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_available_tokens_nonnegative
      CHECK (available_tokens >= 0);
  END IF;
END $$;

