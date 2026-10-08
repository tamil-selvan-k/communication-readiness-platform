import { Response, NextFunction } from 'express';
import { db } from '../shared/db/pool';
import { AppError } from '../shared/errors/AppError';
import { sendError } from '../shared/helpers/response';
import { AuthRequest } from './authenticate';

/**
 * Guard: the authenticated user must be a TRAINER with an active
 * assignment for the :subdivisionId path parameter.
 * Used on trainer-scoped subdivision routes (M2+).
 */
export const requireActiveTrainerTenure = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = req.user;
    if (!user || user.role !== 'TRAINER') {
      throw new AppError(403, 'Access denied', 'FORBIDDEN');
    }

    const { subdivisionId } = req.params;
    if (!subdivisionId) {
      throw new AppError(400, 'subdivisionId param is required', 'VALIDATION_ERROR');
    }

    const { rows } = await db.query(
      `SELECT id FROM org.trainer_subdivision_assignments
       WHERE trainer_user_id = $1 AND subdivision_id = $2
         AND is_active = true
         AND (starts_at IS NULL OR starts_at <= now())
         AND (ends_at IS NULL OR ends_at >= now())`,
      [user.id, subdivisionId]
    );

    if (rows.length === 0) {
      throw new AppError(403, 'No active assignment for this subdivision', 'FORBIDDEN');
    }

    next();
  } catch (err) {
    sendError(res, err);
  }
};
