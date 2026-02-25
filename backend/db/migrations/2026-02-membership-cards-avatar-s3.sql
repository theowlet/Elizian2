-- Additive only: per-card avatar fields (S3 URLs only, no base64).
-- Fallback: when avatar_type IS NULL use profile_photo_url.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_venue_membership_cards') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_venue_membership_cards' AND column_name = 'avatar_type') THEN
      ALTER TABLE user_venue_membership_cards ADD COLUMN avatar_type VARCHAR(32) NULL;
      COMMENT ON COLUMN user_venue_membership_cards.avatar_type IS 'profile | custom | filtered; NULL = use user profile_photo_url';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_venue_membership_cards' AND column_name = 'avatar_original_url') THEN
      ALTER TABLE user_venue_membership_cards ADD COLUMN avatar_original_url TEXT NULL;
      COMMENT ON COLUMN user_venue_membership_cards.avatar_original_url IS 'S3 URL of original upload; never base64';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_venue_membership_cards' AND column_name = 'avatar_display_url') THEN
      ALTER TABLE user_venue_membership_cards ADD COLUMN avatar_display_url TEXT NULL;
      COMMENT ON COLUMN user_venue_membership_cards.avatar_display_url IS 'S3 URL of thumbnail/display image for card';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_venue_membership_cards' AND column_name = 'avatar_filter_type') THEN
      ALTER TABLE user_venue_membership_cards ADD COLUMN avatar_filter_type TEXT NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_venue_membership_cards' AND column_name = 'avatar_metadata') THEN
      ALTER TABLE user_venue_membership_cards ADD COLUMN avatar_metadata JSONB NULL;
      COMMENT ON COLUMN user_venue_membership_cards.avatar_metadata IS 'Filter/builder config; no image data';
    END IF;
  END IF;
END $$;
