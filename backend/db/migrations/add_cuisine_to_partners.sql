-- Add cuisine column to partners table
-- This allows partners (especially dining venues) to specify their cuisine types

ALTER TABLE partners 
ADD COLUMN IF NOT EXISTS cuisine_types TEXT[] DEFAULT '{}';

-- Add index for cuisine search
CREATE INDEX IF NOT EXISTS idx_partners_cuisine_types ON partners USING GIN(cuisine_types);

-- Add comment
COMMENT ON COLUMN partners.cuisine_types IS 'Array of cuisine types (e.g., ["indian", "chinese", "italian"]) for dining venues';

