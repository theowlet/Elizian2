-- Fix Multi-Tier Schema - Add Missing Columns and Constraints
-- Run this to fix the schema issues identified in the review

-- Add missing columns to partner_organizations
ALTER TABLE partner_organizations 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Add missing columns to partner_stores
ALTER TABLE partner_stores 
ADD COLUMN IF NOT EXISTS capacity INTEGER,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Add missing columns to partner_users
ALTER TABLE partner_users
ADD COLUMN IF NOT EXISTS email VARCHAR(255),
ADD COLUMN IF NOT EXISTS first_name VARCHAR(100),
ADD COLUMN IF NOT EXISTS last_name VARCHAR(100),
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Add missing columns to approval_requests
ALTER TABLE approval_requests
ADD COLUMN IF NOT EXISTS approved_by UUID,
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS comments TEXT;

-- Add missing columns to standardization_templates
ALTER TABLE standardization_templates
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Add missing columns to localization_settings
ALTER TABLE localization_settings
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES partner_organizations(id) ON DELETE CASCADE;

-- Add unique constraint for localization settings
ALTER TABLE localization_settings
ADD CONSTRAINT IF NOT EXISTS unique_localization_org UNIQUE (organization_id);

-- Create missing indexes for performance
CREATE INDEX IF NOT EXISTS idx_partner_users_organization ON partner_users(organization_id);
CREATE INDEX IF NOT EXISTS idx_partner_users_active ON partner_users(is_active);
CREATE INDEX IF NOT EXISTS idx_partner_stores_organization ON partner_stores(organization_id);
CREATE INDEX IF NOT EXISTS idx_partner_stores_active ON partner_stores(is_active);
CREATE INDEX IF NOT EXISTS idx_partner_organizations_parent ON partner_organizations(parent_org_id);
CREATE INDEX IF NOT EXISTS idx_partner_organizations_active ON partner_organizations(is_active);
CREATE INDEX IF NOT EXISTS idx_approval_requests_org ON approval_requests(organization_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON approval_requests(status);
CREATE INDEX IF NOT EXISTS idx_templates_org ON standardization_templates(organization_id);
CREATE INDEX IF NOT EXISTS idx_templates_type ON standardization_templates(template_type);

-- Add foreign key constraints if missing
ALTER TABLE partner_users
ADD CONSTRAINT IF NOT EXISTS fk_partner_users_organization 
FOREIGN KEY (organization_id) REFERENCES partner_organizations(id) ON DELETE CASCADE;

ALTER TABLE partner_stores
ADD CONSTRAINT IF NOT EXISTS fk_partner_stores_organization 
FOREIGN KEY (organization_id) REFERENCES partner_organizations(id) ON DELETE CASCADE;

ALTER TABLE approval_requests
ADD CONSTRAINT IF NOT EXISTS fk_approval_requests_organization 
FOREIGN KEY (organization_id) REFERENCES partner_organizations(id) ON DELETE CASCADE;

ALTER TABLE approval_requests
ADD CONSTRAINT IF NOT EXISTS fk_approval_requests_requester 
FOREIGN KEY (requester_id) REFERENCES partner_users(id) ON DELETE CASCADE;

ALTER TABLE standardization_templates
ADD CONSTRAINT IF NOT EXISTS fk_templates_organization 
FOREIGN KEY (organization_id) REFERENCES partner_organizations(id) ON DELETE CASCADE;

-- Create partner_analytics table if it doesn't exist
CREATE TABLE IF NOT EXISTS partner_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES partner_organizations(id) ON DELETE CASCADE,
    revenue DECIMAL(12,2) DEFAULT 0,
    performance_score DECIMAL(3,2) DEFAULT 0,
    customer_satisfaction DECIMAL(3,2) DEFAULT 0,
    operational_efficiency DECIMAL(3,2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partner_analytics_org ON partner_analytics(organization_id);
CREATE INDEX IF NOT EXISTS idx_partner_analytics_created ON partner_analytics(created_at);

-- Verify all tables exist and have required columns
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name IN (
    'partner_organizations',
    'partner_stores', 
    'partner_users',
    'approval_requests',
    'standardization_templates',
    'localization_settings',
    'partner_analytics'
)
ORDER BY table_name, ordinal_position;

