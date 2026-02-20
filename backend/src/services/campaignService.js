const campaignRepository = require('../repositories/campaignRepository');
const pushNotificationService = require('./pushNotificationService');
const { getPool } = require('../config/db');
const partnerRepository = require('../repositories/partnerRepository');
const { log, logError } = require('../../utils/logger');
const { AppError } = require('../../utils/response');

function normalizePartnerTier(rawTier) {
  return String(rawTier || 'bronze').trim().toLowerCase();
}

async function getPartnerTier(partnerId) {
  const partner = await partnerRepository.getPartnerById(partnerId, false);
  if (!partner) {
    throw new AppError(404, 'Partner not found');
  }
  return normalizePartnerTier(partner.partner_tier);
}

async function list(partnerId, limit, offset) {
  return await campaignRepository.listByPartner(partnerId, limit, offset);
}

async function get(campaignId, partnerId) {
  const campaign = await campaignRepository.getByIdAndPartner(campaignId, partnerId);
  if (!campaign) {
    throw new AppError(404, 'Campaign not found');
  }
  return campaign;
}

async function create(partnerId, { title, body, segment_filter, scheduled_at, status }) {
  const tier = await getPartnerTier(partnerId);
  if (tier === 'bronze') {
    throw new AppError(403, 'Bronze partners cannot create campaigns.');
  }
  if (!title || !body) {
    throw new AppError(400, 'Title and body are required');
  }
  const validStatus = ['draft', 'scheduled'];
  const finalStatus = tier === 'silver'
    ? 'draft'
    : (status && validStatus.includes(status) ? status : 'draft');
  return await campaignRepository.create(partnerId, {
    title,
    body,
    segment_filter: segment_filter || null,
    scheduled_at: scheduled_at || null,
    status: finalStatus,
  });
}

async function update(partnerId, campaignId, updates) {
  const tier = await getPartnerTier(partnerId);
  if (tier === 'bronze') {
    throw new AppError(403, 'Bronze partners cannot update campaigns.');
  }
  const existing = await campaignRepository.getByIdAndPartner(campaignId, partnerId);
  if (!existing) {
    throw new AppError(404, 'Campaign not found');
  }
  if (existing.status === 'sent') {
    throw new AppError(400, 'Cannot edit a campaign that has already been sent');
  }
  const allowed = {};
  if (updates.title !== undefined) allowed.title = updates.title;
  if (updates.body !== undefined) allowed.body = updates.body;
  if (updates.segment_filter !== undefined) allowed.segment_filter = updates.segment_filter;
  if (updates.scheduled_at !== undefined) allowed.scheduled_at = updates.scheduled_at;
  if (tier === 'silver') {
    // Silver partners can only keep campaigns as draft requests.
    allowed.status = 'draft';
  } else if (updates.status !== undefined && ['draft', 'scheduled', 'cancelled'].includes(updates.status)) {
    allowed.status = updates.status;
  }
  return await campaignRepository.update(campaignId, partnerId, allowed);
}

async function send(partnerId, campaignId) {
  const tier = await getPartnerTier(partnerId);
  if (tier !== 'gold') {
    throw new AppError(403, 'Only Gold partners can send campaigns directly. Silver partners must request admin approval.');
  }
  const campaign = await campaignRepository.getByIdAndPartner(campaignId, partnerId);
  if (!campaign) {
    throw new AppError(404, 'Campaign not found');
  }
  if (campaign.status === 'sent') {
    throw new AppError(400, 'Campaign has already been sent');
  }
  const updated = await campaignRepository.setSent(campaignId, partnerId);
  if (!updated) {
    throw new AppError(400, 'Campaign could not be sent (invalid state)');
  }

  // Send Web Push to target users (fire-and-forget; do not block response)
  (async () => {
    try {
      if (!pushNotificationService.isPushConfigured()) return;
      const pool = getPool();
      const result = await pool.query(
        `SELECT DISTINCT b.user_id FROM bookings b
         WHERE b.partner_id = $1 AND b.user_id IS NOT NULL AND b.status IN ('confirmed', 'redeemed')`,
        [partnerId]
      );
      const userIds = result.rows.map((r) => r.user_id).filter(Boolean);
      if (userIds.length === 0) return;
      let sent = 0;
      let failed = 0;
      for (const uid of userIds) {
        const out = await pushNotificationService.sendToUser(uid, {
          title: campaign.title || 'Update from venue',
          body: campaign.body || '',
          url: '/home',
          tag: 'campaign',
        });
        sent += out.sent || 0;
        failed += out.failed || 0;
      }
      log(`[Campaign] Push sent to ${userIds.length} users (delivered: ${sent}, failed: ${failed})`);
    } catch (err) {
      logError('[Campaign] Push send error:', err);
    }
  })();

  return updated;
}

module.exports = {
  list,
  get,
  create,
  update,
  send,
};
