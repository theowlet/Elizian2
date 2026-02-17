/**
 * Canonical tier names for the platform. Only these five are valid.
 * See backend/db/TIER_SYSTEM_TRUTH.md
 */
const CANONICAL_TIERS = ['Ather', 'Nova', 'Luminar', 'Valiant', 'Echelon'];

const ALIAS_TO_CANONICAL = {
  Aether: 'Ather',
  Beacon: 'Nova',
  Crest: 'Luminar',
  Ascend: 'Valiant'
};

/**
 * Normalize a tier string to one of the canonical five.
 * Use when reading tier from DB or external input before exposing to UI or logic.
 * @param {string|null|undefined} tier - Raw tier name
 * @param {string} [defaultTier='Ather'] - Value to return when tier is null/empty or unknown
 * @returns {string} One of Ather, Nova, Luminar, Valiant, Echelon
 */
function normalizeTierName(tier, defaultTier = 'Ather') {
  if (tier == null || String(tier).trim() === '') return defaultTier;
  const t = String(tier).trim();
  if (CANONICAL_TIERS.includes(t)) return t;
  if (ALIAS_TO_CANONICAL[t]) return ALIAS_TO_CANONICAL[t];
  const lower = t.toLowerCase();
  if (lower === 'aether') return 'Ather';
  if (lower === 'beacon') return 'Nova';
  if (lower === 'crest') return 'Luminar';
  if (lower === 'ascend') return 'Valiant';
  return defaultTier;
}

module.exports = {
  CANONICAL_TIERS,
  ALIAS_TO_CANONICAL,
  normalizeTierName
};
