const subscriptionPassRepository = require('../repositories/subscriptionPassRepository');
const { successResponse, errorResponse } = require('../../utils/response');
const { logError } = require('../../utils/logger');

async function listProducts(req, res) {
  try {
    const partnerId = req.query.partner_id || null;
    const products = await subscriptionPassRepository.listPassProducts(partnerId);
    successResponse(res, 200, 'Pass products retrieved', products);
  } catch (err) {
    logError('List pass products error:', err);
    errorResponse(res, 500, err.message || 'Failed');
  }
}

async function listMyPasses(req, res) {
  try {
    const userId = req.userId;
    if (!userId) return errorResponse(res, 401, 'Authentication required');
    const passes = await subscriptionPassRepository.listUserPasses(userId);
    successResponse(res, 200, 'My passes retrieved', passes);
  } catch (err) {
    logError('List my passes error:', err);
    errorResponse(res, 500, err.message || 'Failed');
  }
}

async function claim(req, res) {
  try {
    const userId = req.userId;
    if (!userId) return errorResponse(res, 401, 'Authentication required');
    const { subscription_pass_id, code } = req.body;
    if (!subscription_pass_id || !code || !String(code).trim()) {
      return errorResponse(res, 400, 'subscription_pass_id and code are required');
    }
    const product = await subscriptionPassRepository.getPassProductById(subscription_pass_id);
    if (!product || !product.is_active) return errorResponse(res, 404, 'Pass product not found');
    const pass = await subscriptionPassRepository.claimPass(userId, subscription_pass_id, code);
    successResponse(res, 201, 'Pass claimed', pass);
  } catch (err) {
    logError('Claim pass error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed');
  }
}

async function redeemAtPartner(req, res) {
  try {
    const partnerId = req.params.id;
    if (!req.partnerId || req.partnerId !== partnerId) return errorResponse(res, 403, 'Not authorized');
    const { code } = req.body;
    if (!code || !String(code).trim()) return errorResponse(res, 400, 'code is required');
    const row = await subscriptionPassRepository.findByCode(code);
    if (!row) return errorResponse(res, 404, 'Valid pass not found or already redeemed');
    if (row.partner_id && row.partner_id !== partnerId) {
      return errorResponse(res, 400, 'This pass is not valid at this venue');
    }
    const redeemed = await subscriptionPassRepository.redeemByCode(code);
    successResponse(res, 200, 'Pass redeemed', redeemed);
  } catch (err) {
    logError('Redeem pass error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed');
  }
}

module.exports = { listProducts, listMyPasses, claim, redeemAtPartner };
