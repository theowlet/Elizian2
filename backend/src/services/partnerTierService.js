/**
 * Partner tier service — validation and safeguards for dynamic tiers.
 * Rules: fiat_fee_percent + ezt_fee_percent = platform_fee_percent; all <= 100; no negatives.
 * Cannot delete tier if partners assigned; cannot deactivate if partners use it.
 */

const partnerTierRepository = require('../repositories/partnerTierRepository');
const { AppError } = require('../utils/response');

function validateFeeSplit(platform_fee_percent, fiat_fee_percent, ezt_fee_percent) {
  const p = Number(platform_fee_percent);
  const f = Number(fiat_fee_percent);
  const e = Number(ezt_fee_percent);
  if (Number.isNaN(p) || p < 0 || p > 100) {
    throw new AppError(400, 'platform_fee_percent must be between 0 and 100');
  }
  if (Number.isNaN(f) || f < 0 || f > 100) {
    throw new AppError(400, 'fiat_fee_percent must be between 0 and 100');
  }
  if (Number.isNaN(e) || e < 0 || e > 100) {
    throw new AppError(400, 'ezt_fee_percent must be between 0 and 100');
  }
  const sum = Math.round((f + e) * 100) / 100;
  const platform = Math.round(p * 100) / 100;
  if (Math.abs(sum - platform) > 0.01) {
    throw new AppError(400, 'fiat_fee_percent + ezt_fee_percent must equal platform_fee_percent');
  }
}

async function listTiers(options = {}) {
  return partnerTierRepository.list(options);
}

async function getTierById(id) {
  const tier = await partnerTierRepository.getById(id);
  if (!tier) throw new AppError(404, 'Partner tier not found');
  return tier;
}

async function createTier(body) {
  const { name, description, platform_fee_percent, fiat_fee_percent, ezt_fee_percent, is_active } = body;
  if (!name || !String(name).trim()) {
    throw new AppError(400, 'Tier name is required');
  }
  validateFeeSplit(platform_fee_percent, fiat_fee_percent, ezt_fee_percent);
  const existing = await partnerTierRepository.getByName(name);
  if (existing) throw new AppError(409, `A tier named "${name}" already exists`);
  return partnerTierRepository.create({
    name: String(name).trim(),
    description: description ? String(description).trim() : null,
    platform_fee_percent,
    fiat_fee_percent,
    ezt_fee_percent,
    is_active: is_active !== false,
  });
}

async function updateTier(id, body) {
  const tier = await partnerTierRepository.getById(id);
  if (!tier) throw new AppError(404, 'Partner tier not found');
  const { name, description, platform_fee_percent, fiat_fee_percent, ezt_fee_percent, is_active } = body;
  const updates = {};
  if (name !== undefined) {
    if (!String(name).trim()) throw new AppError(400, 'Tier name cannot be empty');
    const existing = await partnerTierRepository.getByName(name);
    if (existing && existing.id !== id) throw new AppError(409, `A tier named "${name}" already exists`);
    updates.name = String(name).trim();
  }
  if (description !== undefined) updates.description = description ? String(description).trim() : null;
  if (platform_fee_percent !== undefined) updates.platform_fee_percent = platform_fee_percent;
  if (fiat_fee_percent !== undefined) updates.fiat_fee_percent = fiat_fee_percent;
  if (ezt_fee_percent !== undefined) updates.ezt_fee_percent = ezt_fee_percent;
  if (is_active !== undefined) updates.is_active = !!is_active;
  if (updates.platform_fee_percent !== undefined || updates.fiat_fee_percent !== undefined || updates.ezt_fee_percent !== undefined) {
    const p = updates.platform_fee_percent ?? tier.platform_fee_percent;
    const f = updates.fiat_fee_percent ?? tier.fiat_fee_percent;
    const e = updates.ezt_fee_percent ?? tier.ezt_fee_percent;
    validateFeeSplit(p, f, e);
  }
  if (Object.keys(updates).length === 0) return tier;
  return partnerTierRepository.update(id, updates);
}

async function setTierActive(id, isActive) {
  const tier = await partnerTierRepository.getById(id);
  if (!tier) throw new AppError(404, 'Partner tier not found');
  if (!isActive) {
    const count = await partnerTierRepository.countPartnersByTierId(id);
    if (count > 0) {
      throw new AppError(400, `Cannot deactivate tier: ${count} partner(s) are assigned. Reassign them to another tier first.`);
    }
  }
  return partnerTierRepository.setActive(id, isActive);
}

async function deleteTier(id) {
  const tier = await partnerTierRepository.getById(id);
  if (!tier) throw new AppError(404, 'Partner tier not found');
  try {
    return await partnerTierRepository.remove(id);
  } catch (err) {
    if (err.code === 'TIER_IN_USE') throw new AppError(400, err.message);
    throw err;
  }
}

module.exports = {
  listTiers,
  getTierById,
  createTier,
  updateTier,
  setTierActive,
  deleteTier,
  validateFeeSplit,
};
