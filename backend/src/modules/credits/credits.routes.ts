import { Router, Response } from 'express';
import { z } from 'zod';
import { db } from '../../shared/db/pool';
import { AppError } from '../../shared/errors/AppError';
import { sendSuccess, sendError } from '../../shared/helpers/response';
import { authenticate, AuthRequest } from '../../middleware/authenticate';
import { assertStudentAccess } from '../../shared/auth/studentScope';
import { requireRole } from '../../middleware/authorize';
import { CreditService } from './credits.service';
import { cache } from '../../services/cacheService';

export const creditsRouter = Router();

// GET /api/credits/balance/:studentId
creditsRouter.get(
  '/balance/:studentId',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { studentId } = req.params;

      // Students: own record only; mentors: assigned students only
      await assertStudentAccess(req.user!, studentId as string);

      const key = `credits:balance:${studentId}`;
      const cached = await cache.get<object>(key);
      if (cached) { sendSuccess(res, cached); return; }

      const { rows } = await db.query(
        'SELECT id, balance, created_at, updated_at FROM credit.credit_accounts WHERE student_id = $1',
        [studentId]
      );
      if (rows.length === 0) throw new AppError(404, 'Credit account not found', 'NOT_FOUND');

      const { rows: totals } = await db.query(
        `SELECT
           COALESCE(SUM(amount) FILTER (WHERE transaction_type IN ('EARN', 'INITIAL')), 0) AS total_earned,
           COALESCE(ABS(SUM(amount) FILTER (WHERE transaction_type = 'CONSUME')), 0)       AS total_consumed
         FROM credit.credit_transactions
         WHERE student_id = $1`,
        [studentId]
      );

      const data = {
        studentId,
        balance: Number(rows[0].balance),
        accountId: rows[0].id,
        updatedAt: rows[0].updated_at,
        totalEarned: Number(totals[0].total_earned),
        totalConsumed: Number(totals[0].total_consumed),
      };
      await cache.set(key, data, 30);
      sendSuccess(res, data);
    } catch (err) {
      sendError(res, err);
    }
  }
);

// GET /api/credits/transactions/:studentId
creditsRouter.get(
  '/transactions/:studentId',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { studentId } = req.params;

      // Students: own record only; mentors: assigned students only
      await assertStudentAccess(req.user!, studentId as string);

      const page  = Math.max(1, parseInt(req.query.page as string  || '1', 10));
      const limit = Math.min(100, parseInt(req.query.limit as string || '20', 10));
      const offset = (page - 1) * limit;

      const key = `credits:txns:${studentId}:${page}:${limit}`;
      const cached = await cache.get<object>(key);
      if (cached) { sendSuccess(res, cached); return; }

      const { rows } = await db.query(
        `SELECT id, transaction_type, amount, balance_after, reference_type, reference_id,
                metadata, created_at
         FROM credit.credit_transactions
         WHERE student_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [studentId, limit, offset]
      );

      const { rows: countRows } = await db.query(
        'SELECT COUNT(*) AS total FROM credit.credit_transactions WHERE student_id = $1',
        [studentId]
      );

      const data = {
        transactions: rows,
        pagination: { total: parseInt(countRows[0].total, 10), page, limit },
      };
      await cache.set(key, data, 60);
      sendSuccess(res, data);
    } catch (err) {
      sendError(res, err);
    }
  }
);

// POST /api/credits/adjust — admin manual adjustment
const adjustSchema = z.object({
  studentId:  z.string().uuid(),
  amount:     z.number(),
  reason:     z.string().min(1).max(200),
  referenceId: z.string().uuid().optional(),
});

creditsRouter.post(
  '/adjust',
  authenticate,
  requireRole('PLACEMENT_COORDINATOR', 'SUPER_ADMIN'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const parsed = adjustSchema.safeParse(req.body);
      if (!parsed.success) throw new AppError(422, 'Validation failed', 'VALIDATION_ERROR');
      const { studentId, amount, reason, referenceId } = parsed.data;
      const refId = referenceId ?? req.user!.id;

      let result: { newBalance: number; transactionId: string };
      if (amount > 0) {
        result = await CreditService.earn(studentId, amount, `ADJUST:${reason}`, refId);
      } else if (amount < 0) {
        result = await CreditService.consume(studentId, Math.abs(amount), `ADJUST:${reason}`, refId);
      } else {
        throw new AppError(422, 'Amount cannot be zero', 'VALIDATION_ERROR');
      }
      await Promise.all([
        cache.del(`credits:balance:${studentId}`),
        cache.delPattern(`credits:txns:${studentId}:*`),
      ]);
      sendSuccess(res, { newBalance: result.newBalance, transactionId: result.transactionId });
    } catch (err) {
      sendError(res, err);
    }
  }
);
