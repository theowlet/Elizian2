ALTER TABLE users
  ADD COLUMN IF NOT EXISTS signup_bonus_credited BOOLEAN DEFAULT false;

WITH updated AS (
  UPDATE users
     SET available_tokens = COALESCE(available_tokens, 0) + 100,
         total_tokens_earned = COALESCE(total_tokens_earned, 0) + 100,
         signup_bonus_credited = true
   WHERE signup_bonus_credited IS DISTINCT FROM true
   RETURNING id,
             (COALESCE(available_tokens, 0) - 100) AS balance_before,
             COALESCE(available_tokens, 0) AS balance_after
)
INSERT INTO token_ledger (user_id, transaction_id, amount, ledger_type, balance_before, balance_after, description)
SELECT id,
       NULL,
       100,
       'airdrop',
       balance_before,
       balance_after,
       'Retroactive signup bonus credited (blockchain airdrop placeholder)'
FROM updated;

