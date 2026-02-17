-- ═══════════════════════════════════════════════════════════════════════
-- ELIZIAN DATA CONSISTENCY REPAIR SCRIPT
-- Run only after backup. Fixes: tier names (all tables), negative booked_count.
-- System truth: 5 tiers ONLY — Ather, Nova, Luminar, Valiant, Echelon.
-- Any other tier (Aether, Beacon, Crest, Ascend, or unknown) is normalized.
-- Safe to run multiple times (idempotent).
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- 0) Update loyalty_tiers and tiers FIRST (trigger on users syncs current_tier_id from loyalty_tiers by tier_name)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'loyalty_tiers') THEN
    UPDATE loyalty_tiers SET tier_name = 'Ather' WHERE tier_level = 1 AND LOWER(TRIM(tier_name)) IN ('aether', 'ather');
    UPDATE loyalty_tiers SET tier_name = 'Nova'    WHERE tier_name = 'Beacon';
    UPDATE loyalty_tiers SET tier_name = 'Luminar' WHERE tier_name = 'Crest';
    UPDATE loyalty_tiers SET tier_name = 'Valiant' WHERE tier_name = 'Ascend';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tiers') THEN
    UPDATE tiers SET name = 'Ather'   WHERE name IS NOT NULL AND LOWER(TRIM(name)) = 'aether';
    UPDATE tiers SET name = 'Nova'    WHERE name = 'Beacon';
    UPDATE tiers SET name = 'Luminar' WHERE name = 'Crest';
    UPDATE tiers SET name = 'Valiant' WHERE name = 'Ascend';
  END IF;
END $$;

-- 1) Known alias -> canonical (Aether -> Ather; Beacon/Crest/Ascend -> Nova/Luminar/Valiant)
UPDATE users SET current_tier_name = 'Ather' WHERE current_tier_name IS NOT NULL AND LOWER(TRIM(current_tier_name)) = 'aether';
UPDATE users SET previous_tier_name = 'Ather' WHERE previous_tier_name IS NOT NULL AND LOWER(TRIM(previous_tier_name)) = 'aether';
UPDATE bookings SET user_tier_at_booking = 'Ather' WHERE user_tier_at_booking IS NOT NULL AND LOWER(TRIM(user_tier_at_booking)) = 'aether';

UPDATE users SET current_tier_name = 'Nova'    WHERE current_tier_name = 'Beacon';
UPDATE users SET current_tier_name = 'Luminar' WHERE current_tier_name = 'Crest';
UPDATE users SET current_tier_name = 'Valiant' WHERE current_tier_name = 'Ascend';
UPDATE users SET previous_tier_name = 'Nova'    WHERE previous_tier_name = 'Beacon';
UPDATE users SET previous_tier_name = 'Luminar' WHERE previous_tier_name = 'Crest';
UPDATE users SET previous_tier_name = 'Valiant' WHERE previous_tier_name = 'Ascend';
UPDATE bookings SET user_tier_at_booking = 'Nova'    WHERE user_tier_at_booking = 'Beacon';
UPDATE bookings SET user_tier_at_booking = 'Luminar' WHERE user_tier_at_booking = 'Crest';
UPDATE bookings SET user_tier_at_booking = 'Valiant' WHERE user_tier_at_booking = 'Ascend';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_tier_history') THEN
    UPDATE user_tier_history SET from_tier_name = 'Ather' WHERE from_tier_name IS NOT NULL AND LOWER(TRIM(from_tier_name)) = 'aether';
    UPDATE user_tier_history SET to_tier_name   = 'Ather' WHERE to_tier_name   IS NOT NULL AND LOWER(TRIM(to_tier_name))   = 'aether';
    UPDATE user_tier_history SET from_tier_name = 'Nova'    WHERE from_tier_name = 'Beacon';
    UPDATE user_tier_history SET from_tier_name = 'Luminar' WHERE from_tier_name = 'Crest';
    UPDATE user_tier_history SET from_tier_name = 'Valiant' WHERE from_tier_name = 'Ascend';
    UPDATE user_tier_history SET to_tier_name   = 'Nova'    WHERE to_tier_name   = 'Beacon';
    UPDATE user_tier_history SET to_tier_name   = 'Luminar' WHERE to_tier_name   = 'Crest';
    UPDATE user_tier_history SET to_tier_name   = 'Valiant' WHERE to_tier_name   = 'Ascend';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'booking_waitlist') THEN
    UPDATE booking_waitlist SET user_tier = 'Ather' WHERE user_tier IS NOT NULL AND LOWER(TRIM(user_tier)) = 'aether';
    UPDATE booking_waitlist SET user_tier = 'Nova'    WHERE user_tier = 'Beacon';
    UPDATE booking_waitlist SET user_tier = 'Luminar' WHERE user_tier = 'Crest';
    UPDATE booking_waitlist SET user_tier = 'Valiant' WHERE user_tier = 'Ascend';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'partner_offers' AND column_name = 'min_tier_name') THEN
    UPDATE partner_offers SET min_tier_name = 'Ather' WHERE min_tier_name IS NOT NULL AND LOWER(TRIM(min_tier_name)) = 'aether';
    UPDATE partner_offers SET min_tier_name = 'Nova'    WHERE min_tier_name = 'Beacon';
    UPDATE partner_offers SET min_tier_name = 'Luminar' WHERE min_tier_name = 'Crest';
    UPDATE partner_offers SET min_tier_name = 'Valiant' WHERE min_tier_name = 'Ascend';
  END IF;
  -- loyalty_tiers/tiers already updated in step 0; no duplicate here
END $$;

-- 2) Catch-all: any scalar tier NOT IN (Ather, Nova, Luminar, Valiant, Echelon) -> Ather
UPDATE users SET current_tier_name = 'Ather' WHERE current_tier_name IS NOT NULL AND current_tier_name NOT IN ('Ather','Nova','Luminar','Valiant','Echelon');
UPDATE users SET previous_tier_name = 'Ather' WHERE previous_tier_name IS NOT NULL AND previous_tier_name NOT IN ('Ather','Nova','Luminar','Valiant','Echelon');
UPDATE bookings SET user_tier_at_booking = 'Ather' WHERE user_tier_at_booking IS NOT NULL AND user_tier_at_booking NOT IN ('Ather','Nova','Luminar','Valiant','Echelon');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_tier_history') THEN
    UPDATE user_tier_history SET from_tier_name = 'Ather' WHERE from_tier_name IS NOT NULL AND from_tier_name NOT IN ('Ather','Nova','Luminar','Valiant','Echelon');
    UPDATE user_tier_history SET to_tier_name   = 'Ather' WHERE to_tier_name   IS NOT NULL AND to_tier_name   NOT IN ('Ather','Nova','Luminar','Valiant','Echelon');
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'booking_waitlist') THEN
    UPDATE booking_waitlist SET user_tier = 'Ather' WHERE user_tier IS NOT NULL AND user_tier NOT IN ('Ather','Nova','Luminar','Valiant','Echelon');
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'partner_offers' AND column_name = 'min_tier_name') THEN
    UPDATE partner_offers SET min_tier_name = 'Ather' WHERE min_tier_name IS NOT NULL AND min_tier_name NOT IN ('Ather','Nova','Luminar','Valiant','Echelon');
  END IF;
  -- loyalty_tiers: map by tier_level so we don't collapse to Ather
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'loyalty_tiers') THEN
    UPDATE loyalty_tiers SET tier_name = 'Ather'   WHERE tier_level = 1 AND (tier_name IS NULL OR tier_name NOT IN ('Ather','Nova','Luminar','Valiant','Echelon'));
    UPDATE loyalty_tiers SET tier_name = 'Nova'    WHERE tier_level = 2 AND (tier_name IS NULL OR tier_name NOT IN ('Ather','Nova','Luminar','Valiant','Echelon'));
    UPDATE loyalty_tiers SET tier_name = 'Luminar' WHERE tier_level = 3 AND (tier_name IS NULL OR tier_name NOT IN ('Ather','Nova','Luminar','Valiant','Echelon'));
    UPDATE loyalty_tiers SET tier_name = 'Valiant' WHERE tier_level = 4 AND (tier_name IS NULL OR tier_name NOT IN ('Ather','Nova','Luminar','Valiant','Echelon'));
    UPDATE loyalty_tiers SET tier_name = 'Echelon' WHERE tier_level = 5 AND (tier_name IS NULL OR tier_name NOT IN ('Ather','Nova','Luminar','Valiant','Echelon'));
  END IF;
  -- legacy tiers table: map by level if column exists
  IF EXISTS (SELECT 1 FROM information_schema.tables t JOIN information_schema.columns c ON t.table_name = c.table_name AND t.table_schema = c.table_schema
             WHERE t.table_schema = 'public' AND t.table_name = 'tiers' AND c.column_name = 'level') THEN
    UPDATE tiers SET name = 'Ather'   WHERE "level" = 1 AND (name IS NULL OR name NOT IN ('Ather','Nova','Luminar','Valiant','Echelon'));
    UPDATE tiers SET name = 'Nova'    WHERE "level" = 2 AND (name IS NULL OR name NOT IN ('Ather','Nova','Luminar','Valiant','Echelon'));
    UPDATE tiers SET name = 'Luminar' WHERE "level" = 3 AND (name IS NULL OR name NOT IN ('Ather','Nova','Luminar','Valiant','Echelon'));
    UPDATE tiers SET name = 'Valiant' WHERE "level" = 4 AND (name IS NULL OR name NOT IN ('Ather','Nova','Luminar','Valiant','Echelon'));
    UPDATE tiers SET name = 'Echelon' WHERE "level" = 5 AND (name IS NULL OR name NOT IN ('Ather','Nova','Luminar','Valiant','Echelon'));
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tiers') THEN
    UPDATE tiers SET name = 'Ather' WHERE name IS NOT NULL AND name NOT IN ('Ather','Nova','Luminar','Valiant','Echelon');
  END IF;
END $$;

-- 3) Normalize target_tiers arrays in campaigns and campaign_targets (Beacon->Nova, etc.; unknown->Ather)
DO $$
DECLARE
  r RECORD;
  arr TEXT[];
  new_arr TEXT[];
  el TEXT;
  canonical TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'campaigns' AND column_name = 'target_tiers') THEN
    FOR r IN SELECT id, target_tiers FROM campaigns WHERE target_tiers IS NOT NULL AND array_length(target_tiers, 1) > 0
    LOOP
      new_arr := '{}';
      FOREACH el IN ARRAY r.target_tiers
      LOOP
        canonical := CASE el
          WHEN 'Aether' THEN 'Ather' WHEN 'Beacon' THEN 'Nova' WHEN 'Crest' THEN 'Luminar' WHEN 'Ascend' THEN 'Valiant'
          WHEN 'Ather' THEN 'Ather' WHEN 'Nova' THEN 'Nova' WHEN 'Luminar' THEN 'Luminar' WHEN 'Valiant' THEN 'Valiant' WHEN 'Echelon' THEN 'Echelon'
          ELSE 'Ather' END;
        new_arr := array_append(new_arr, canonical);
      END LOOP;
      UPDATE campaigns SET target_tiers = new_arr WHERE id = r.id;
    END LOOP;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'campaign_targets') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'campaign_targets' AND column_name = 'target_tiers') THEN
      FOR r IN SELECT id, target_tiers FROM campaign_targets WHERE target_tiers IS NOT NULL AND array_length(target_tiers, 1) > 0
      LOOP
        new_arr := '{}';
        FOREACH el IN ARRAY r.target_tiers
        LOOP
          canonical := CASE el
            WHEN 'Aether' THEN 'Ather' WHEN 'Beacon' THEN 'Nova' WHEN 'Crest' THEN 'Luminar' WHEN 'Ascend' THEN 'Valiant'
            WHEN 'Ather' THEN 'Ather' WHEN 'Nova' THEN 'Nova' WHEN 'Luminar' THEN 'Luminar' WHEN 'Valiant' THEN 'Valiant' WHEN 'Echelon' THEN 'Echelon'
            ELSE 'Ather' END;
          new_arr := array_append(new_arr, canonical);
        END LOOP;
        UPDATE campaign_targets SET target_tiers = new_arr WHERE id = r.id;
      END LOOP;
    END IF;
  END IF;
END $$;

-- 5) Fix negative booked_count and over-capacity (only if venue_time_slots exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'venue_time_slots') THEN
    UPDATE venue_time_slots SET booked_count = 0 WHERE booked_count < 0;
    UPDATE venue_time_slots v
    SET booked_count = LEAST(v.booked_count, v.capacity + COALESCE(v.echelon_buffer, 2))
    WHERE v.booked_count > v.capacity + COALESCE(v.echelon_buffer, 2);
  END IF;
END $$;

COMMIT;

-- Verification queries (run after repair)
-- SELECT 'venue_time_slots' AS tbl, COUNT(*) AS negative_count FROM venue_time_slots WHERE booked_count < 0;
-- SELECT 'users_tier' AS check_, current_tier_name, COUNT(*) FROM users GROUP BY current_tier_name;
-- SELECT 'bookings_tier' AS check_, user_tier_at_booking, COUNT(*) FROM bookings GROUP BY user_tier_at_booking;
-- SELECT * FROM loyalty_tiers ORDER BY tier_level;