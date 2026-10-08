/**
 * Restores every student's wallet to the starting balance (5 coins by default).
 *   npm run restore-coins            → every student
 * Each change is an ADJUST transaction, so the credit history stays auditable.
 */

import 'dotenv/config';
import { Client } from 'pg';
import { pgConnectionConfig } from '../config/pgConnection';

async function main(): Promise<void> {
  const client = new Client(pgConnectionConfig(process.env.DATABASE_URL ?? ''));
  await client.connect();
  try {
    await client.query('BEGIN');
    // Students created before credit accounts existed get one first
    await client.query(`
      INSERT INTO credit.credit_accounts (student_id, balance)
      SELECT s.id, 0 FROM org.students s
      WHERE NOT EXISTS (SELECT 1 FROM credit.credit_accounts ca WHERE ca.student_id = s.id)`);
    const { rows } = await client.query(`
      WITH policy AS (
        SELECT initial_credit_amount AS amount FROM credit.credit_policies
        WHERE scope_type = 'GLOBAL' AND is_active = TRUE ORDER BY created_at ASC LIMIT 1
      ),
      target AS (
        SELECT ca.id, ca.student_id, ca.balance, COALESCE((SELECT amount FROM policy), 50) AS restore_to
        FROM credit.credit_accounts ca
      ),
      txn AS (
        INSERT INTO credit.credit_transactions
          (account_id, student_id, transaction_type, amount, balance_after, idempotency_key, metadata)
        SELECT id, student_id, 'ADJUST', restore_to - balance, restore_to,
               'restore-coins:' || student_id || ':' || extract(epoch FROM now())::bigint,
               jsonb_build_object('reason', 'Restore all wallets', 'previous_balance', balance)
        FROM target WHERE balance <> restore_to
        RETURNING account_id, balance_after
      )
      UPDATE credit.credit_accounts ca SET balance = txn.balance_after, updated_at = now()
      FROM txn WHERE ca.id = txn.account_id
      RETURNING ca.student_id`);
    await client.query('COMMIT');
    console.log(`[restore-coins] ${rows.length} wallet(s) restored; every student now has the starting balance.`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
