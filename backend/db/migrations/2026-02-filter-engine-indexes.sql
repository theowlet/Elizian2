-- Filter engine: indexes for offer list and partner filters (multi-vertical).
-- Safe to run multiple times (IF NOT EXISTS).

-- Offer list filters
CREATE INDEX IF NOT EXISTS idx_partner_offers_service_type ON partner_offers(service_type);
CREATE INDEX IF NOT EXISTS idx_partner_offers_trending_list ON partner_offers(is_trending) WHERE is_active = true;

-- Partner rating for min_rating filter
CREATE INDEX IF NOT EXISTS idx_partners_rating ON partners(rating) WHERE rating IS NOT NULL;

-- Geo: support distance filter / sort (bounding-box style use)
CREATE INDEX IF NOT EXISTS idx_partners_lat_lng ON partners(latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Featured/premium filter
CREATE INDEX IF NOT EXISTS idx_partners_approved_for_featured ON partners(approved_for_featured) WHERE approved_for_featured = true;
