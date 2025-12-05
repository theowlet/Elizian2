-- Add GST number column to partners table
-- GST number format: 15 characters (e.g., 22AAAAA0000A1Z5)

ALTER TABLE partners
ADD COLUMN IF NOT EXISTS gst_number VARCHAR(15);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_partners_gst_number ON partners(gst_number) WHERE gst_number IS NOT NULL;

-- Add comment
COMMENT ON COLUMN partners.gst_number IS 'GST (Goods and Services Tax) registration number - 15 characters format';

