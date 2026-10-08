-- Credit accounts are created by the USER_REGISTERED handler, so students created
-- any other way (seed data, imports, admin enrolment before M4 was mounted) have
-- none and cannot start assessments. Give each of them the GLOBAL initial balance,
-- recorded as an INITIAL transaction exactly like CreditService.createAccount.

WITH policy AS (
  SELECT initial_credit_amount AS amount
  FROM credit.credit_policies
  WHERE scope_type = 'GLOBAL' AND is_active = TRUE
  ORDER BY created_at ASC
  LIMIT 1
),
new_accounts AS (
  INSERT INTO credit.credit_accounts (student_id, balance)
  SELECT s.id, COALESCE((SELECT amount FROM policy), 50)
  FROM org.students s
  WHERE NOT EXISTS (SELECT 1 FROM credit.credit_accounts ca WHERE ca.student_id = s.id)
  RETURNING id, student_id, balance
)
INSERT INTO credit.credit_transactions
  (account_id, student_id, transaction_type, amount, balance_after, idempotency_key, metadata)
SELECT id, student_id, 'INITIAL', balance, balance, 'initial:' || student_id,
       '{"reason": "Account creation (backfill)"}'::jsonb
FROM new_accounts
ON CONFLICT DO NOTHING;
