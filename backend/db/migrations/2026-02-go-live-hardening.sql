-- ============================================
-- Go-Live Hardening (Non-Breaking, Additive Only)
-- Sections: Idempotency, Atomicity, Claim replay, Ledger determinism, Override immutability
-- ============================================

-- 1. One platform_earnings_ledger row per redemption (prevents duplicate earning events)
-- Additive: partial unique index; allows NULL redemption_id for legacy rows
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'platform_earnings_ledger')
     AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_platform_earnings_ledger_redemption_id_unique') THEN
    CREATE UNIQUE INDEX idx_platform_earnings_ledger_redemption_id_unique
      ON platform_earnings_ledger(redemption_id)
      WHERE redemption_id IS NOT NULL;
    RAISE NOTICE 'Created unique index on platform_earnings_ledger(redemption_id)';
  END IF;
END $$;

-- 2. Claim replay protection: one subscription pass code can be claimed only once
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_user_subscription_passes_code_unique'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_subscription_passes'
  ) THEN
    CREATE UNIQUE INDEX idx_user_subscription_passes_code_unique
      ON user_subscription_passes(code);
    RAISE NOTICE 'Created unique index on user_subscription_passes(code)';
  END IF;
END $$;

-- 3. Redemption idempotency keys (optional header X-Idempotency-Key)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'redemption_audit')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'redemption_idempotency_keys') THEN
    CREATE TABLE redemption_idempotency_keys (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      idempotency_key VARCHAR(255) NOT NULL,
      redemption_id UUID NOT NULL REFERENCES redemption_audit(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_redemption_idempotency_key UNIQUE (idempotency_key)
    );
    CREATE INDEX idx_redemption_idempotency_keys_key ON redemption_idempotency_keys(idempotency_key);
    COMMENT ON TABLE redemption_idempotency_keys IS 'Optional idempotency keys for POST /redemptions/redeem; prevents duplicate financial impact on retry';
    RAISE NOTICE 'Created table redemption_idempotency_keys';
  END IF;
END $$;

-- 4. Immutable override logging: forbid UPDATE/DELETE on admin_overrides (append-only)
-- Additive: trigger raises exception on UPDATE/DELETE so application cannot alter history
-- 4. Ledger ↔ wallet determinism: verification function (no schema change to users/token_ledger)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'token_ledger')
     AND NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'verify_token_ledger_integrity') THEN
    CREATE OR REPLACE FUNCTION verify_token_ledger_integrity(p_user_id UUID DEFAULT NULL)
    RETURNS TABLE(user_id UUID, stored_balance NUMERIC, ledger_balance_after NUMERIC, discrepancy NUMERIC, ok BOOLEAN) AS $$
    BEGIN
      RETURN QUERY
      SELECT
        u.id AS user_id,
        COALESCE(u.available_tokens, 0)::NUMERIC AS stored_balance,
        COALESCE(l.last_balance_after, 0)::NUMERIC AS ledger_balance_after,
        (COALESCE(u.available_tokens, 0) - COALESCE(l.last_balance_after, 0))::NUMERIC AS discrepancy,
        (COALESCE(u.available_tokens, 0) = COALESCE(l.last_balance_after, 0)) AS ok
      FROM users u
      LEFT JOIN LATERAL (
        SELECT tl.balance_after AS last_balance_after
        FROM token_ledger tl
        WHERE tl.user_id = u.id
        ORDER BY tl.created_at DESC
        LIMIT 1
      ) l ON true
      WHERE (p_user_id IS NULL OR u.id = p_user_id);
    END;
    $$ LANGUAGE plpgsql STABLE;
    RAISE NOTICE 'Created verify_token_ledger_integrity(user_id) for ledger vs wallet reconciliation';
  END IF;
END $$;

-- 5. Immutable override logging: forbid UPDATE/DELETE on admin_overrides (append-only)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'prevent_admin_overrides_modify') THEN
    CREATE OR REPLACE FUNCTION prevent_admin_overrides_modify()
    RETURNS TRIGGER AS $$
    BEGIN
      RAISE EXCEPTION 'admin_overrides is append-only; UPDATE and DELETE are not allowed'
        USING ERRCODE = 'integrity_constraint_violation';
    END;
    $$ LANGUAGE plpgsql;
    RAISE NOTICE 'Created trigger function prevent_admin_overrides_modify';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'admin_overrides') THEN
    DROP TRIGGER IF EXISTS tr_admin_overrides_no_update ON admin_overrides;
    CREATE TRIGGER tr_admin_overrides_no_update
      BEFORE UPDATE ON admin_overrides
      FOR EACH ROW EXECUTE PROCEDURE prevent_admin_overrides_modify();
    DROP TRIGGER IF EXISTS tr_admin_overrides_no_delete ON admin_overrides;
    CREATE TRIGGER tr_admin_overrides_no_delete
      BEFORE DELETE ON admin_overrides
      FOR EACH ROW EXECUTE PROCEDURE prevent_admin_overrides_modify();
    RAISE NOTICE 'Created triggers on admin_overrides (append-only)';
  END IF;
END $$;
