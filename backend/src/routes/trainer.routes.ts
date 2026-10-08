import { Router, Response } from 'express';
import { z } from 'zod';
import { db } from '../shared/db/pool';
import { AppError } from '../shared/errors/AppError';
import { sendSuccess, sendError } from '../shared/helpers/response';
import { AuthRequest } from '../middleware/authenticate';
import { requireRole } from '../middleware/authorize';

export const trainerRouter = Router();

// ── POST /api/trainers/assign (PROGRAM_ADMIN) ─────────────────────────────────

const assignSchema = z.object({
  trainerId: z.string().uuid(),
  subdivisionId: z.string().uuid(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be YYYY-MM-DD'),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'endDate must be YYYY-MM-DD')
    .optional(),
});

trainerRouter.post(
  '/assign',
  requireRole('PROGRAM_ADMIN'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const parsed = assignSchema.safeParse(req.body);
      if (!parsed.success) throw new AppError(422, 'Validation failed', 'VALIDATION_ERROR');

      const { trainerId, subdivisionId, startDate, endDate } = parsed.data;
      const assignedBy = req.user!.id;

      // Verify trainer exists and has correct role
      const { rows: trainer } = await db.query(
        `SELECT id FROM identity.users WHERE id = $1 AND role = 'TRAINER'`,
        [trainerId]
      );
      if (trainer.length === 0) {
        throw new AppError(404, 'Trainer not found or not a TRAINER', 'NOT_FOUND');
      }

      // Verify subdivision exists
      const { rows: sub } = await db.query(
        `SELECT id FROM org.subdivisions WHERE id = $1`,
        [subdivisionId]
      );
      if (sub.length === 0) throw new AppError(404, 'Subdivision not found', 'NOT_FOUND');

      const { rows } = await db.query(
        `INSERT INTO org.trainer_subdivision_assignments
           (trainer_user_id, subdivision_id, starts_at, ends_at, assigned_by, is_active)
         VALUES ($1, $2, $3::date, $4::date, $5, true) RETURNING id`,
        [trainerId, subdivisionId, startDate, endDate ?? null, assignedBy]
      );

      sendSuccess(res, { assignment: { id: rows[0].id } }, 201);
    } catch (err) {
      sendError(res, err);
    }
  }
);

// ── GET /api/trainers/my-subdivisions (TRAINER) ───────────────────────────────

trainerRouter.get(
  '/my-subdivisions',
  requireRole('TRAINER'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const trainerId = req.user!.id;
      const { rows } = await db.query(
        `SELECT tsa.id, tsa.starts_at AS start_date, tsa.ends_at AS end_date,
                sub.id as subdivision_id, sub.name as subdivision_name, sub.code,
                p.id as program_id, p.name as program_name
         FROM org.trainer_subdivision_assignments tsa
         JOIN org.subdivisions sub ON sub.id = tsa.subdivision_id
         JOIN org.programs p ON p.id = sub.program_id
         WHERE tsa.trainer_user_id = $1
           AND tsa.is_active = true
           AND (tsa.ends_at IS NULL OR tsa.ends_at >= CURRENT_DATE)
         ORDER BY tsa.starts_at DESC`,
        [trainerId]
      );
      sendSuccess(res, { subdivisions: rows });
    } catch (err) {
      sendError(res, err);
    }
  }
);
