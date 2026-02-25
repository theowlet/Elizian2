-- ============================================
-- Elizian Reputation & Intelligence System
-- Additive-only: NEW tables only. No ALTER on existing schema.
-- No changes to redemption_audit, venue_reviews, messaging, or auth.
-- ============================================

-- 1. Reviews (transactional; one per redemption; moderation-ready)
CREATE TABLE IF NOT EXISTS reputation_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  redemption_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  sentiment_score NUMERIC(5, 4),
  toxicity_score NUMERIC(5, 4),
  spam_score NUMERIC(5, 4),
  moderation_status VARCHAR(20) NOT NULL DEFAULT 'APPROVED'
    CHECK (moderation_status IN ('APPROVED', 'FLAGGED', 'REJECTED')),
  is_visible BOOLEAN NOT NULL DEFAULT true,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(redemption_id)
);

COMMENT ON TABLE reputation_reviews IS 'Reputation intelligence: one review per successful redemption; moderation and scoring';
COMMENT ON COLUMN reputation_reviews.redemption_id IS 'Links to redemption_audit.id; one review per redemption';
COMMENT ON COLUMN reputation_reviews.sentiment_score IS 'Sentiment -1 to +1';
COMMENT ON COLUMN reputation_reviews.toxicity_score IS 'Toxicity 0-1';
COMMENT ON COLUMN reputation_reviews.spam_score IS 'Spam likelihood 0-1';
COMMENT ON COLUMN reputation_reviews.deleted_at IS 'Soft delete only; no hard delete';

-- FK to redemption_audit (optional to avoid breaking if table name differs)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'reputation_reviews' AND constraint_name = 'reputation_reviews_redemption_id_fkey'
  ) AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'redemption_audit') THEN
    ALTER TABLE reputation_reviews
      ADD CONSTRAINT reputation_reviews_redemption_id_fkey
      FOREIGN KEY (redemption_id) REFERENCES redemption_audit(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_reputation_reviews_partner_id ON reputation_reviews(partner_id);
CREATE INDEX IF NOT EXISTS idx_reputation_reviews_moderation_status ON reputation_reviews(moderation_status);
CREATE INDEX IF NOT EXISTS idx_reputation_reviews_created_at ON reputation_reviews(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reputation_reviews_rating ON reputation_reviews(rating);
CREATE INDEX IF NOT EXISTS idx_reputation_reviews_user_id ON reputation_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_reputation_reviews_visible ON reputation_reviews(partner_id, is_visible) WHERE deleted_at IS NULL;

-- 2. Review audit log (append-only)
CREATE TABLE IF NOT EXISTS review_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID NOT NULL REFERENCES reputation_reviews(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  actor_id UUID,
  actor_role TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE review_audit_logs IS 'Append-only audit trail for all review actions (moderation, dispute, restore, etc.)';
CREATE INDEX IF NOT EXISTS idx_review_audit_logs_review_id ON review_audit_logs(review_id);
CREATE INDEX IF NOT EXISTS idx_review_audit_logs_created_at ON review_audit_logs(created_at DESC);

-- 3. Partner review settings (per-partner controls)
CREATE TABLE IF NOT EXISTS partner_review_settings (
  partner_id UUID PRIMARY KEY REFERENCES partners(id) ON DELETE CASCADE,
  reviews_enabled BOOLEAN NOT NULL DEFAULT true,
  comments_enabled BOOLEAN NOT NULL DEFAULT true,
  auto_moderation_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE partner_review_settings IS 'Partner-level controls for reputation: enable/disable reviews and auto-moderation';

-- 4. Review analytics (derived metrics; updated by job or event)
CREATE TABLE IF NOT EXISTS review_analytics (
  partner_id UUID PRIMARY KEY REFERENCES partners(id) ON DELETE CASCADE,
  rolling_avg_rating NUMERIC(5, 2),
  trend_30_day NUMERIC(5, 2),
  sentiment_avg NUMERIC(5, 4),
  flag_ratio NUMERIC(5, 4),
  risk_score NUMERIC(5, 4),
  review_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE review_analytics IS 'Precomputed reputation metrics; do not aggregate at runtime';
