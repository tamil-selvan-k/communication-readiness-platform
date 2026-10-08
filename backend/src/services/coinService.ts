/**
 * Session coins — the student-facing view of the credit ledger (credit.credit_accounts).
 *
 *   1 coin = consume_amount credits of the GLOBAL credit policy (10 by default)
 *   wallet = at most MAX_COINS coins
 *   start a session            → −1 coin (refused at 0)
 *   fair completion            → +2 coins (the spent coin back plus a bonus), capped at MAX_COINS
 *   abandoned / disqualified   → the spent coin is lost
 *
 * Every change goes through CreditService, so it is an idempotent, audited transaction.
 */

import { db } from '../shared/db/pool';
import { AppError } from '../shared/errors/AppError';
import { CreditService } from '../modules/credits/credits.service';

export const MAX_COINS = 5;
const COMPLETION_REWARD_COINS = 2;

const SPEND_REASON = 'SESSION_START';
const REWARD_REASON = 'SESSION_COMPLETED';

async function coinPrice(): Promise<number> {
  const { rows } = await db.query<{ consume_amount: string }>(
    `SELECT consume_amount FROM credit.credit_policies
     WHERE scope_type = 'GLOBAL' AND is_active = TRUE ORDER BY created_at ASC LIMIT 1`
  );
  const price = Number(rows[0]?.consume_amount);
  return price > 0 ? price : 10;
}

const toCoins = (balance: number, price: number) => Math.max(0, Math.floor(balance / price));

async function balanceOf(studentId: string): Promise<number> {
  await CreditService.createAccount(studentId); // idempotent: students created outside registration
  const { rows } = await db.query<{ balance: string }>(
    'SELECT balance FROM credit.credit_accounts WHERE student_id = $1',
    [studentId]
  );
  return Number(rows[0]?.balance ?? 0);
}

export async function getCoins(studentId: string): Promise<{ coins: number; maxCoins: number }> {
  const [balance, price] = await Promise.all([balanceOf(studentId), coinPrice()]);
  return { coins: Math.min(MAX_COINS, toCoins(balance, price)), maxCoins: MAX_COINS };
}

/** Charges one coin for a session; `reference` (attempt id / session id) makes it idempotent. */
export async function spendCoin(studentId: string, reference: string): Promise<number> {
  const [balance, price] = await Promise.all([balanceOf(studentId), coinPrice()]);
  if (balance < price) {
    throw new AppError(402, 'You have no coins left. Coins are restored by your administrator.', 'INSUFFICIENT_COINS');
  }
  const { newBalance } = await CreditService.consume(studentId, price, SPEND_REASON, reference);
  return toCoins(newBalance, price);
}

/**
 * Fair completion of a charged session: the spent coin back plus a bonus, never above
 * MAX_COINS. Sessions that were never charged (e.g. staff-recorded attempts) earn nothing,
 * and each session is rewarded at most once.
 */
export async function rewardCompletion(studentId: string, reference: string): Promise<number> {
  const price = await coinPrice();
  const { rows } = await db.query(
    `SELECT 1 FROM credit.credit_transactions
     WHERE student_id = $1 AND reference_id::text = $2 AND transaction_type = 'CONSUME' AND reference_type = $3`,
    [studentId, reference, SPEND_REASON]
  );
  if (rows.length === 0) return toCoins(await balanceOf(studentId), price);
  const { newBalance } = await CreditService.earn(
    studentId, price * COMPLETION_REWARD_COINS, REWARD_REASON, reference, price * MAX_COINS);
  return toCoins(newBalance, price);
}

/** Gives back the coin of a session that never really started (e.g. a server error). */
export async function refundCoin(studentId: string, reference: string): Promise<number> {
  const price = await coinPrice();
  const { newBalance } = await CreditService.earn(studentId, price, 'SESSION_REFUND', reference, price * MAX_COINS);
  return toCoins(newBalance, price);
}

/** Admin: set the wallet to exactly `coins` (recorded as an ADJUST-style earn/consume). */
export async function setCoins(studentId: string, coins: number, actorUserId: string): Promise<number> {
  const target = Math.max(0, Math.min(MAX_COINS, Math.round(coins)));
  const [balance, price] = await Promise.all([balanceOf(studentId), coinPrice()]);
  const delta = target * price - balance;
  if (delta === 0) return target;
  // Unique per call so repeated restores are each recorded
  const reference = actorUserId;
  const reason = `ADMIN_SET_COINS:${Date.now()}`;
  const result = delta > 0
    ? await CreditService.earn(studentId, delta, reason, reference, price * MAX_COINS)
    : await CreditService.consume(studentId, -delta, reason, reference);
  return toCoins(result.newBalance, price);
}
