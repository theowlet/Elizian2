-- Prevent double-crediting loyalty points on redemption retry.
-- Partial unique index: only enforced when reference_id is NOT NULL
-- (non-booking activities like adjustments/expiry can have NULL reference_id).
CREATE UNIQUE INDEX IF NOT EXISTS idx_loyalty_activity_idempotency
  ON loyalty_activity (user_id, reference_id, source)
  WHERE reference_id IS NOT NULL;
