-- Multi-Tier Partner Management System
-- This extends the existing partner system to support chains, franchises, and standalone businesses

-- Partner Organizations Table (Hierarchy Management)
CREATE TABLE IF NOT EXISTS partner_organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('standalone', 'chain', 'franchise', 'corporate')),
    parent_org_id UUID REFERENCES partner_organizations(id),
    tier_level INTEGER DEFAULT 1 CHECK (tier_level BETWEEN 1 AND 5), -- 1=Store, 2=Regional, 3=National, 4=Corporate, 5=Global
    organization_code VARCHAR(50) UNIQUE, -- Unique identifier like 'MC001' for McDonald's Store #001
    description TEXT,
    address JSONB,
    contact_info JSONB,
    business_license VARCHAR(255),
    tax_id VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Partner Users with Role-Based Access
CREATE TABLE IF NOT EXISTS partner_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES partner_organizations(id),
    user_type VARCHAR(50) NOT NULL CHECK (user_type IN (
        'store_manager', 'regional_manager', 'franchise_owner', 
        'corporate_admin', 'chain_owner', 'area_manager'
    )),
    permissions JSONB, -- Granular permissions stored as JSON
    access_level INTEGER DEFAULT 1 CHECK (access_level BETWEEN 1 AND 5),
    can_create_sub_orgs BOOLEAN DEFAULT false,
    can_approve_changes BOOLEAN DEFAULT false,
    budget_limit DECIMAL(15,2), -- Spending limit for approvals
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Partner Stores (Individual Locations)
CREATE TABLE IF NOT EXISTS partner_stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES partner_organizations(id),
    parent_store_id UUID REFERENCES partner_stores(id), -- For store chains
    store_name VARCHAR(255) NOT NULL,
    store_code VARCHAR(50) UNIQUE NOT NULL, -- Unique store identifier
    store_type VARCHAR(50) DEFAULT 'standalone' CHECK (store_type IN ('standalone', 'chain_store', 'franchise_store')),
    address JSONB NOT NULL,
    contact_info JSONB,
    local_manager_id UUID REFERENCES partner_users(id),
    opening_date DATE,
    closing_date DATE,
    store_hours JSONB,
    capacity INTEGER,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Standardization Templates
CREATE TABLE IF NOT EXISTS standardization_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES partner_organizations(id),
    template_type VARCHAR(50) NOT NULL CHECK (template_type IN ('menu', 'pricing', 'offers', 'branding', 'policies')),
    template_name VARCHAR(255) NOT NULL,
    template_data JSONB NOT NULL, -- Template configuration
    is_mandatory BOOLEAN DEFAULT false,
    can_be_customized BOOLEAN DEFAULT true,
    customization_rules JSONB, -- Rules for what can be customized
    created_by UUID REFERENCES partner_users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Approval Workflows
CREATE TABLE IF NOT EXISTS approval_workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES partner_organizations(id),
    workflow_type VARCHAR(50) NOT NULL CHECK (workflow_type IN ('menu_change', 'pricing_change', 'offer_creation', 'brand_customization')),
    trigger_level INTEGER NOT NULL, -- Which level can trigger this workflow
    approval_level INTEGER NOT NULL, -- Which level needs to approve
    auto_approve_conditions JSONB, -- Conditions for auto-approval
    escalation_rules JSONB, -- Rules for escalation
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Approval Requests
CREATE TABLE IF NOT EXISTS approval_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES approval_workflows(id),
    requester_id UUID NOT NULL REFERENCES partner_users(id),
    approver_id UUID REFERENCES partner_users(id),
    request_type VARCHAR(50) NOT NULL,
    request_data JSONB NOT NULL, -- The change being requested
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'escalated')),
    approval_notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Multi-Level Analytics
CREATE TABLE IF NOT EXISTS partner_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES partner_organizations(id),
    store_id UUID REFERENCES partner_stores(id),
    metric_type VARCHAR(50) NOT NULL,
    metric_data JSONB NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    aggregation_level VARCHAR(50) NOT NULL CHECK (aggregation_level IN ('store', 'regional', 'national', 'corporate')),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Localization Settings
CREATE TABLE IF NOT EXISTS localization_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES partner_organizations(id),
    store_id UUID REFERENCES partner_stores(id),
    language VARCHAR(10) DEFAULT 'en',
    currency VARCHAR(10) DEFAULT 'INR',
    timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',
    date_format VARCHAR(20) DEFAULT 'DD/MM/YYYY',
    cultural_preferences JSONB,
    local_customizations JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Quality Control Standards
CREATE TABLE IF NOT EXISTS quality_standards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES partner_organizations(id),
    standard_type VARCHAR(50) NOT NULL CHECK (standard_type IN ('service', 'food_safety', 'branding', 'customer_experience')),
    standard_name VARCHAR(255) NOT NULL,
    standard_description TEXT,
    compliance_requirements JSONB,
    audit_frequency VARCHAR(50), -- daily, weekly, monthly, quarterly
    is_mandatory BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Compliance Audits
CREATE TABLE IF NOT EXISTS compliance_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES partner_organizations(id),
    store_id UUID REFERENCES partner_stores(id),
    standard_id UUID NOT NULL REFERENCES quality_standards(id),
    auditor_id UUID REFERENCES partner_users(id),
    audit_date DATE NOT NULL,
    compliance_score INTEGER CHECK (compliance_score BETWEEN 0 AND 100),
    findings JSONB,
    recommendations TEXT,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'passed', 'failed', 'needs_improvement')),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_partner_organizations_parent ON partner_organizations(parent_org_id);
CREATE INDEX IF NOT EXISTS idx_partner_organizations_type ON partner_organizations(type);
CREATE INDEX IF NOT EXISTS idx_partner_users_organization ON partner_users(organization_id);
CREATE INDEX IF NOT EXISTS idx_partner_stores_organization ON partner_stores(organization_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON approval_requests(status);
CREATE INDEX IF NOT EXISTS idx_partner_analytics_organization ON partner_analytics(organization_id);
CREATE INDEX IF NOT EXISTS idx_partner_analytics_period ON partner_analytics(period_start, period_end);

-- Insert Sample Data with proper UUIDs
INSERT INTO partner_organizations (id, name, type, tier_level, organization_code, description) VALUES
('550e8400-e29b-41d4-a716-446655440001', 'McDonald''s India', 'corporate', 5, 'MC-CORP', 'Corporate headquarters for McDonald''s India operations'),
('550e8400-e29b-41d4-a716-446655440002', 'McDonald''s Mumbai Region', 'chain', 3, 'MC-MUM', 'Mumbai regional operations for McDonald''s'),
('550e8400-e29b-41d4-a716-446655440003', 'McDonald''s Andheri Franchise', 'franchise', 2, 'MC-AND', 'Andheri franchise location'),
('550e8400-e29b-41d4-a716-446655440004', 'McDonald''s Andheri Store #1', 'standalone', 1, 'MC-AND-001', 'Individual store location');

-- Set up hierarchy
UPDATE partner_organizations SET parent_org_id = '550e8400-e29b-41d4-a716-446655440002' WHERE id = '550e8400-e29b-41d4-a716-446655440003';
UPDATE partner_organizations SET parent_org_id = '550e8400-e29b-41d4-a716-446655440003' WHERE id = '550e8400-e29b-41d4-a716-446655440004';
UPDATE partner_organizations SET parent_org_id = '550e8400-e29b-41d4-a716-446655440001' WHERE id = '550e8400-e29b-41d4-a716-446655440002';

-- Insert sample users
INSERT INTO partner_users (id, organization_id, user_type, permissions, access_level) VALUES
('650e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440001', 'corporate_admin', '{"can_manage_all": true, "can_approve_all": true}', 5),
('650e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440002', 'regional_manager', '{"can_manage_region": true, "can_approve_stores": true}', 3),
('650e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440003', 'franchise_owner', '{"can_manage_franchise": true, "can_customize_local": true}', 2),
('650e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440004', 'store_manager', '{"can_manage_store": true, "can_create_offers": true}', 1);

-- Insert sample stores
INSERT INTO partner_stores (id, organization_id, store_name, store_code, store_type, address) VALUES
('750e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440004', 'McDonald''s Andheri West', 'MC-AND-001', 'franchise_store', 
 '{"street": "Andheri West", "city": "Mumbai", "state": "Maharashtra", "pincode": "400058"}');

-- Insert sample templates
INSERT INTO standardization_templates (id, organization_id, template_type, template_name, template_data, is_mandatory) VALUES
('850e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440001', 'menu', 'Standard McDonald''s Menu', 
 '{"items": ["Big Mac", "McChicken", "French Fries", "Coca Cola"], "pricing": "standard"}', true),
('850e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440002', 'offers', 'Regional Offers Template', 
 '{"offer_types": ["combo_offers", "happy_hour", "festival_specials"], "discount_limits": {"max": 30}}', false);
