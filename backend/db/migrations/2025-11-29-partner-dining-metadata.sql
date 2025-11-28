-- Add dietary preferences and average cost columns for dining partners
ALTER TABLE partners
    ADD COLUMN IF NOT EXISTS dietary_preferences TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS average_cost_for_two NUMERIC(10,2);

COMMENT ON COLUMN partners.dietary_preferences IS 'Array of dietary preference tags (e.g., vegetarian, vegan)';
COMMENT ON COLUMN partners.average_cost_for_two IS 'Average cost for two people in INR';

