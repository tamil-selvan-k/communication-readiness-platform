import { Router, Response } from 'express';
import { db } from '../shared/db/pool';
import { AppError } from '../shared/errors/AppError';
import { sendSuccess, sendError } from '../shared/helpers/response';
import { AuthRequest } from '../middleware/authenticate';
import { assertStudentAccess } from '../shared/auth/studentScope';

export const performanceRouter = Router();

// ── Scope guard ────────────────────────────────────────────────────────────────
// STUDENT: own studentId only.
// FACULTY_MENTOR: must have an active assignment to the target student.
// Other staff (STUDENT_READ_ROLES): any student.

async function assertScope(req: AuthRequest, studentId: string): Promise<void> {
  await assertStudentAccess(req.user!, studentId);
}

// ── GET /api/performance/:studentId ───────────────────────────────────────────

performanceRouter.get('/:studentId', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const studentId = req.params.studentId as string;
    await assertScope(req, studentId);
    const { rows } = await db.query(
      `SELECT id, student_id, technical_score, communication_score, listening_score,
              overall_score, previous_overall_score, trend, updated_at
       FROM performance.performance_profiles
       WHERE student_id = $1`,
      [req.params.studentId]
    );
    if (rows.length === 0) throw new AppError(404, 'Performance profile not found', 'NOT_FOUND');
    sendSuccess(res, { profile: rows[0] });
  } catch (err) {
    sendError(res, err);
  }
});

// ── GET /api/performance/:studentId/history ────────────────────────────────────

performanceRouter.get('/:studentId/history', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const studentId = req.params.studentId as string;
    await assertScope(req, studentId);
    // Non-numeric or negative values fall back to the defaults instead of reaching SQL as NaN
    const rawLimit  = parseInt(req.query.limit  as string, 10);
    const rawOffset = parseInt(req.query.offset as string, 10);
    const limit  = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 20;
    const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? rawOffset : 0;

    const { rows } = await db.query(
      `SELECT id, attempt_id, program_id, batch_id, subdivision_id,
              technical_score, communication_score, listening_score, overall_score,
              component_scores, skill_scores, captured_at
       FROM performance.performance_snapshots
       WHERE student_id = $1
       ORDER BY captured_at DESC
       LIMIT $2 OFFSET $3`,
      [studentId, limit, offset]
    );

    const { rows: countRows } = await db.query(
      'SELECT COUNT(*) AS total FROM performance.performance_snapshots WHERE student_id = $1',
      [studentId]
    );

    sendSuccess(res, { snapshots: rows, total: parseInt(countRows[0].total, 10) });
  } catch (err) {
    sendError(res, err);
  }
});

// ── GET /api/performance/:studentId/skills ─────────────────────────────────────
// Returns per-skill latest score and all historical records.

performanceRouter.get('/:studentId/skills', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const studentId = req.params.studentId as string;
    await assertScope(req, studentId);

    // Most recent score per skill
    const { rows } = await db.query(
      `SELECT sp.skill_id, sk.name AS skill_name, sk.category,
              sp.score, sp.proficiency_level, sp.source, sp.measured_at
       FROM performance.skill_performances sp
       JOIN performance.skills sk ON sk.id = sp.skill_id
       WHERE sp.student_id = $1
       ORDER BY sk.category, sk.name, sp.measured_at DESC`,
      [studentId]
    );

    // Group by skill, keep latest + history
    const bySkill: Record<string, {
      skill_id: string; skill_name: string; category: string;
      latest_score: number | null; proficiency_level: string | null;
      history: { score: number; measured_at: string }[];
    }> = {};

    for (const r of rows) {
      if (!bySkill[r.skill_id]) {
        bySkill[r.skill_id] = {
          skill_id: r.skill_id, skill_name: r.skill_name, category: r.category,
          latest_score: r.score, proficiency_level: r.proficiency_level, history: [],
        };
      }
      bySkill[r.skill_id].history.push({ score: r.score, measured_at: r.measured_at });
    }

    sendSuccess(res, { skills: Object.values(bySkill) });
  } catch (err) {
    sendError(res, err);
  }
});
