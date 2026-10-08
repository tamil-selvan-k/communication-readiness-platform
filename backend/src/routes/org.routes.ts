import { Router, Request, Response } from 'express';
import { db } from '../shared/db/pool';
import { sendSuccess, sendError } from '../shared/helpers/response';

export const orgRouter = Router();

// Columns follow the schema after migration 034: institutions have no type,
// batches have no track, and subdivisions belong to a program (not a batch).

// ── GET /api/org/institutions ─────────────────────────────────────────────────

orgRouter.get('/institutions', async (_req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = await db.query(
      `SELECT id, name, code, campus_city, created_at FROM org.institutions
       WHERE is_active = true
       ORDER BY name`
    );
    sendSuccess(res, { items: rows });
  } catch (err) {
    sendError(res, err);
  }
});

// ── GET /api/org/programs?institution_id= ────────────────────────────────────

orgRouter.get('/programs', async (req: Request, res: Response): Promise<void> => {
  try {
    const institutionId = (req.query.institution_id as string) ?? null;
    const { rows } = await db.query(
      `SELECT id, institution_id, name, code, created_at FROM org.programs
       WHERE ($1::text IS NULL OR institution_id::text = $1)
         AND is_active = true
       ORDER BY name`,
      [institutionId]
    );
    sendSuccess(res, { items: rows });
  } catch (err) {
    sendError(res, err);
  }
});

// ── GET /api/org/batches?program_id= ─────────────────────────────────────────

orgRouter.get('/batches', async (req: Request, res: Response): Promise<void> => {
  try {
    const programId = (req.query.program_id as string) ?? null;
    const { rows } = await db.query(
      `SELECT id, program_id, name, year, created_at FROM org.batches
       WHERE ($1::text IS NULL OR program_id::text = $1)
         AND is_active = true
       ORDER BY year DESC, name`,
      [programId]
    );
    sendSuccess(res, { items: rows });
  } catch (err) {
    sendError(res, err);
  }
});

// ── GET /api/org/subdivisions?program_id=  (or ?batch_id= → that batch's program)

orgRouter.get('/subdivisions', async (req: Request, res: Response): Promise<void> => {
  try {
    const programId = (req.query.program_id as string) ?? null;
    const batchId = (req.query.batch_id as string) ?? null;
    const { rows } = await db.query(
      `SELECT id, program_id, name, code, created_at FROM org.subdivisions
       WHERE ($1::text IS NULL OR program_id::text = $1)
         AND ($2::text IS NULL OR program_id = (SELECT program_id FROM org.batches WHERE id::text = $2))
         AND is_active = true
       ORDER BY name`,
      [programId, batchId]
    );
    sendSuccess(res, { items: rows });
  } catch (err) {
    sendError(res, err);
  }
});
