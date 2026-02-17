-- Add breaks JSONB column to partner_hours (multiple breaks per day)
-- Safe: IF NOT EXISTS. Run after 2026-02-operating-hours-waitlist if that created partner_hours with only break_start/break_end.

ALTER TABLE partner_hours
ADD COLUMN IF NOT EXISTS breaks JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN partner_hours.breaks IS 'Array of {start, end} break periods; empty array = no breaks';

-- Optional: migrate existing single break to array (idempotent)
UPDATE partner_hours
SET breaks = jsonb_build_array(jsonb_build_object('start', break_start::text, 'end', break_end::text))
WHERE break_start IS NOT NULL AND break_end IS NOT NULL
  AND (breaks IS NULL OR breaks = '[]'::jsonb);
