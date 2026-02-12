-- ============================================
-- Elizian vs Blackbird Gap Analysis - Phase 1 & 2
-- Venue detail, reviews, guest CRM, per-venue tiers, perks, geo check-in, tipping
-- ============================================

-- 1. Venue reviews (social proof)
CREATE TABLE IF NOT EXISTS venue_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  rating SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title VARCHAR(200),
  comment TEXT,
  is_verified_visit BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(partner_id, user_id, booking_id)
);
CREATE INDEX IF NOT EXISTS idx_venue_reviews_partner ON venue_reviews(partner_id);
CREATE INDEX IF NOT EXISTS idx_venue_reviews_user ON venue_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_venue_reviews_created ON venue_reviews(created_at DESC);
COMMENT ON TABLE venue_reviews IS 'Ratings and reviews for venues (post-visit social proof)';

-- 2. Partner guest notes (Guest CRM - merchant notes per guest)
CREATE TABLE IF NOT EXISTS partner_guest_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_by_partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_partner_guest_notes_partner_user ON partner_guest_notes(partner_id, user_id);
COMMENT ON TABLE partner_guest_notes IS 'Merchant notes on guests for CRM';

-- 3. Per-venue custom tiers (each venue can define own tier names/thresholds)
CREATE TABLE IF NOT EXISTS partner_venue_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  tier_name VARCHAR(80) NOT NULL,
  tier_level SMALLINT NOT NULL DEFAULT 1,
  min_visits_or_spend JSONB, -- e.g. {"min_visits": 5} or {"min_spend": 10000}
  perks_description TEXT,
  display_order SMALLINT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(partner_id, tier_level)
);
CREATE INDEX IF NOT EXISTS idx_partner_venue_tiers_partner ON partner_venue_tiers(partner_id);
COMMENT ON TABLE partner_venue_tiers IS 'Per-venue custom loyalty tier names and perks';

-- 4. Tangible perks (free items, secret menu, priority access) - add to partner_offers
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'partner_offers' AND column_name = 'perk_type') THEN
    ALTER TABLE partner_offers ADD COLUMN perk_type VARCHAR(50) DEFAULT 'discount';
    COMMENT ON COLUMN partner_offers.perk_type IS 'discount|free_item|secret_menu|priority_access|other';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'partner_offers' AND column_name = 'perk_description') THEN
    ALTER TABLE partner_offers ADD COLUMN perk_description TEXT;
  END IF;
END $$;

-- 5. Geo-verified check-in: add lat/lon to redemption_audit
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'redemption_audit' AND column_name = 'redemption_latitude') THEN
    ALTER TABLE redemption_audit ADD COLUMN redemption_latitude DECIMAL(10, 8);
    ALTER TABLE redemption_audit ADD COLUMN redemption_longitude DECIMAL(11, 8);
    ALTER TABLE redemption_audit ADD COLUMN geo_verified BOOLEAN DEFAULT false;
    COMMENT ON COLUMN redemption_audit.redemption_latitude IS 'Device latitude at time of redemption for geo-verification';
    COMMENT ON COLUMN redemption_audit.geo_verified IS 'True if redemption was within venue geo-fence';
  END IF;
END $$;

-- 6. In-app tips
CREATE TABLE IF NOT EXISTS tips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  amount_decimal DECIMAL(12, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'INR',
  payment_method VARCHAR(50), -- 'ezt' | 'upi_link' | 'external'
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_tips_partner ON tips(partner_id);
CREATE INDEX IF NOT EXISTS idx_tips_user ON tips(from_user_id);
CREATE INDEX IF NOT EXISTS idx_tips_created ON tips(created_at DESC);
COMMENT ON TABLE tips IS 'In-app tipping from consumer to venue';

-- 7. Merchant push / notifications to guests (segment targeting)
CREATE TABLE IF NOT EXISTS partner_notification_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  body TEXT NOT NULL,
  segment_filter JSONB, -- e.g. {"min_visits": 2, "tier": "Nova"}
  scheduled_at TIMESTAMP,
  sent_at TIMESTAMP,
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sent', 'cancelled')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_partner_campaigns_partner ON partner_notification_campaigns(partner_id);
COMMENT ON TABLE partner_notification_campaigns IS 'Merchant-initiated push/notification campaigns to guests';

-- 8. Aggregate rating on partners for quick display
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'partners' AND column_name = 'review_count') THEN
    ALTER TABLE partners ADD COLUMN IF NOT EXISTS review_count INT DEFAULT 0;
    ALTER TABLE partners ADD COLUMN IF NOT EXISTS average_rating DECIMAL(3, 2);
    COMMENT ON COLUMN partners.review_count IS 'Denormalized count of venue_reviews';
    COMMENT ON COLUMN partners.average_rating IS 'Denormalized average of venue_reviews.rating';
  END IF;
END $$;
