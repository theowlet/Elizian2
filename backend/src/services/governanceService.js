const governanceRepository = require('../repositories/governanceRepository');
const { getPool } = require('../config/db');
const { AppError } = require('../../utils/response');

const pool = getPool();

async function getVoteWeightForUser(userId) {
  const result = await pool.query(
    `SELECT available_tokens FROM users WHERE id = $1`,
    [userId]
  );
  const tokens = parseFloat(result.rows[0]?.available_tokens || 0);
  // Influence: 1 base + up to 9 from EZT (e.g. 1 per 1000 EZT, max weight 10)
  const extra = Math.min(9, Math.floor(tokens / 1000));
  return 1 + extra;
}

async function createProposal(data) {
  const options = Array.isArray(data.options) ? data.options : [];
  if (options.length < 2) throw new AppError(400, 'At least 2 options required');
  const votingEndsAt = new Date(data.voting_ends_at);
  if (isNaN(votingEndsAt.getTime()) || votingEndsAt <= new Date()) {
    throw new AppError(400, 'voting_ends_at must be a future date');
  }
  return governanceRepository.createProposal({
    title: data.title,
    description: data.description || null,
    options,
    voting_ends_at: votingEndsAt.toISOString(),
    created_by: data.created_by,
  });
}

async function listProposals(filters) {
  return governanceRepository.listProposals(filters);
}

async function getProposalWithResults(id) {
  const proposal = await governanceRepository.getProposalById(id);
  if (!proposal) return null;
  const counts = await governanceRepository.getVoteCountsByProposal(id);
  const options = proposal.options || [];
  const results = options.map((label, idx) => {
    const row = counts.find((c) => Number(c.option_index) === idx);
    return {
      option_index: idx,
      label,
      vote_count: row ? parseInt(row.vote_count, 10) : 0,
      weighted_sum: row ? parseFloat(row.weighted_sum) : 0,
    };
  });
  return { ...proposal, results };
}

async function vote(proposalId, userId, optionIndex) {
  const proposal = await governanceRepository.getProposalById(proposalId);
  if (!proposal) throw new AppError(404, 'Proposal not found');
  if (proposal.status !== 'open') throw new AppError(400, 'Proposal is not open for voting');
  const endsAt = new Date(proposal.voting_ends_at);
  if (endsAt <= new Date()) throw new AppError(400, 'Voting has ended');
  const options = proposal.options || [];
  if (optionIndex < 0 || optionIndex >= options.length) {
    throw new AppError(400, 'Invalid option index');
  }
  const weight = await getVoteWeightForUser(userId);
  return governanceRepository.castVote({ proposalId, userId, optionIndex, weight });
}

async function hasUserVoted(proposalId, userId) {
  return governanceRepository.hasUserVoted(proposalId, userId);
}

module.exports = {
  createProposal,
  listProposals,
  getProposalWithResults,
  vote,
  hasUserVoted,
  getVoteWeightForUser,
};
