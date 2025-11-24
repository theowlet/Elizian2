const { getPool } = require('../config/db');

const pool = getPool();

// Create a transaction record
async function createTransaction(transactionData) {
  const result = await pool.query(
    `INSERT INTO transactions (
      user_id, partner_id, category_id, bill_amount, discount_percentage, discount_amount,
      amount_after_discount, tokens_redeemed, tokens_earned, user_tier_at_transaction,
      payment_status, transaction_type
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING *`,
    [
      transactionData.user_id,
      transactionData.partner_id,
      transactionData.category_id,
      transactionData.bill_amount,
      transactionData.discount_percentage,
      transactionData.discount_amount,
      transactionData.amount_after_discount,
      transactionData.tokens_redeemed,
      transactionData.tokens_earned,
      transactionData.user_tier_at_transaction,
      transactionData.payment_status,
      transactionData.transaction_type
    ]
  );
  return result.rows[0];
}

// Update transaction with earned tokens
async function updateTransactionTokens(transactionId, tokensEarned, netTokenChange) {
  const result = await pool.query(
    'UPDATE transactions SET tokens_earned = $1, net_token_change = $2 WHERE id = $3 RETURNING *',
    [tokensEarned, netTokenChange, transactionId]
  );
  return result.rows[0];
}

// Get total spend for user
async function getTotalSpendForUser(userId) {
  const result = await pool.query(
    `SELECT COALESCE(SUM(bill_amount), 0) as total_spend
     FROM transactions
     WHERE user_id = $1 AND payment_status = 'completed'`,
    [userId]
  );
  return parseFloat(result.rows[0].total_spend || 0);
}

module.exports = {
  createTransaction,
  updateTransactionTokens,
  getTotalSpendForUser
};

