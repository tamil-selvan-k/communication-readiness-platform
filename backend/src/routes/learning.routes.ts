import { Router, Response } from 'express';
import axios from 'axios';
import { z } from 'zod';
import { db } from '../shared/db/pool';
import { AppError } from '../shared/errors/AppError';
import { sendSuccess, sendError } from '../shared/helpers/response';
import { AuthRequest } from '../middleware/authenticate';
import { assertStudentAccess } from '../shared/auth/studentScope';
import { requireRole } from '../middleware/authorize';
import { env } from '../config/env';

export const learningRouter = Router();

// ── Scope guard ───────────────────────────────────────────────────────────────

async function assertStudentScope(req: AuthRequest, studentId: string): Promise<void> {
  await assertStudentAccess(req.user!, studentId);
}

// ─────────────────────────────────────────────────────────────────────────────
// KNOWLEDGE DOCUMENTS
// ─────────────────────────────────────────────────────────────────────────────

// Which documents the caller may read: PUBLIC ones, plus those scoped to their
// institution — and, for students, to their program/subdivision. The Platform
// Owner sees everything. Returns a SQL condition on alias `d` using params from $start.
async function knowledgeVisibility(
  req: AuthRequest,
  start: number,
): Promise<{ condition: string; params: unknown[] }> {
  const user = req.user!;
  if (user.role === 'PLATFORM_OWNER') return { condition: 'TRUE', params: [] };
  const { rows } = await db.query<{
    institution_id: string | null; program_id: string | null; subdivision_id: string | null;
  }>(
    `SELECT u.institution_id, b.program_id, s.subdivision_id
     FROM identity.users u
     LEFT JOIN org.students s ON s.user_id = u.id
     LEFT JOIN org.batches b  ON b.id = s.batch_id
     WHERE u.id = $1`,
    [user.id]
  );
  const scope = rows[0] ?? { institution_id: null, program_id: null, subdivision_id: null };
  const scoped = user.role === 'STUDENT'
    // A student-facing document must match every scope it sets
    ? `(d.institution_id IS NULL OR d.institution_id = $${start})
       AND (d.program_id IS NULL OR d.program_id = $${start + 1})
       AND (d.subdivision_id IS NULL OR d.subdivision_id = $${start + 2})`
    : `(d.institution_id IS NULL OR d.institution_id = $${start})`;
  return {
    condition: `(d.visibility_type = 'PUBLIC' OR (${scoped}))`,
    params: user.role === 'STUDENT'
      ? [scope.institution_id, scope.program_id, scope.subdivision_id]
      : [scope.institution_id],
  };
}

learningRouter.get('/knowledge', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const visibilityType = req.query.visibility_type as string | undefined;
    const visibility = await knowledgeVisibility(req, 1);
    const params: unknown[] = [...visibility.params];
    let sql = `SELECT d.id, d.title, d.source_type, d.source_url, d.visibility_type,
                      d.institution_id, d.program_id, d.subdivision_id, d.metadata,
                      d.created_at, d.updated_at
               FROM knowledge.knowledge_documents d`;
    const conditions: string[] = [visibility.condition];
    if (visibilityType) {
      params.push(visibilityType.toUpperCase());
      conditions.push(`d.visibility_type = $${params.length}`);
    }
    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY d.created_at DESC';
    const { rows } = await db.query(sql, params);
    sendSuccess(res, { documents: rows });
  } catch (err) {
    sendError(res, err);
  }
});

learningRouter.get('/knowledge/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const visibility = await knowledgeVisibility(req, 2);
    const { rows: docRows } = await db.query(
      `SELECT d.id, d.title, d.source_type, d.source_url, d.visibility_type,
              d.institution_id, d.program_id, d.subdivision_id, d.metadata, d.created_at, d.updated_at
       FROM knowledge.knowledge_documents d
       WHERE d.id::text = $1 AND ${visibility.condition}`,
      [req.params.id, ...visibility.params]
    );
    if (docRows.length === 0) throw new AppError(404, 'Document not found', 'NOT_FOUND');

    const { rows: chunkRows } = await db.query(
      `SELECT id, chunk_index, chunk_text, source_metadata
       FROM knowledge.knowledge_chunks WHERE document_id = $1 ORDER BY chunk_index`,
      [req.params.id]
    );
    sendSuccess(res, { document: docRows[0], chunks: chunkRows });
  } catch (err) {
    sendError(res, err);
  }
});

const createDocSchema = z.object({
  title:           z.string().min(1).max(500),
  source_type:     z.string().default('MANUAL'),
  source_url:      z.string().optional(),
  visibility_type: z.string().default('PUBLIC'),
  institution_id:  z.string().uuid().optional(),
  program_id:      z.string().uuid().optional(),
  subdivision_id:  z.string().uuid().optional(),
  metadata:        z.record(z.unknown()).optional(),
  chunks:          z.array(z.object({
    chunk_index:     z.number().int().min(0),
    chunk_text:      z.string().min(1),
    source_metadata: z.record(z.unknown()).optional(),
  })).optional(),
});

learningRouter.post(
  '/knowledge',
  requireRole('PROGRAM_ADMIN', 'TRAINER'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const parsed = createDocSchema.safeParse(req.body);
      if (!parsed.success) throw new AppError(422, 'Validation failed', 'VALIDATION_ERROR');
      const {
        title, source_type, source_url, visibility_type, institution_id,
        program_id, subdivision_id, metadata, chunks,
      } = parsed.data;

      const client = await db.connect();
      try {
        await client.query('BEGIN');
        const { rows: docRows } = await client.query(
          `INSERT INTO knowledge.knowledge_documents
             (title, source_type, source_url, visibility_type, institution_id,
              program_id, subdivision_id, metadata)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
          [
            title, source_type, source_url ?? null, visibility_type,
            institution_id ?? null, program_id ?? null, subdivision_id ?? null,
            JSON.stringify(metadata ?? {}),
          ]
        );
        const docId = docRows[0].id;
        const insertedChunks = [];
        for (const chunk of chunks ?? []) {
          const { rows: cr } = await client.query(
            `INSERT INTO knowledge.knowledge_chunks
               (document_id, chunk_index, chunk_text, source_metadata)
             VALUES ($1,$2,$3,$4) RETURNING id, chunk_index, chunk_text`,
            [docId, chunk.chunk_index, chunk.chunk_text,
             JSON.stringify(chunk.source_metadata ?? {})]
          );
          insertedChunks.push(cr[0]);
        }
        await client.query('COMMIT');
        sendSuccess(res, { document: docRows[0], chunks: insertedChunks }, 201);
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    } catch (err) {
      sendError(res, err);
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// LEARNING PLANS
// ─────────────────────────────────────────────────────────────────────────────

learningRouter.get('/plans/:studentId', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const studentId = req.params.studentId as string;
    await assertStudentScope(req, studentId);
    const { rows } = await db.query(
      `SELECT id, student_id, generated_by_agent_run_id, goal, plan_data,
              status, version, created_at, updated_at
       FROM performance.learning_plans WHERE student_id = $1 ORDER BY created_at DESC`,
      [studentId]
    );
    sendSuccess(res, { plans: rows });
  } catch (err) {
    sendError(res, err);
  }
});

learningRouter.get('/recommendations/:studentId', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const studentId = req.params.studentId as string;
    await assertStudentScope(req, studentId);
    const { rows } = await db.query(
      `SELECT lr.id, lr.learning_plan_id, lr.source_attempt_id, lr.skill_id,
              sk.name AS skill_name, lr.recommendation_type, lr.title,
              lr.description, lr.priority, lr.evidence, lr.status,
              lr.created_at, lr.updated_at
       FROM performance.learning_recommendations lr
       LEFT JOIN performance.skills sk ON sk.id = lr.skill_id
       WHERE lr.student_id = $1
       ORDER BY lr.priority DESC, lr.created_at DESC`,
      [studentId]
    );
    sendSuccess(res, { recommendations: rows });
  } catch (err) {
    sendError(res, err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// AGENT RUNS
// Node.js authenticates/authorises, then delegates execution to Python.
// ─────────────────────────────────────────────────────────────────────────────

const agentRunSchema = z.object({
  studentId: z.string().uuid(),
  goal:      z.string().min(1).max(500),
});

// ── POST /learning/agent/run — delegate to Python FastAPI agent service ────────

learningRouter.post('/agent/run', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const parsed = agentRunSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(422, 'Validation failed', 'VALIDATION_ERROR');
    const { studentId, goal } = parsed.data;

    await assertStudentScope(req, studentId);

    const { rows: studentRows } = await db.query(
      'SELECT id FROM org.students WHERE id = $1',
      [studentId]
    );
    if (studentRows.length === 0) throw new AppError(404, 'Student not found', 'NOT_FOUND');

    // Delegate entirely to the Python agent service
    const resp = await axios.post(
      `${env.AI_SERVICE_URL}/agent/run`,
      {
        student_id:            studentId,
        goal,
        triggered_by_user_id:  req.user!.id,
      },
      { timeout: 10_000, headers: { 'X-Internal-Key': env.INTERNAL_API_KEY } }
    );

    const agentRunId: string = resp.data.run_id;
    sendSuccess(res, { agentRunId }, 202);
  } catch (err) {
    // Treat axios network/HTTP errors as a service-unavailable response
    if (err && typeof err === 'object' && ('isAxiosError' in err || (err as Record<string, unknown>).code === 'ECONNREFUSED')) {
      sendError(res, new AppError(503, 'Agent service unavailable', 'AGENT_UNAVAILABLE'));
      return;
    }
    sendError(res, err);
  }
});

// ── GET /learning/agent/run/:runId — poll run status (reads shared DB directly) ──

learningRouter.get('/agent/run/:runId', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { rows: runRows } = await db.query(
      `SELECT id, student_id, status, goal_snapshot, termination_reason,
              correlation_id, started_at, completed_at, created_at
       FROM agent.agent_runs WHERE id = $1`,
      [req.params.runId]
    );
    if (runRows.length === 0) throw new AppError(404, 'Agent run not found', 'NOT_FOUND');
    const run = runRows[0];

    await assertStudentScope(req, run.student_id);

    const { rows: steps } = await db.query(
      `SELECT id, sequence_no, step_type, tool_name, input, output,
              status, error_code, error_message, duration_ms, created_at
       FROM agent.agent_steps
       WHERE agent_run_id = $1
       ORDER BY sequence_no ASC`,
      [req.params.runId]
    );

    let learningPlan = null;
    if (run.status === 'SUCCEEDED') {
      const { rows: planRows } = await db.query(
        `SELECT id, student_id, generated_by_agent_run_id, goal, plan_data,
                status, version, created_at, updated_at
         FROM performance.learning_plans
         WHERE generated_by_agent_run_id = $1`,
        [req.params.runId]
      );
      learningPlan = planRows[0] ?? null;
    }

    sendSuccess(res, { run, steps, learningPlan });
  } catch (err) {
    sendError(res, err);
  }
});
