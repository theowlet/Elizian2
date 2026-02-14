const governanceService = require('../services/governanceService');
const { successResponse, errorResponse } = require('../../utils/response');
const { logError } = require('../../utils/logger');

async function createProposal(req, res) {
  try {
    const userId = req.userId;
    if (!userId) return errorResponse(res, 401, 'Authentication required');
    const { title, description, options, voting_ends_at } = req.body || {};
    if (!title || !String(title).trim()) return errorResponse(res, 400, 'Title is required');
    const proposal = await governanceService.createProposal({
      title: String(title).trim(),
      description: description ? String(description).trim() : null,
      options: options || [],
      voting_ends_at: voting_ends_at || null,
      created_by: userId,
    });
    successResponse(res, 201, 'Proposal created', proposal);
  } catch (err) {
    logError('Governance create proposal error', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to create proposal');
  }
}

async function listProposals(req, res) {
  try {
    const { status, limit = 50, offset = 0 } = req.query;
    const list = await governanceService.listProposals({
      status: status || null,
      limit: Math.min(100, parseInt(limit, 10) || 50),
      offset: parseInt(offset, 10) || 0,
    });
    successResponse(res, 200, 'Proposals retrieved', list);
  } catch (err) {
    logError('Governance list error', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to list proposals');
  }
}

async function getProposal(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return errorResponse(res, 400, 'Invalid proposal ID');
    const proposal = await governanceService.getProposalWithResults(id);
    if (!proposal) return errorResponse(res, 404, 'Proposal not found');
    successResponse(res, 200, 'Proposal retrieved', proposal);
  } catch (err) {
    logError('Governance get proposal error', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to get proposal');
  }
}

async function castVote(req, res) {
  try {
    const userId = req.userId;
    if (!userId) return errorResponse(res, 401, 'Authentication required');
    const id = parseInt(req.params.id, 10);
    if (!id) return errorResponse(res, 400, 'Invalid proposal ID');
    const optionIndex = parseInt(req.body?.option_index, 10);
    if (optionIndex === undefined || isNaN(optionIndex) || optionIndex < 0) {
      return errorResponse(res, 400, 'option_index (number) is required');
    }
    await governanceService.vote(id, userId, optionIndex);
    successResponse(res, 200, 'Vote recorded');
  } catch (err) {
    logError('Governance vote error', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to cast vote');
  }
}

async function hasVoted(req, res) {
  try {
    const userId = req.userId;
    if (!userId) return errorResponse(res, 401, 'Authentication required');
    const id = parseInt(req.params.id, 10);
    if (!id) return errorResponse(res, 400, 'Invalid proposal ID');
    const voted = await governanceService.hasUserVoted(id, userId);
    successResponse(res, 200, 'OK', { voted });
  } catch (err) {
    logError('Governance hasVoted error', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to check vote');
  }
}

module.exports = {
  createProposal,
  listProposals,
  getProposal,
  castVote,
  hasVoted,
};
