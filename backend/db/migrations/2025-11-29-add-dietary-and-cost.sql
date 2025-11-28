-- Add dietary preferences and average cost fields for dining venues
ALTER TABLE partners
ADD COLUMN IF NOT EXISTS dietary_preferences TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS avg_cost_for_two NUMERIC(10,2);

COMMENT ON COLUMN partners.dietary_preferences IS 'Array of dietary preference tags (e.g., vegetarian, vegan, halal)';
COMMENT ON COLUMN partners.avg_cost_for_two IS 'Average meal cost for two people (in INR)';

