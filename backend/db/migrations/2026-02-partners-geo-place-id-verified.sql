-- ============================================
-- Part A: Geo-enabled partner address
-- Add place_id, geo_verified, formatted_address to partners (additive only)
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'partners' AND column_name = 'place_id') THEN
    ALTER TABLE partners ADD COLUMN place_id VARCHAR(255);
    COMMENT ON COLUMN partners.place_id IS 'Google Places ID from Geocoding API for map links and future geo features';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'partners' AND column_name = 'geo_verified') THEN
    ALTER TABLE partners ADD COLUMN geo_verified BOOLEAN DEFAULT false;
    COMMENT ON COLUMN partners.geo_verified IS 'True when address was successfully geocoded (server-side Google Geocoding)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'partners' AND column_name = 'formatted_address') THEN
    ALTER TABLE partners ADD COLUMN formatted_address TEXT;
    COMMENT ON COLUMN partners.formatted_address IS 'Normalized address from Google Geocoding; original address field is unchanged';
  END IF;
END $$;
