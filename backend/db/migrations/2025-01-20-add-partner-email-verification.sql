-- Add email verification support for partners
ALTER TABLE partners
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP;

-- Create partner email verification tokens table
CREATE TABLE IF NOT EXISTS partner_email_verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  token VARCHAR(500) NOT NULL UNIQUE,
  is_used BOOLEAN DEFAULT false,
  used_at TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_partner_email_tokens_partner_id ON partner_email_verification_tokens(partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_email_tokens_token ON partner_email_verification_tokens(token);
CREATE INDEX IF NOT EXISTS idx_partner_email_tokens_email ON partner_email_verification_tokens(email);

COMMENT ON COLUMN partners.email_verified IS 'Whether the partner email has been verified';
COMMENT ON COLUMN partners.email_verified_at IS 'Timestamp when email was verified';
COMMENT ON TABLE partner_email_verification_tokens IS 'Stores email verification tokens for partners';

