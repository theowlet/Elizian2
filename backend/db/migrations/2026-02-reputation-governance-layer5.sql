-- ============================================
-- Reputation: Layer 5 (anomaly), governance (dispute, malicious, block user).
-- Additive only: new columns and one new table. No ALTER that removes or breaks existing data.
-- ============================================

-- 1. reputation_reviews: IP for anomaly; admin malicious; partner dispute
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'reputation_reviews' AND column_name = 'ip_address') THEN
    ALTER TABLE reputation_reviews ADD COLUMN ip_address VARCHAR(45);
    COMMENT ON COLUMN reputation_reviews.ip_address IS 'Client IP at submit; used for L5 same-IP anomaly';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'reputation_reviews' AND column_name = 'marked_malicious_at') THEN
    ALTER TABLE reputation_reviews ADD COLUMN marked_malicious_at TIMESTAMPTZ;
    ALTER TABLE reputation_reviews ADD COLUMN marked_malicious_by UUID;
    COMMENT ON COLUMN reputation_reviews.marked_malicious_at IS 'Set by admin when review is marked malicious';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'reputation_reviews' AND column_name = 'dispute_requested_at') THEN
    ALTER TABLE reputation_reviews ADD COLUMN dispute_requested_at TIMESTAMPTZ;
    COMMENT ON COLUMN reputation_reviews.dispute_requested_at IS 'Partner requested dispute for admin review';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'reputation_reviews' AND column_name = 'dispute_requested_by') THEN
    ALTER TABLE reputation_reviews ADD COLUMN dispute_requested_by UUID REFERENCES partners(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'reputation_reviews' AND column_name = 'dispute_reason') THEN
    ALTER TABLE reputation_reviews ADD COLUMN dispute_reason TEXT;
  END IF;
END $$;

-- 2. Blocked users (cannot submit reviews until unblocked)
CREATE TABLE IF NOT EXISTS blocked_review_users (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  blocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  blocked_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE blocked_review_users IS 'Users blocked from submitting reviews (abuse threshold); admin only';

CREATE INDEX IF NOT EXISTS idx_blocked_review_users_blocked_at ON blocked_review_users(blocked_at);
