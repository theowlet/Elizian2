const { getPool } = require('../config/db');
const pool = getPool();

async function createProposal({ title, description, options, votingEndsAt, createdBy }) {
  const result = await pool.query(
    `INSERT INTO governance_proposals (title, description, options, voting_ends_at, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [title, description, JSON.stringify(options || []), votingEndsAt, createdBy]
  );
  return result.rows[0];
}

async function getProposalById(id) {
  const result = await pool.query(
    `SELECT * FROM governance_proposals WHERE id = $1`,
    [id]
  );
  return result.rows[0];
}

async function listProposals({ status = null, limit = 50, offset = 0 } = {}) {
  let query = 'SELECT * FROM governance_proposals WHERE 1=1';
  const params = [];
  let i = 0;
  if (status) {
    i++; query += ` AND status = $${i}`; params.push(status);
  }
  i++; query += ` ORDER BY created_at DESC LIMIT $${i}`; params.push(limit);
  i++; query += ` OFFSET $${i}`; params.push(offset);
  const result = await pool.query(query, params);
  return result.rows;
}

async function castVote({ proposalId, userId, optionIndex, weight = 1 }) {
  const result = await pool.query(
    `INSERT INTO governance_votes (proposal_id, user_id, option_index, weight)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (proposal_id, user_id) DO UPDATE SET option_index = $3, weight = $4
     RETURNING *`,
    [proposalId, userId, optionIndex, weight]
  );
  return result.rows[0];
}

async function getVotesByProposal(proposalId) {
  const result = await pool.query(
    `SELECT v.*, u.first_name, u.last_name
     FROM governance_votes v
     JOIN users u ON u.id = v.user_id
     WHERE v.proposal_id = $1`,
    [proposalId]
  );
  return result.rows;
}

async function getVoteCountsByProposal(proposalId) {
  const result = await pool.query(
    `SELECT option_index, COUNT(*) AS vote_count, COALESCE(SUM(weight), 0) AS weighted_sum
     FROM governance_votes WHERE proposal_id = $1
     GROUP BY option_index
     ORDER BY option_index`,
    [proposalId]
  );
  return result.rows;
}

async function hasUserVoted(proposalId, userId) {
  const result = await pool.query(
    `SELECT 1 FROM governance_votes WHERE proposal_id = $1 AND user_id = $2`,
    [proposalId, userId]
  );
  return result.rows.length > 0;
}

async function updateProposalStatus(id, status) {
  const result = await pool.query(
    `UPDATE governance_proposals SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
    [status, id]
  );
  return result.rows[0];
}

module.exports = {
  createProposal,
  getProposalById,
  listProposals,
  castVote,
  getVotesByProposal,
  getVoteCountsByProposal,
  hasUserVoted,
  updateProposalStatus,
};
