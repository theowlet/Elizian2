-- Normalize tier naming to new structure: Ather -> Nova -> Luminar -> Valiant -> Echelon

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS signup_bonus_credited BOOLEAN DEFAULT false;

-- Rename existing tiers if they use older spelling
UPDATE tiers SET name = 'Ather', level = COALESCE(level, 1), token_earning_percentage = 1, min_spend_required = COALESCE(min_spend_required, 0)
WHERE LOWER(name) IN ('aether', 'ather');

UPDATE tiers SET name = 'Nova', level = COALESCE(level, 2), token_earning_percentage = 2
WHERE LOWER(name) = 'nova';

UPDATE tiers SET name = 'Luminar', level = COALESCE(level, 3), token_earning_percentage = 3
WHERE LOWER(name) = 'luminar';

UPDATE tiers SET name = 'Valiant', level = COALESCE(level, 4), token_earning_percentage = 4
WHERE LOWER(name) = 'valiant';

UPDATE tiers SET name = 'Echelon', level = COALESCE(level, 5), token_earning_percentage = 5
WHERE LOWER(name) = 'echelon';

-- Ensure tier levels are distinct and ordered
WITH ordered AS (
  SELECT id, name,
         ROW_NUMBER() OVER (ORDER BY level, min_spend_required, name) AS new_level
  FROM tiers
)
UPDATE tiers t
SET level = ordered.new_level
FROM ordered
WHERE t.id = ordered.id;

