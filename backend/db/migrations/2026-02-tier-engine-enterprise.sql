-- ============================================
-- ENTERPRISE TIER ENGINE UPGRADE v2
-- Migration: 2026-02-tier-engine-enterprise.sql
--
-- Includes:
--   1. loyalty_tiers: card_theme_config, is_active
--   2. Tier theme seeds (luxury dark-gold design)
--   3. users: tier_card_number (ELZ-YYYY-XXXXXXXX), tier_card_issued_at
--   4. Card number sequence
--   5. Existing user pass number backfill
--   6. token_ledger idempotency constraint
--   7. tier_config_audit table
--   8. eazy_pass_scan_log table (immutable audit trail)
--   9. Performance indexes
-- ============================================

-- ─── 1. Add card_theme_config and is_active to loyalty_tiers ─────────
ALTER TABLE loyalty_tiers ADD COLUMN IF NOT EXISTS card_theme_config JSONB DEFAULT '{}'::jsonb;
ALTER TABLE loyalty_tiers ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- ─── 2. Seed tier-specific card themes (luxury gold design) ─────────
UPDATE loyalty_tiers SET card_theme_config = '{
  "gradient": "linear-gradient(165deg, #0B0B0E 0%, #1A103F 35%, #0B0B0E 65%, #0D0A12 100%)",
  "accent_color": "#94a3b8",
  "glow_color": "rgba(148,163,184,0.25)",
  "badge_emoji": "🪨"
}'::jsonb WHERE tier_name IN ('Aether', 'Ather');

UPDATE loyalty_tiers SET card_theme_config = '{
  "gradient": "linear-gradient(165deg, #0B0B0E 0%, #1A103F 35%, #0B0B0E 65%, #0D0A12 100%)",
  "accent_color": "#60a5fa",
  "glow_color": "rgba(96,165,250,0.2)",
  "badge_emoji": "⭐"
}'::jsonb WHERE tier_name = 'Nova';

UPDATE loyalty_tiers SET card_theme_config = '{
  "gradient": "linear-gradient(165deg, #0B0B0E 0%, #1A103F 35%, #0B0B0E 65%, #0D0A12 100%)",
  "accent_color": "#a78bfa",
  "glow_color": "rgba(167,139,250,0.2)",
  "badge_emoji": "💎"
}'::jsonb WHERE tier_name = 'Luminar';

UPDATE loyalty_tiers SET card_theme_config = '{
  "gradient": "linear-gradient(165deg, #0B0B0E 0%, #1A103F 35%, #0B0B0E 65%, #0D0A12 100%)",
  "accent_color": "#f59e0b",
  "glow_color": "rgba(245,158,11,0.25)",
  "badge_emoji": "🏅"
}'::jsonb WHERE tier_name = 'Valiant';

UPDATE loyalty_tiers SET card_theme_config = '{
  "gradient": "linear-gradient(165deg, #0B0B0E 0%, #1A103F 35%, #0B0B0E 65%, #0D0A12 100%)",
  "accent_color": "#E0B56F",
  "glow_color": "rgba(224,181,111,0.5)",
  "badge_emoji": "👑"
}'::jsonb WHERE tier_name = 'Echelon';

-- ─── 3. Add tier card fields to users ────────────────────────────────
-- ELZ-YYYY-XXXXXXXX = 17 chars, allow 30 for future format changes
ALTER TABLE users ADD COLUMN IF NOT EXISTS tier_card_number VARCHAR(30) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS tier_card_issued_at TIMESTAMP;

-- ─── 4. Create card number sequence ─────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS tier_card_sequence START 1000;

-- ─── 5. Generate pass numbers for existing users (ELZ-YYYY-XXXXXXXX)
-- Uses MD5 of user ID + sequence as collision-resistant hex
DO $$
DECLARE
  user_rec RECORD;
  card_num VARCHAR(30);
  seq_val BIGINT;
  hash_hex VARCHAR(32);
BEGIN
  FOR user_rec IN
    SELECT id FROM users WHERE tier_card_number IS NULL
  LOOP
    seq_val := nextval('tier_card_sequence');
    hash_hex := UPPER(LEFT(md5(user_rec.id::text || ':' || seq_val::text || ':' || extract(epoch from now())::text), 8));
    card_num := 'ELZ-' || extract(year from now())::text || '-' || hash_hex;
    UPDATE users SET tier_card_number = card_num, tier_card_issued_at = CURRENT_TIMESTAMP WHERE id = user_rec.id;
  END LOOP;
END $$;

-- ─── 6. Add idempotency constraint to token_ledger ──────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'token_ledger' AND column_name = 'reference_id'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'token_ledger_idempotency_key'
    ) THEN
      -- Clean up any existing duplicates first
      DELETE FROM token_ledger a USING token_ledger b
      WHERE a.id > b.id
        AND a.user_id = b.user_id
        AND a.reference_id = b.reference_id
        AND a.ledger_type = b.ledger_type
        AND a.reference_id IS NOT NULL;

      ALTER TABLE token_ledger ADD CONSTRAINT token_ledger_idempotency_key
        UNIQUE(user_id, reference_id, ledger_type);
    END IF;
  END IF;
END $$;

-- ─── 7. Create tier config audit table ──────────────────────────────
CREATE TABLE IF NOT EXISTS tier_config_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_id UUID REFERENCES loyalty_tiers(id) ON DELETE CASCADE,
  tier_name VARCHAR(50) NOT NULL,
  changed_by_user_id UUID REFERENCES users(id),
  field_name VARCHAR(100) NOT NULL,
  old_value TEXT,
  new_value TEXT,
  change_reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tier_config_audit_tier ON tier_config_audit(tier_id);
CREATE INDEX IF NOT EXISTS idx_tier_config_audit_date ON tier_config_audit(created_at DESC);

-- ─── 8. Create EAZY PASS scan log (immutable, append-only audit) ────
-- Every QR scan verification is logged here for fraud detection
CREATE TABLE IF NOT EXISTS eazy_pass_scan_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scanned_by_user_id UUID REFERENCES users(id),
  scanned_by_partner_id UUID,
  scanned_user_id UUID REFERENCES users(id),
  card_number VARCHAR(30),
  result VARCHAR(30) NOT NULL DEFAULT 'invalid',
    -- valid | expired | invalid | invalid_signature | card_reissued
  ip_address VARCHAR(45),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Scan log indexes: search by card, by scanned user, by date
CREATE INDEX IF NOT EXISTS idx_scan_log_card ON eazy_pass_scan_log(card_number);
CREATE INDEX IF NOT EXISTS idx_scan_log_user ON eazy_pass_scan_log(scanned_user_id);
CREATE INDEX IF NOT EXISTS idx_scan_log_date ON eazy_pass_scan_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scan_log_result ON eazy_pass_scan_log(result) WHERE result != 'valid';

-- ─── 9. Performance indexes ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_tier_card_number ON users(tier_card_number) WHERE tier_card_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_loyalty_tiers_active ON loyalty_tiers(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_token_ledger_ref ON token_ledger(reference_id) WHERE reference_id IS NOT NULL;
