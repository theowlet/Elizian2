-- Enterprise: indexes and constraints for voucher_code and token_ledger
-- Backward compatible; run after backup in production.

-- UNIQUE index on voucher_code (bookings) — prevents duplicate voucher codes
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_voucher_code_unique
  ON bookings (voucher_code)
  WHERE voucher_code IS NOT NULL;

-- B-tree index on voucher_code for lookups
CREATE INDEX IF NOT EXISTS idx_bookings_voucher_code
  ON bookings (voucher_code)
  WHERE voucher_code IS NOT NULL;

-- Composite index token_ledger(user_id, reference_id) for user + reference lookups
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'token_ledger') THEN
    CREATE INDEX IF NOT EXISTS idx_token_ledger_user_reference
      ON token_ledger (user_id, reference_id);
  END IF;
END $$;

-- ON DELETE CASCADE: add only where safe and documented (example: campaign_experiences)
-- Uncomment and adjust table/column names per your schema if you want FKs to cascade:
-- ALTER TABLE some_child_table
--   DROP CONSTRAINT IF EXISTS some_child_parent_fk,
--   ADD CONSTRAINT some_child_parent_fk FOREIGN KEY (parent_id) REFERENCES parent(id) ON DELETE CASCADE;
