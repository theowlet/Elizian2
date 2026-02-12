const campaignRepository = require('../repositories/campaignRepository');
const { AppError } = require('../../utils/response');

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
  if (!title || !body) {
    throw new AppError(400, 'Title and body are required');
  }
  const validStatus = ['draft', 'scheduled'];
  const finalStatus = status && validStatus.includes(status) ? status : 'draft';
  return await campaignRepository.create(partnerId, {
    title,
    body,
    segment_filter: segment_filter || null,
    scheduled_at: scheduled_at || null,
    status: finalStatus,
  });
}

async function update(partnerId, campaignId, updates) {
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
  if (updates.status !== undefined && ['draft', 'scheduled', 'cancelled'].includes(updates.status)) {
    allowed.status = updates.status;
  }
  return await campaignRepository.update(campaignId, partnerId, allowed);
}

async function send(partnerId, campaignId) {
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
  return updated;
}

module.exports = {
  list,
  get,
  create,
  update,
  send,
};
