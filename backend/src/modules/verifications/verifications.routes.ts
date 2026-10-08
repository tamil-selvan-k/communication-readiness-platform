import { Router, Response } from 'express';
import { z } from 'zod';
import { db } from '../../shared/db/pool';
import { AppError } from '../../shared/errors/AppError';
import { sendSuccess, sendError } from '../../shared/helpers/response';
import { authenticate, AuthRequest } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/authorize';
import { eventBus } from '../../shared/events/eventBus';
import { Events } from '../../shared/events/events';
import { EligibilityService } from '../placement/eligibility.service';

export const verificationsRouter = Router();

// GET /api/verifications/pending — mentor's pending verifications
verificationsRouter.get(
  '/pending',
  authenticate,
  requireRole('FACULTY_MENTOR'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;

      const { rows } = await db.query(
        `SELECT mv.id, mv.student_id, mv.verification_type, mv.checklist_progress_id,
                mv.status, mv.notes, mv.verified_at,
                cp.completion_evidence, cp.score, cp.updated_at AS progress_updated_at,
                ci.name AS checklist_item_name, ci.category AS checklist_item_category,
                u.name AS student_name, u.email AS student_email
         FROM placement.mentor_verifications mv
         JOIN placement.checklist_progress cp ON cp.id = mv.checklist_progress_id
         JOIN placement.checklist_items ci ON ci.id = cp.checklist_item_id
         JOIN org.students s ON s.id = mv.student_id
         JOIN identity.users u ON u.id = s.user_id
         WHERE mv.mentor_user_id = $1 AND mv.status = 'PENDING'
         ORDER BY mv.created_at ASC`,
        [userId]
      );

      sendSuccess(res, { verifications: rows });
    } catch (err) {
      sendError(res, err);
    }
  }
);

const requestSchema = z.object({
  checklistItemId: z.string().uuid(),
});

// POST /api/verifications/request — student requests mentor verification for a checklist item
verificationsRouter.post(
  '/request',
  authenticate,
  requireRole('STUDENT'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;

      const parsed = requestSchema.safeParse(req.body);
      if (!parsed.success) throw new AppError(422, 'Validation failed', 'VALIDATION_ERROR');
      const { checklistItemId } = parsed.data;

      // Resolve studentId from JWT
      const { rows: students } = await db.query(
        'SELECT id FROM org.students WHERE user_id = $1',
        [userId]
      );
      if (students.length === 0) throw new AppError(404, 'Student not found', 'NOT_FOUND');
      const studentId = students[0].id as string;

      // Verify checklist item exists
      const { rows: items } = await db.query(
        'SELECT id FROM placement.checklist_items WHERE id = $1 AND is_active = TRUE',
        [checklistItemId]
      );
      if (items.length === 0) throw new AppError(404, 'Checklist item not found', 'NOT_FOUND');

      // Look up assigned mentor
      const { rows: assignments } = await db.query(
        'SELECT mentor_user_id FROM org.student_mentor_assignments WHERE student_id = $1 AND is_active = TRUE LIMIT 1',
        [studentId]
      );
      if (assignments.length === 0) throw new AppError(422, 'No mentor assigned to this student', 'NO_MENTOR_ASSIGNED');
      const mentorUserId = assignments[0].mentor_user_id as string;

      // Upsert checklist_progress — move to IN_PROGRESS if still PENDING
      const { rows: progressRows } = await db.query(
        `INSERT INTO placement.checklist_progress (student_id, checklist_item_id, status)
         VALUES ($1, $2, 'IN_PROGRESS')
         ON CONFLICT (student_id, checklist_item_id) DO UPDATE
           SET updated_at = now()
         RETURNING id, status`,
        [studentId, checklistItemId]
      );
      const progressId = progressRows[0].id as string;

      // Check for existing PENDING verification to stay idempotent
      const { rows: existing } = await db.query(
        `SELECT id FROM placement.mentor_verifications
         WHERE checklist_progress_id = $1 AND mentor_user_id = $2 AND status = 'PENDING'`,
        [progressId, mentorUserId]
      );

      let verificationId: string;
      if (existing.length > 0) {
        verificationId = existing[0].id as string;
      } else {
        const { rows: inserted } = await db.query(
          `INSERT INTO placement.mentor_verifications
             (student_id, mentor_user_id, verification_type, checklist_progress_id, status)
           VALUES ($1, $2, 'CHECKLIST', $3, 'PENDING')
           RETURNING id`,
          [studentId, mentorUserId, progressId]
        );
        verificationId = inserted[0].id as string;
      }

      res.status(201);
      sendSuccess(res, {
        verificationId,
        status: 'PENDING',
        checklistItemId,
        message: 'Mentor verification requested',
      });
    } catch (err) {
      sendError(res, err);
    }
  }
);

const verifySchema = z.object({
  status: z.enum(['VERIFIED', 'REJECTED']),
  notes:  z.string().max(1000).optional(),
});

// POST /api/verifications/:progressId/verify — mentor verifies a checklist progress entry
verificationsRouter.post(
  '/:progressId/verify',
  authenticate,
  requireRole('FACULTY_MENTOR'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { progressId } = req.params;
      const userId = req.user!.id;

      const parsed = verifySchema.safeParse(req.body);
      if (!parsed.success) throw new AppError(422, 'Validation failed', 'VALIDATION_ERROR');
      const { status, notes } = parsed.data;

      // Verify this mentor is assigned to verify this progress entry
      const { rows: existing } = await db.query(
        `SELECT mv.id, mv.student_id, mv.status
         FROM placement.mentor_verifications mv
         WHERE mv.checklist_progress_id = $1 AND mv.mentor_user_id = $2`,
        [progressId, userId]
      );

      let verificationId: string;
      let studentId: string;

      if (existing.length > 0) {
        // Update existing verification record
        if (existing[0].status !== 'PENDING') {
          throw new AppError(409, 'Verification already completed', 'CONFLICT');
        }
        const { rows: updated } = await db.query(
          `UPDATE placement.mentor_verifications SET
             status      = $1,
             notes       = $2,
             verified_at = now(),
             updated_at  = now()
           WHERE id = $3
           RETURNING id, student_id, status`,
          [status, notes ?? null, existing[0].id]
        );
        verificationId = updated[0].id as string;
        studentId = updated[0].student_id as string;
      } else {
        // Check that checklist progress exists and mentor is assigned to this student
        const { rows: progress } = await db.query(
          `SELECT cp.id, cp.student_id
           FROM placement.checklist_progress cp
           JOIN org.student_mentor_assignments sma
             ON sma.student_id = cp.student_id AND sma.mentor_user_id = $2 AND sma.is_active = TRUE
           WHERE cp.id = $1`,
          [progressId, userId]
        );
        if (progress.length === 0) {
          throw new AppError(403, 'Not authorized to verify this progress entry', 'FORBIDDEN');
        }
        studentId = progress[0].student_id as string;

        const { rows: inserted } = await db.query(
          `INSERT INTO placement.mentor_verifications
             (student_id, mentor_user_id, verification_type, checklist_progress_id, status, notes, verified_at)
           VALUES ($1, $2, 'CHECKLIST', $3, $4, $5, now())
           RETURNING id, student_id, status`,
          [studentId, userId, progressId, status, notes ?? null]
        );
        verificationId = inserted[0].id as string;
      }

      // If verified, mark progress as mentor-verified
      if (status === 'VERIFIED') {
        await db.query(
          `UPDATE placement.checklist_progress SET is_mentor_verified = TRUE, updated_at = now()
           WHERE id = $1`,
          [progressId]
        );
      }

      // Fetch checklist_item_id for enriched event payload
      const { rows: progressInfo } = await db.query(
        'SELECT checklist_item_id FROM placement.checklist_progress WHERE id = $1',
        [progressId]
      );
      const checklistItemId = (progressInfo[0]?.checklist_item_id as string) ?? null;

      // Fire MENTOR_VERIFIED event (triggers eligibility recalculation)
      eventBus.emit(Events.MENTOR_VERIFIED, {
        studentId,
        mentorId: userId,
        verifiedAt: new Date().toISOString(),
        checklistItemId,
        outcome: status as 'VERIFIED' | 'REJECTED',
      });

      // Recalculate eligibility immediately on verify action
      EligibilityService.recalculate(studentId).catch(err => {
        console.error('[M4] MENTOR_VERIFIED eligibility recalculate error:', (err as Error).message);
      });

      sendSuccess(res, { verificationId, status });
    } catch (err) {
      sendError(res, err);
    }
  }
);
