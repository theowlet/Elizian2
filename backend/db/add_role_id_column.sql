-- ============================================
-- Add role_id column to users table
-- Run this if role_id column is missing
-- ============================================

-- First, ensure roles table exists
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_name VARCHAR(50) NOT NULL UNIQUE,
  description TEXT,
  permissions JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default roles if they don't exist
INSERT INTO roles (role_name, description, permissions) VALUES
  ('super_admin', 'Global control of partners, events, analytics, and loyalty', 
   '{"read":["*"],"write":["*"],"delete":["*"],"admin":true}'),
  ('partner_admin', 'Manage own listings, offers, and bookings with scheduling', 
   '{"read":["own_partner"],"write":["own_offers","own_events"],"scan":["vouchers"]}'),
  ('user', 'Browse, book, earn loyalty points, and view QR vouchers', 
   '{"read":["events","offers"],"write":["bookings"]}')
ON CONFLICT (role_name) DO NOTHING;

-- Add role_id column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'role_id'
  ) THEN
    ALTER TABLE users ADD COLUMN role_id UUID REFERENCES roles(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id);
    
    -- Assign default 'user' role to existing users
    UPDATE users SET role_id = (SELECT id FROM roles WHERE role_name = 'user' LIMIT 1)
    WHERE role_id IS NULL;
    
    RAISE NOTICE 'Successfully added role_id column to users table';
  ELSE
    RAISE NOTICE 'role_id column already exists in users table';
  END IF;
END $$;

