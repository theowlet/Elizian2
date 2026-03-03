-- Admin tier change: extend reason column for full audit trail
-- Supports dual-auth tier changes with mandatory reason (non-repudiable audit)

ALTER TABLE user_tier_history
  ALTER COLUMN reason TYPE VARCHAR(500);

COMMENT ON COLUMN user_tier_history.reason IS 'Admin-provided reason for tier change; stored for audit. Full details in audit_log meta.';
