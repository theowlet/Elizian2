-- Redemption: dispute window only (no mandatory customer confirmation)
-- Partner redeem = final. Customer may dispute within dispute_window_expires_at.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'redemption_audit' AND column_name = 'dispute_window_expires_at') THEN
    ALTER TABLE redemption_audit ADD COLUMN dispute_window_expires_at TIMESTAMPTZ;
    COMMENT ON COLUMN redemption_audit.dispute_window_expires_at IS 'After this time the customer can no longer dispute this redemption (e.g. redeemed_at + 24h).';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_redemption_audit_dispute_window
  ON redemption_audit(dispute_window_expires_at)
  WHERE redemption_status = 'redeemed' AND dispute_window_expires_at IS NOT NULL;
