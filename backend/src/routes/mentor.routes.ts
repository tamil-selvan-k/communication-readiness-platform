import { Router, Response } from 'express';
import { z } from 'zod';
import { db } from '../shared/db/pool';
import { AppError } from '../shared/errors/AppError';
import { sendSuccess, sendError } from '../shared/helpers/response';
import { AuthRequest } from '../middleware/authenticate';
import { requireRole } from '../middleware/authorize';
import { STUDENT_SUMMARY_SELECT } from '../services/studentDirectory';

export const mentorRouter = Router();

// ── POST /api/mentors/assign (PROGRAM_ADMIN, SUPER_ADMIN, DEPARTMENT_ADMIN) ───

const assignSchema = z.object({
  studentId: z.string().uuid(),
  mentorId: z.string().uuid(),
});

mentorRouter.post(
  '/assign',
  requireRole('PROGRAM_ADMIN', 'SUPER_ADMIN', 'DEPARTMENT_ADMIN'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const parsed = assignSchema.safeParse(req.body);
      if (!parsed.success) throw new AppError(422, 'Validation failed', 'VALIDATION_ERROR');

      const { studentId, mentorId } = parsed.data;
      const assignedBy = req.user!.id;

      // Verify mentor exists and has the correct role
      const { rows: mentor } = await db.query(
        `SELECT id FROM identity.users WHERE id = $1 AND role = 'FACULTY_MENTOR'`,
        [mentorId]
      );
      if (mentor.length === 0) {
        throw new AppError(404, 'Mentor not found or not a FACULTY_MENTOR', 'NOT_FOUND');
      }

      // Verify student exists
      const { rows: student } = await db.query(
        `SELECT id FROM org.students WHERE id = $1`,
        [studentId]
      );
      if (student.length === 0) throw new AppError(404, 'Student not found', 'NOT_FOUND');

      // Deactivate + insert must be atomic — a crash between them would leave the student
      // with no active mentor, breaking all subsequent mentor-scoped operations.
      const client = await db.connect();
      let assignmentId: string;
      try {
        await client.query('BEGIN');
        await client.query(
          `UPDATE org.student_mentor_assignments SET is_active = false, ends_at = now()
           WHERE student_id = $1 AND is_active = true`,
          [studentId]
        );
        const { rows } = await client.query<{ id: string }>(
          `INSERT INTO org.student_mentor_assignments
             (student_id, mentor_user_id, assigned_by, is_active, starts_at)
           VALUES ($1, $2, $3, true, now()) RETURNING id`,
          [studentId, mentorId, assignedBy]
        );
        await client.query('COMMIT');
        assignmentId = rows[0].id;
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }

      sendSuccess(res, { assignment: { id: assignmentId, studentId, mentorId } }, 201);
    } catch (err) {
      sendError(res, err);
    }
  }
);

// ── GET /api/mentors/my-students (FACULTY_MENTOR) ────────────────────────────

mentorRouter.get(
  '/my-students',
  requireRole('FACULTY_MENTOR'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const mentorId = req.user!.id;
      const { rows } = await db.query(
        `${STUDENT_SUMMARY_SELECT}
         WHERE active_sma.mentor_user_id = $1
         ORDER BY u.name`,
        [mentorId]
      );
      sendSuccess(res, { students: rows });
    } catch (err) {
      sendError(res, err);
    }
  }
);
