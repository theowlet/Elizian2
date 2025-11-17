-- ============================================
-- UNIVERSAL LIFECYCLE MANAGEMENT SYSTEM
-- Add lifecycle fields to menu_items table
-- ============================================

-- Add lifecycle columns to menu_items
ALTER TABLE menu_items
ADD COLUMN IF NOT EXISTS is_time_bound BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS start_time TIMESTAMP NULL,
ADD COLUMN IF NOT EXISTS end_time TIMESTAMP NULL,
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_menu_items_lifecycle 
ON menu_items(is_time_bound, end_time, status);

CREATE INDEX IF NOT EXISTS idx_menu_items_service_type_status 
ON menu_items(service_type, status, end_time);

-- Update existing event items to use lifecycle fields
UPDATE menu_items
SET 
  is_time_bound = true,
  start_time = CASE 
    WHEN event_date IS NOT NULL AND event_time IS NOT NULL 
    THEN (event_date + event_time)
    ELSE NULL
  END,
  end_time = CASE 
    WHEN event_date IS NOT NULL AND event_time IS NOT NULL 
    THEN (event_date + event_time + INTERVAL '3 hours')
    ELSE NULL
  END
WHERE service_type = 'events' 
  AND event_date IS NOT NULL 
  AND event_time IS NOT NULL
  AND is_time_bound = false;

-- Add comments for documentation
COMMENT ON COLUMN menu_items.is_time_bound IS 'Whether this service has time constraints (events, limited offers, etc.)';
COMMENT ON COLUMN menu_items.start_time IS 'Service start time (for events, bookings, etc.)';
COMMENT ON COLUMN menu_items.end_time IS 'Service end time - after this, service is considered expired';
COMMENT ON COLUMN menu_items.status IS 'active, expired, archived, cancelled';

-- Create function to automatically update status based on time
CREATE OR REPLACE FUNCTION update_service_lifecycle_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_time_bound AND NEW.end_time IS NOT NULL THEN
    IF NEW.end_time < CURRENT_TIMESTAMP THEN
      NEW.status := 'expired';
    ELSIF NEW.start_time IS NOT NULL AND NEW.start_time > CURRENT_TIMESTAMP THEN
      NEW.status := 'scheduled';
    ELSE
      NEW.status := 'active';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update status on insert/update
DROP TRIGGER IF EXISTS trigger_update_service_lifecycle ON menu_items;
CREATE TRIGGER trigger_update_service_lifecycle
  BEFORE INSERT OR UPDATE ON menu_items
  FOR EACH ROW
  EXECUTE FUNCTION update_service_lifecycle_status();

-- Display summary
SELECT 
  'Lifecycle fields added successfully' as message,
  COUNT(*) as total_items,
  COUNT(CASE WHEN is_time_bound THEN 1 END) as time_bound_items,
  COUNT(CASE WHEN status = 'active' THEN 1 END) as active_items,
  COUNT(CASE WHEN status = 'expired' THEN 1 END) as expired_items
FROM menu_items;

