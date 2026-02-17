-- Experience metadata: category-specific filterable fields per offer (partner_offers).
-- Backward compatible: listing works without this table; when present, enables dynamic filters.
-- offer_id = partner_offers.id (one row per offer).

CREATE TABLE IF NOT EXISTS experience_metadata (
  offer_id UUID PRIMARY KEY REFERENCES partner_offers(id) ON DELETE CASCADE,
  -- Dining
  cuisine TEXT[],
  meal_type TEXT[],
  -- Spa / Wellness
  service_type_list TEXT[],
  therapy_type TEXT[],
  duration_minutes INTEGER,
  -- Events
  event_type TEXT[],
  event_date DATE,
  seats_left INTEGER,
  -- Travel
  star_rating INTEGER,
  refundable BOOLEAN,
  breakfast_included BOOLEAN,
  -- Healthcare
  specialization TEXT[],
  consultation_fee INTEGER,
  verified BOOLEAN,
  -- Universal
  price_min INTEGER,
  price_max INTEGER,
  amenities TEXT[],
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_experience_metadata_price
  ON experience_metadata(price_min, price_max);
CREATE INDEX IF NOT EXISTS idx_experience_metadata_tags
  ON experience_metadata USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_experience_metadata_cuisine
  ON experience_metadata USING GIN(cuisine);
CREATE INDEX IF NOT EXISTS idx_experience_metadata_therapy_type
  ON experience_metadata USING GIN(therapy_type);
CREATE INDEX IF NOT EXISTS idx_experience_metadata_event_type
  ON experience_metadata USING GIN(event_type);
CREATE INDEX IF NOT EXISTS idx_experience_metadata_star_rating
  ON experience_metadata(star_rating);
CREATE INDEX IF NOT EXISTS idx_experience_metadata_duration
  ON experience_metadata(duration_minutes);

COMMENT ON TABLE experience_metadata IS 'Category-specific metadata for listing filters and card display; extends partner_offers.';
