/**
 * Growth Engine — daily job delegates to enterprise campaign engine.
 */
const campaignService = require('../campaign/campaignService');

async function runDailyJob() {
  try {
    const result = await campaignService.processEvent('midnight_cron', {});
    return { ok: true, ...result };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { runDailyJob };
