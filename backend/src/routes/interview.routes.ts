import { Router, Response } from 'express';
import { z } from 'zod';
import { db } from '../shared/db/pool';
import { AppError } from '../shared/errors/AppError';
import { sendSuccess, sendError } from '../shared/helpers/response';
import { AuthRequest } from '../middleware/authenticate';
import { requireRole } from '../middleware/authorize';
import { assertStudentAccess } from '../shared/auth/studentScope';
import { STUDENT_READ_ROLES } from '../shared/types/roles';
import {
  StudentContext,
  createAttemptAndSession,
  completeAttempt,
  startLiveInterview,
} from '../services/interviewSessionService';

export const interviewRouter = Router();

// Mounted at /api/interview (next to the live WebSocket at /api/interview/ws)
export const liveInterviewRouter = Router();

// ── Validation schemas ────────────────────────────────────────────────────────

const startSessionSchema = z.object({
  studentId: z.string().uuid(),
  goal:      z.string().min(1).max(500).default('Improve technical skills and interview readiness'),
});

const startLiveSessionSchema = z.object({
  sessionType: z.literal('MOCK_INTERVIEW').default('MOCK_INTERVIEW'),
  // Parsed resume (from the browser) so questions are grounded in the candidate's projects
  resume: z.object({
    skills: z.array(z.string().max(80)).max(40).optional(),
    projects: z.array(z.object({
      title: z.string().max(200),
      techStack: z.array(z.string().max(80)).max(20).optional(),
      description: z.string().max(1000).optional(),
    })).max(10).optional(),
  }).optional(),
});

const concludeSessionSchema = z.object({
  goal:               z.string().min(1).max(500).optional(),
  overallScore:       z.number().min(0).max(100),
  technicalScore:     z.number().min(0).max(100).optional().nullable(),
  communicationScore: z.number().min(0).max(100).optional().nullable(),
  listeningScore:     z.number().min(0).max(100).optional().nullable(),
});

// Manually recorded attempts (POST /, /:id/conclude) carry client-supplied
// scores, so only staff may use them — students take live interviews, where the
// server computes every score. Mentors are further limited to their mentees.
const requireAssessmentStaff = requireRole(...STUDENT_READ_ROLES, 'FACULTY_MENTOR');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Helper: look up student org context ──────────────────────────────────────

async function getStudentContext(studentId: string): Promise<StudentContext> {
  const { rows } = await db.query<StudentContext>(
    `SELECT s.id, b.program_id, s.batch_id, s.subdivision_id
     FROM org.students s
     JOIN org.batches b ON b.id = s.batch_id
     WHERE s.id = $1`,
    [studentId]
  );
  if (rows.length === 0) throw new AppError(404, 'Student not found', 'NOT_FOUND');
  return rows[0];
}

// ── POST /api/interview/sessions — Start a live voice interview ──────────────
// The student is taken from the JWT (never the request body). Returns the
// session id used by the live WebSocket (/api/interview/ws/:sessionId) and the
// first question.

liveInterviewRouter.post(
  '/sessions',
  requireRole('STUDENT'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const parsed = startLiveSessionSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        throw new AppError(422, 'Only MOCK_INTERVIEW sessions can be started here', 'VALIDATION_ERROR');
      }
      const session = await startLiveInterview(req.user!.id, parsed.data.resume);
      console.log(`[interview] Live session started sessionId=${session.sessionId} attemptId=${session.attemptId}`);
      sendSuccess(res, session, 201);
    } catch (err) {
      sendError(res, err);
    }
  }
);

// ── POST /api/sessions — Record an interview session (staff) ─────────────────
// Creates a new assessment_attempt linked to the student and returns the session ID.

interviewRouter.post('/', requireAssessmentStaff, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const parsed = startSessionSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(422, 'Validation failed', 'VALIDATION_ERROR');
    const { studentId, goal } = parsed.data;
    await assertStudentAccess(req.user!, studentId);

    const student = await getStudentContext(studentId);
    const { sessionId, attemptId } = await createAttemptAndSession(student);

    console.log(
      `[interview] Session started sessionId=${sessionId} attemptId=${attemptId} ` +
      `studentId=${studentId} goal="${goal}"`
    );

    sendSuccess(res, { sessionId, attemptId, goal }, 201);
  } catch (err) {
    sendError(res, err);
  }
});

// ── POST /api/sessions/:id/conclude — Conclude session, trigger Module 3 ─────
// Marks the attempt COMPLETED, stores scores, emits ATTEMPT_COMPLETED event.
// The event handler in module3Handlers.ts updates performance data AND triggers
// the Module 3 agent, which calls Groq to generate a personalized roadmap.

interviewRouter.post('/:id/conclude', requireAssessmentStaff, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const sessionId = req.params.id as string;
    if (!UUID_RE.test(sessionId)) throw new AppError(404, 'Session not found', 'NOT_FOUND');
    const parsed = concludeSessionSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(422, 'Validation failed', 'VALIDATION_ERROR');
    const {
      goal,
      overallScore,
      technicalScore,
      communicationScore,
      listeningScore,
    } = parsed.data;

    // Load attempt via session
    const { rows: sessionRows } = await db.query(
      `SELECT ss.attempt_id, a.student_id
       FROM session.assessment_sessions ss
       JOIN assessment.assessment_attempts a ON a.id = ss.attempt_id
       WHERE ss.id = $1`,
      [sessionId]
    );
    if (sessionRows.length === 0) {
      throw new AppError(404, 'Session not found', 'NOT_FOUND');
    }
    const attemptId: string = sessionRows[0].attempt_id;
    await assertStudentAccess(req.user!, sessionRows[0].student_id);

    const resolvedGoal =
      goal ?? 'Improve technical skills, communication skills, and interview readiness';

    const concluded = await completeAttempt(
      sessionId,
      attemptId,
      {
        overallScore,
        technicalScore: technicalScore ?? null,
        communicationScore: communicationScore ?? null,
        listeningScore: listeningScore ?? null,
      },
      resolvedGoal,
    );
    if (!concluded) {
      sendSuccess(res, { message: 'Already concluded', attemptId });
      return;
    }

    console.log(
      `[interview] Session concluded sessionId=${sessionId} attemptId=${attemptId} ` +
      `overallScore=${overallScore} goal="${resolvedGoal}"`
    );

    sendSuccess(res, { message: 'Session concluded. Module 3 agent triggered.', attemptId });
  } catch (err) {
    sendError(res, err);
  }
});
