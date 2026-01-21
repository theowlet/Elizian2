const loyaltyEngine = require('../services/loyaltyEngineService');
const { successResponse } = require('../utils/response');

const calculate = async (req, res, next) => {
  try {
    const { amount = 0 } = req.body;
    const result = await loyaltyEngine.calculateEarning(req.userId || req.body.user_id, amount);
    successResponse(res, 200, 'Loyalty calculation successful', result);
  } catch (error) {
    next(error);
  }
};

const progress = async (req, res, next) => {
  try {
    const data = await loyaltyEngine.getProgress(req.userId);
    successResponse(res, 200, 'Loyalty progress retrieved', data);
  } catch (error) {
    next(error);
  }
};

const history = async (req, res, next) => {
  try {
    const { limit, offset } = req.query;
    const entries = await loyaltyEngine.getHistory(req.userId, {
      limit: parseInt(limit || '20', 10),
      offset: parseInt(offset || '0', 10)
    });
    successResponse(res, 200, 'Loyalty history retrieved', entries);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  calculate,
  progress,
  history
};

