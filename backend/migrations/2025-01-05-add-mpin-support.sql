-- Migration: Add M-PIN support to user authentication
-- Date: 2025-01-05
-- Purpose: Enable 4-digit M-PIN login for faster authentication

-- ==========================================
-- 1. Add M-PIN hash column to user_auth_credentials
-- ==========================================

ALTER TABLE user_auth_credentials 
  ADD COLUMN IF NOT EXISTS mpin_hash VARCHAR(255),
  ADD COLUMN IF NOT EXISTS mpin_set_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS mpin_failed_attempts INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mpin_locked_until TIMESTAMP;

COMMENT ON COLUMN user_auth_credentials.mpin_hash IS 'Bcrypt hash of 4-digit M-PIN';
COMMENT ON COLUMN user_auth_credentials.mpin_set_at IS 'Timestamp when M-PIN was first set';
COMMENT ON COLUMN user_auth_credentials.mpin_failed_attempts IS 'Number of consecutive failed M-PIN attempts';
COMMENT ON COLUMN user_auth_credentials.mpin_locked_until IS 'Account locked until this timestamp after too many failed attempts';

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_auth_mpin_hash 
  ON user_auth_credentials(user_id) 
  WHERE mpin_hash IS NOT NULL;

