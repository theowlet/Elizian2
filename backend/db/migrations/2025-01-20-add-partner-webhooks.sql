-- Add webhook support for partners
CREATE TABLE IF NOT EXISTS partner_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  webhook_url VARCHAR(500) NOT NULL,
  secret_key VARCHAR(255),
  events TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(partner_id, webhook_url)
);

CREATE INDEX IF NOT EXISTS idx_partner_webhooks_partner_id ON partner_webhooks(partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_webhooks_active ON partner_webhooks(is_active) WHERE is_active = true;

COMMENT ON TABLE partner_webhooks IS 'Stores webhook configurations for partners';
COMMENT ON COLUMN partner_webhooks.events IS 'Array of event types to subscribe to (booking.created, booking.updated, order.created, etc.)';
COMMENT ON COLUMN partner_webhooks.secret_key IS 'HMAC secret for webhook signature verification';

