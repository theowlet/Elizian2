-- ============================================
-- ENTERPRISE ANALYTICS DASHBOARD
-- Saved views, indexes for filter-driven analytics
-- ============================================

-- 1. Saved dashboard views (user-scoped, role-scoped)
CREATE TABLE IF NOT EXISTS dashboard_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'partner')),
  view_name VARCHAR(255) NOT NULL,
  filter_json JSONB NOT NULL DEFAULT '{}',
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dashboard_views_user_role_name
  ON dashboard_views(user_id, role, view_name);
CREATE INDEX IF NOT EXISTS idx_dashboard_views_user_role
  ON dashboard_views(user_id, role);
CREATE INDEX IF NOT EXISTS idx_dashboard_views_default
  ON dashboard_views(user_id, role) WHERE is_default = true;

COMMENT ON TABLE dashboard_views IS 'Saved filter states for enterprise analytics dashboard; user-scoped.';

-- 2. Analytics query performance (bookings + partner_offers)
CREATE INDEX IF NOT EXISTS idx_bookings_analytics_partner_created
  ON bookings(partner_id, created_at)
  WHERE partner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_analytics_deal_created
  ON bookings(deal_id, created_at)
  WHERE deal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_analytics_user_partner
  ON bookings(user_id, partner_id);
CREATE INDEX IF NOT EXISTS idx_bookings_analytics_created
  ON bookings(created_at DESC);

-- partner_offers: index for deal filter (category is on partners, not partner_offers)
CREATE INDEX IF NOT EXISTS idx_partner_offers_partner_id
  ON partner_offers(partner_id);
