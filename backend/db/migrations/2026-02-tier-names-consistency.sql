-- ═══════════════════════════════════════════════════════════════════════
-- TIER NAMES CONSISTENCY MIGRATION
-- Standardize tier names across the entire platform:
--   Level 1: Ather (was Aether in loyalty_tiers)
--   Level 2: Beacon (was Nova)
--   Level 3: Crest (was Luminar)
--   Level 4: Ascend (was Valiant)
--   Level 5: Echelon (unchanged)
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Update loyalty_tiers (new system) ────────────────────────────
UPDATE loyalty_tiers SET tier_name = 'Ather'  WHERE tier_name IN ('Aether', 'Ather') AND tier_level = 1;
UPDATE loyalty_tiers SET tier_name = 'Beacon' WHERE tier_name = 'Nova'    AND tier_level = 2;
UPDATE loyalty_tiers SET tier_name = 'Crest'  WHERE tier_name = 'Luminar' AND tier_level = 3;
UPDATE loyalty_tiers SET tier_name = 'Ascend' WHERE tier_name = 'Valiant' AND tier_level = 4;
-- Echelon stays as Echelon (level 5)

-- ─── 2. Update old tiers table (legacy system) ──────────────────────
UPDATE tiers SET name = 'Ather'  WHERE level = 1;
UPDATE tiers SET name = 'Beacon' WHERE level = 2 AND name = 'Nova';
UPDATE tiers SET name = 'Crest'  WHERE level = 3 AND name = 'Luminar';
UPDATE tiers SET name = 'Ascend' WHERE level = 4 AND name = 'Valiant';
-- Echelon stays as Echelon (level 5)

-- ─── 3. Update all users' current_tier_name ──────────────────────────
UPDATE users SET current_tier_name = 'Ather'  WHERE current_tier_name IN ('Aether', 'Aether');
UPDATE users SET current_tier_name = 'Beacon' WHERE current_tier_name = 'Nova';
UPDATE users SET current_tier_name = 'Crest'  WHERE current_tier_name = 'Luminar';
UPDATE users SET current_tier_name = 'Ascend' WHERE current_tier_name = 'Valiant';

-- ─── 4. Update bookings user_tier_at_booking ─────────────────────────
UPDATE bookings SET user_tier_at_booking = 'Ather'  WHERE user_tier_at_booking IN ('Aether', 'Aether');
UPDATE bookings SET user_tier_at_booking = 'Beacon' WHERE user_tier_at_booking = 'Nova';
UPDATE bookings SET user_tier_at_booking = 'Crest'  WHERE user_tier_at_booking = 'Luminar';
UPDATE bookings SET user_tier_at_booking = 'Ascend' WHERE user_tier_at_booking = 'Valiant';

-- ─── 5. Update badge colors for new brand identity ───────────────────
UPDATE loyalty_tiers SET badge_color = '#9ca3af' WHERE tier_name = 'Ather';   -- Gray
UPDATE loyalty_tiers SET badge_color = '#10b981' WHERE tier_name = 'Beacon';  -- Emerald green
UPDATE loyalty_tiers SET badge_color = '#3b82f6' WHERE tier_name = 'Crest';   -- Blue
UPDATE loyalty_tiers SET badge_color = '#8b5cf6' WHERE tier_name = 'Ascend';  -- Violet
UPDATE loyalty_tiers SET badge_color = '#E0B56F' WHERE tier_name = 'Echelon'; -- Gold

COMMIT;

-- Verify
SELECT 'loyalty_tiers' as table_name, tier_name, tier_level, badge_color FROM loyalty_tiers ORDER BY tier_level;
SELECT 'tiers' as table_name, name, level FROM tiers ORDER BY level;
SELECT 'users' as table_name, current_tier_name, COUNT(*) FROM users GROUP BY current_tier_name;
