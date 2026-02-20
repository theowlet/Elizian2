const { getPool } = require('../config/db');
const adminCampaignRepository = require('../repositories/adminCampaignRepository');
const partnerRepository = require('../repositories/partnerRepository');
const { EVENT_TYPES, ACTION_TYPES, VALID_TIERS } = require('../campaign/campaignTypes');
const { invalidateActiveCampaignsCache } = require('../campaign/triggerProcessor');
const { AppError } = require('../../utils/response');

const pool = getPool();
const VALID_STATUSES = ['draft', 'scheduled', 'active', 'paused', 'expired'];

function normalizePartnerTier(rawTier) {
  return String(rawTier || 'bronze').trim().toLowerCase();
}

async function getPartnerTier(partnerId) {
  const partner = await partnerRepository.getPartnerById(partnerId, false);
  if (!partner) throw new AppError(404, 'Partner not found');
  return normalizePartnerTier(partner.partner_tier);
}

async function ensureEnterpriseCampaignSchemaReady() {
  const tableResult = await pool.query(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'campaigns'
     ) AS exists`
  );
  const hasCampaignsTable = tableResult.rows[0]?.exists === true;
  if (!hasCampaignsTable) {
    throw new AppError(503, 'Enterprise campaign engine is not initialized. Please run campaign migrations.');
  }

  const createdByCol = await pool.query(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'campaigns'
         AND column_name = 'created_by'
     ) AS exists`
  );
  if (createdByCol.rows[0]?.exists !== true) {
    throw new AppError(503, 'Enterprise campaign schema is incomplete (campaigns.created_by missing). Please run campaign migrations.');
  }

  const targetsTable = await pool.query(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'campaign_targets'
     ) AS exists`
  );
  if (targetsTable.rows[0]?.exists !== true) {
    throw new AppError(503, 'Enterprise campaign schema is incomplete (campaign_targets missing). Please run campaign migrations.');
  }
}

function assertTierPermission(tier, action) {
  if (tier === 'bronze') {
    throw new AppError(403, 'Bronze partners are not permitted to create or manage campaigns.');
  }
  if (tier === 'silver' && action === 'publish') {
    throw new AppError(403, 'Silver partners can only submit campaigns for admin review. Direct publish is not allowed.');
  }
}

function normalizeUserSegment(userSegment, partnerId, tier, isSilverRequest) {
  const base = userSegment && typeof userSegment === 'object' && !Array.isArray(userSegment) ? { ...userSegment } : {};
  const existingCtx = base.__partner_context && typeof base.__partner_context === 'object' ? { ...base.__partner_context } : {};
  base.__partner_context = {
    ...existingCtx,
    partner_id: partnerId,
    partner_tier: tier,
    request_to_admin: Boolean(isSilverRequest),
    request_status: isSilverRequest ? 'pending_admin_review' : 'direct',
  };
  return base;
}

async function assertExperienceOwnership(partnerId, experienceIds = []) {
  if (!Array.isArray(experienceIds) || experienceIds.length === 0) return;
  const result = await pool.query(
    `SELECT id
     FROM partner_offers
     WHERE partner_id = $1
       AND id = ANY($2::uuid[])`,
    [partnerId, experienceIds]
  );
  if (result.rowCount !== experienceIds.length) {
    throw new AppError(403, 'One or more selected experiences do not belong to your venue.');
  }
}

function sanitizeStatus(status, fallback = 'draft') {
  if (status == null || status === '') return fallback;
  const normalized = String(status).trim().toLowerCase();
  if (!VALID_STATUSES.includes(normalized)) {
    throw new AppError(400, `Invalid campaign status: ${status}`);
  }
  return normalized;
}

function sanitizeCampaignPayload(input, tier, partnerId, options = {}) {
  const { isUpdate = false } = options;
  const silverRequest = tier === 'silver';
  const payload = {};

  if (input.name !== undefined) {
    const name = String(input.name || '').trim();
    if (!name) {
      if (isUpdate) {
        throw new AppError(400, 'Campaign name cannot be empty');
      }
      throw new AppError(400, 'Campaign name is required');
    }
    payload.name = silverRequest && !name.startsWith('[REQUEST]') ? `[REQUEST] ${name}` : name;
  }
  if (input.description !== undefined) payload.description = input.description != null ? String(input.description).trim() : null;
  if (input.banner_image_url !== undefined) payload.banner_image_url = input.banner_image_url || null;
  if (input.campaign_type !== undefined) payload.campaign_type = input.campaign_type ? String(input.campaign_type).trim() : null;
  if (input.start_at !== undefined) payload.start_at = input.start_at || null;
  if (input.end_at !== undefined) payload.end_at = input.end_at || null;
  if (input.start_date !== undefined) payload.start_date = input.start_date || null;
  if (input.end_date !== undefined) payload.end_date = input.end_date || null;
  if (input.priority_weight !== undefined) payload.priority_weight = Number(input.priority_weight) || 0;
  if (input.budget_limit !== undefined) payload.budget_limit = input.budget_limit == null ? null : Number(input.budget_limit);

  if (Array.isArray(input.target_tiers)) {
    payload.target_tiers = input.target_tiers.filter((tierName) => VALID_TIERS.includes(tierName));
  }
  if (Array.isArray(input.target_categories)) {
    payload.target_categories = input.target_categories
      .map((category) => String(category || '').trim())
      .filter(Boolean);
  }
  if (input.geo_filter !== undefined) {
    payload.geo_filter = input.geo_filter && typeof input.geo_filter === 'object' && !Array.isArray(input.geo_filter) ? input.geo_filter : {};
  }
  if (input.rule_json !== undefined) {
    payload.rule_json = input.rule_json;
  }
  if (input.experience_ids !== undefined) {
    payload.experience_ids = Array.isArray(input.experience_ids) ? input.experience_ids : [];
  }

  // Always stamp partner context so runtime evaluation can isolate campaign effects.
  payload.user_segment = normalizeUserSegment(input.user_segment, partnerId, tier, silverRequest);

  // Tier status policy:
  // - Gold: can manage full lifecycle.
  // - Silver: request-only, always draft and inactive.
  if (tier === 'gold') {
    if (input.status !== undefined) {
      payload.status = sanitizeStatus(input.status, 'draft');
    } else if (!isUpdate) {
      payload.status = 'draft';
    }
  } else {
    payload.status = 'draft';
    payload.is_active = false;
  }

  return payload;
}

function normalizeCampaignRow(row) {
  return {
    ...row,
    target_tiers: row.ct_tiers ?? row.target_tiers ?? [],
    target_categories: row.ct_categories ?? row.target_categories ?? [],
    geo_filter: row.ct_geo ?? row.geo_filter ?? {},
    user_segment: row.ct_user_segment ?? row.user_segment ?? {},
  };
}

function isOwnedByPartner(campaign, partnerId) {
  if (!campaign) return false;
  if (campaign.created_by === partnerId) return true;
  const scopedPartnerId = campaign.user_segment?.__partner_context?.partner_id;
  return scopedPartnerId === partnerId;
}

async function listPartnerEnterpriseCampaigns(partnerId, { search, status, limit = 50, offset = 0 } = {}) {
  await ensureEnterpriseCampaignSchemaReady();
  const tier = await getPartnerTier(partnerId);
  if (tier === 'bronze') {
    return { campaigns: [], total: 0, tier };
  }

  const params = [partnerId];
  let idx = 2;
  let where = `
    WHERE (
      c.created_by::text = $1
      OR (ct.user_segment->'__partner_context'->>'partner_id') = $1
    )
  `;

  if (search) {
    where += ` AND (c.name ILIKE $${idx} OR c.description ILIKE $${idx})`;
    params.push(`%${search}%`);
    idx += 1;
  }
  if (status) {
    where += ` AND c.status = $${idx}`;
    params.push(status);
    idx += 1;
  }

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM campaigns c
     LEFT JOIN campaign_targets ct ON ct.campaign_id = c.id
     ${where}`,
    params
  );

  params.push(Math.min(Math.max(1, Number(limit) || 50), 100));
  params.push(Math.max(0, Number(offset) || 0));
  const limitParam = idx;
  const offsetParam = idx + 1;

  const rowsResult = await pool.query(
    `SELECT c.*,
            ct.target_tiers AS ct_tiers,
            ct.target_categories AS ct_categories,
            ct.geo_filter AS ct_geo,
            ct.user_segment AS ct_user_segment
     FROM campaigns c
     LEFT JOIN campaign_targets ct ON ct.campaign_id = c.id
     ${where}
     ORDER BY COALESCE(c.start_at, c.start_date) DESC NULLS LAST
     LIMIT $${limitParam} OFFSET $${offsetParam}`,
    params
  );

  return {
    tier,
    total: countResult.rows[0]?.total || 0,
    campaigns: rowsResult.rows.map(normalizeCampaignRow),
  };
}

async function getPartnerEnterpriseCampaign(partnerId, campaignId) {
  await ensureEnterpriseCampaignSchemaReady();
  const tier = await getPartnerTier(partnerId);
  if (tier === 'bronze') {
    throw new AppError(403, 'Bronze partners are not permitted to access enterprise campaigns.');
  }
  const campaign = await adminCampaignRepository.getCampaignById(campaignId);
  if (!campaign) throw new AppError(404, 'Campaign not found');
  if (!isOwnedByPartner(campaign, partnerId)) {
    throw new AppError(403, 'Not authorized to access this campaign');
  }
  return { tier, campaign };
}

async function createPartnerEnterpriseCampaign(partnerId, payload) {
  await ensureEnterpriseCampaignSchemaReady();
  const tier = await getPartnerTier(partnerId);
  assertTierPermission(tier, 'create');
  const sanitized = sanitizeCampaignPayload(payload || {}, tier, partnerId, { isUpdate: false });
  await assertExperienceOwnership(partnerId, sanitized.experience_ids || []);
  const created = await adminCampaignRepository.createCampaign(sanitized, partnerId);
  invalidateActiveCampaignsCache();
  return {
    tier,
    request_mode: tier === 'silver',
    campaign: created,
  };
}

async function updatePartnerEnterpriseCampaign(partnerId, campaignId, payload) {
  await ensureEnterpriseCampaignSchemaReady();
  const tier = await getPartnerTier(partnerId);
  assertTierPermission(tier, 'update');
  const existing = await adminCampaignRepository.getCampaignById(campaignId);
  if (!existing) throw new AppError(404, 'Campaign not found');
  if (!isOwnedByPartner(existing, partnerId)) {
    throw new AppError(403, 'Not authorized to update this campaign');
  }

  if (tier === 'silver') {
    const isRequestCampaign = existing.user_segment?.__partner_context?.request_to_admin === true;
    if (!isRequestCampaign || existing.status !== 'draft') {
      throw new AppError(403, 'Silver partners can only update their pending campaign requests.');
    }
  }

  const sanitized = sanitizeCampaignPayload(payload || {}, tier, partnerId, { isUpdate: true });
  await assertExperienceOwnership(partnerId, sanitized.experience_ids || []);
  const updated = await adminCampaignRepository.updateCampaign(campaignId, sanitized, partnerId);
  invalidateActiveCampaignsCache();
  return {
    tier,
    request_mode: tier === 'silver',
    campaign: updated,
  };
}

async function pausePartnerEnterpriseCampaign(partnerId, campaignId) {
  await ensureEnterpriseCampaignSchemaReady();
  const tier = await getPartnerTier(partnerId);
  if (tier !== 'gold') {
    throw new AppError(403, 'Only Gold partners can pause enterprise campaigns.');
  }
  const existing = await adminCampaignRepository.getCampaignById(campaignId);
  if (!existing) throw new AppError(404, 'Campaign not found');
  if (!isOwnedByPartner(existing, partnerId)) {
    throw new AppError(403, 'Not authorized to pause this campaign');
  }
  const updated = await adminCampaignRepository.setCampaignStatus(campaignId, 'paused', partnerId);
  invalidateActiveCampaignsCache();
  return { tier, campaign: updated };
}

async function activatePartnerEnterpriseCampaign(partnerId, campaignId) {
  await ensureEnterpriseCampaignSchemaReady();
  const tier = await getPartnerTier(partnerId);
  if (tier !== 'gold') {
    throw new AppError(403, 'Only Gold partners can activate enterprise campaigns.');
  }
  const existing = await adminCampaignRepository.getCampaignById(campaignId);
  if (!existing) throw new AppError(404, 'Campaign not found');
  if (!isOwnedByPartner(existing, partnerId)) {
    throw new AppError(403, 'Not authorized to activate this campaign');
  }
  const updated = await adminCampaignRepository.setCampaignStatus(campaignId, 'active', partnerId);
  invalidateActiveCampaignsCache();
  return { tier, campaign: updated };
}

function getPartnerEnterpriseCampaignSchema() {
  return {
    event_types: EVENT_TYPES,
    action_types: ACTION_TYPES,
    target_tiers: VALID_TIERS,
    target_categories: adminCampaignRepository.TARGET_CATEGORIES,
    user_segments: adminCampaignRepository.USER_SEGMENTS,
  };
}

module.exports = {
  getPartnerTier,
  listPartnerEnterpriseCampaigns,
  getPartnerEnterpriseCampaign,
  createPartnerEnterpriseCampaign,
  updatePartnerEnterpriseCampaign,
  pausePartnerEnterpriseCampaign,
  activatePartnerEnterpriseCampaign,
  getPartnerEnterpriseCampaignSchema,
};
