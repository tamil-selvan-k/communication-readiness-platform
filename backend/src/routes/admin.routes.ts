import { Router, Response } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '../shared/db/pool';
import { AppError } from '../shared/errors/AppError';
import { sendSuccess, sendError } from '../shared/helpers/response';
import { AuthRequest } from '../middleware/authenticate';
import { requireRole } from '../middleware/authorize';
import { sendStaffWelcomeEmail } from '../services/emailService';
import { STUDENT_SUMMARY_SELECT } from '../services/studentDirectory';
import { env } from '../config/env';
import { eventBus } from '../shared/events/eventBus';
import { Events, UserRegisteredPayload } from '../shared/events/events';
import { UserRole, ADMIN_ROLES, STUDENT_READ_ROLES } from '../shared/types/roles';

export const adminRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Who may do what ───────────────────────────────────────────────────────────
// Everything is scoped to the caller's institution (identity.users.institution_id);
// only the Platform Owner works across institutions.

const USER_READERS: UserRole[] = ['PLATFORM_OWNER', ...ADMIN_ROLES, 'PLACEMENT_COORDINATOR', 'COUNSELLOR'];
const USER_MANAGERS: UserRole[] = ['PLATFORM_OWNER', 'SUPER_ADMIN', 'COLLEGE_ADMIN', 'PROGRAM_ADMIN'];
const ACCOUNT_CREATORS: UserRole[] = [...USER_MANAGERS, 'DEPARTMENT_ADMIN'];
const STUDENT_ENROLLERS: UserRole[] = [...ACCOUNT_CREATORS, 'FACULTY_MENTOR', 'COUNSELLOR'];

// Senior administrators may create and manage other administrators.
const SENIOR_ROLES: UserRole[] = ['PLATFORM_OWNER', 'SUPER_ADMIN', 'COLLEGE_ADMIN'];
const STAFF_ASSIGNABLE: UserRole[] = ['FACULTY_MENTOR', 'TRAINER', 'PLACEMENT_COORDINATOR', 'COUNSELLOR'];
const ADMIN_ASSIGNABLE: UserRole[] = ['PROGRAM_ADMIN', 'DEPARTMENT_ADMIN'];

function assignableRoles(caller: UserRole): UserRole[] {
  return SENIOR_ROLES.includes(caller) ? [...STAFF_ASSIGNABLE, ...ADMIN_ASSIGNABLE] : STAFF_ASSIGNABLE;
}

// The caller's institution, or null for the Platform Owner (all institutions).
async function callerInstitution(req: AuthRequest): Promise<string | null> {
  if (req.user!.role === 'PLATFORM_OWNER') return null;
  const { rows } = await db.query<{ institution_id: string | null }>(
    'SELECT institution_id FROM identity.users WHERE id = $1',
    [req.user!.id]
  );
  const institutionId = rows[0]?.institution_id;
  if (!institutionId) throw new AppError(403, 'Your account is not linked to an institution', 'NO_INSTITUTION');
  return institutionId;
}

// Loads a user the caller is allowed to change: never themselves, never outside
// their institution, and administrators only by more senior administrators.
async function loadManageableUser(req: AuthRequest, userId: string) {
  if (!UUID_RE.test(userId)) throw new AppError(404, 'User not found', 'NOT_FOUND');
  if (userId === req.user!.id) throw new AppError(403, 'You cannot change your own account', 'FORBIDDEN');

  const { rows } = await db.query<{ id: string; role: UserRole; institution_id: string | null }>(
    'SELECT id, role, institution_id FROM identity.users WHERE id = $1',
    [userId]
  );
  const target = rows[0];
  const institutionId = await callerInstitution(req);
  // Users of other institutions are reported as missing rather than forbidden
  if (!target || (institutionId && target.institution_id !== institutionId)) {
    throw new AppError(404, 'User not found', 'NOT_FOUND');
  }

  const caller = req.user!.role;
  if (target.role === 'PLATFORM_OWNER') throw new AppError(403, 'The platform owner cannot be changed here', 'FORBIDDEN');
  if ((target.role === 'SUPER_ADMIN' || target.role === 'COLLEGE_ADMIN') && caller !== 'PLATFORM_OWNER') {
    throw new AppError(403, 'Only the platform owner can change a college administrator', 'FORBIDDEN');
  }
  if (ADMIN_ASSIGNABLE.includes(target.role) && !SENIOR_ROLES.includes(caller)) {
    throw new AppError(403, 'Only a Super Admin can change another administrator', 'FORBIDDEN');
  }
  return target;
}

const temporaryPassword = () => crypto.randomBytes(16).toString('hex').slice(0, 12);

// Without SMTP the welcome email is never sent, so the admin must hand the
// temporary password over; with SMTP it only travels by email.
const passwordForResponse = (password: string) => (env.SMTP_USER ? undefined : password);

// ── GET /api/admin/users ─────────────────────────────────────────────────────

adminRouter.get(
  '/users',
  requireRole(...USER_READERS),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const institutionId = await callerInstitution(req);
      const roleFilter = (req.query.role as string) ?? null;
      const statusFilter = (req.query.status as string) ?? null;
      const searchFilter = (req.query.search as string) ?? null;

      const { rows } = await db.query(
        `SELECT u.id, u.name, u.email, u.role, u.status, u.institution_id, u.department_id,
                u.created_at, s.id AS student_id, s.roll_number
         FROM identity.users u
         LEFT JOIN org.students s ON s.user_id = u.id
         WHERE ($1::text IS NULL OR u.role::text = $1)
           AND ($2::text IS NULL OR u.status::text = $2)
           AND ($3::text IS NULL OR u.name ILIKE '%' || $3 || '%' OR u.email ILIKE '%' || $3 || '%')
           AND ($4::uuid IS NULL OR u.institution_id = $4)
         ORDER BY u.created_at DESC
         LIMIT 500`,
        [roleFilter, statusFilter, searchFilter, institutionId]
      );
      sendSuccess(res, { users: rows });
    } catch (err) {
      sendError(res, err);
    }
  }
);

// ── PATCH /api/admin/users/:userId/role ──────────────────────────────────────

const roleSchema = z.object({
  role: z.enum(['FACULTY_MENTOR', 'TRAINER', 'PLACEMENT_COORDINATOR', 'COUNSELLOR', 'PROGRAM_ADMIN', 'DEPARTMENT_ADMIN']),
});

adminRouter.patch(
  '/users/:userId/role',
  requireRole(...USER_MANAGERS),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const parsed = roleSchema.safeParse(req.body);
      if (!parsed.success) throw new AppError(422, 'Invalid role value', 'VALIDATION_ERROR');
      const newRole = parsed.data.role;

      const target = await loadManageableUser(req, req.params.userId as string);
      if (target.role === 'STUDENT') {
        throw new AppError(422, 'Student accounts cannot be given a staff role', 'VALIDATION_ERROR');
      }
      if (!assignableRoles(req.user!.role).includes(newRole)) {
        throw new AppError(403, `You cannot grant the ${newRole} role`, 'FORBIDDEN');
      }

      // token_version bump signs the user out so the new role applies immediately
      const { rows } = await db.query(
        `UPDATE identity.users
         SET role = $1, token_version = token_version + 1, updated_at = now()
         WHERE id = $2
         RETURNING id, name, email, role`,
        [newRole, target.id]
      );
      sendSuccess(res, { user: rows[0] });
    } catch (err) {
      sendError(res, err);
    }
  }
);

// ── PATCH /api/admin/users/:userId/status ────────────────────────────────────

const statusSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']),
});

adminRouter.patch(
  '/users/:userId/status',
  requireRole(...USER_MANAGERS),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const parsed = statusSchema.safeParse(req.body);
      if (!parsed.success) throw new AppError(422, 'Invalid status value', 'VALIDATION_ERROR');
      const { status } = parsed.data;

      const target = await loadManageableUser(req, req.params.userId as string);

      // Deactivating or suspending also revokes every token the user holds
      const isActive = status === 'ACTIVE';
      const { rows } = await db.query(
        `UPDATE identity.users
         SET status = $1,
             is_active = $2,
             token_version = token_version + CASE WHEN $2 THEN 0 ELSE 1 END,
             updated_at = now()
         WHERE id = $3
         RETURNING id, name, email, status`,
        [status, isActive, target.id]
      );
      sendSuccess(res, { user: rows[0] });
    } catch (err) {
      sendError(res, err);
    }
  }
);

// ── POST /api/admin/users — create a staff account ───────────────────────────

const createStaffSchema = z.object({
  name: z.string().trim().min(2).max(255),
  email: z.string().email().transform(s => s.toLowerCase()),
  role: z.enum(['FACULTY_MENTOR', 'TRAINER', 'PLACEMENT_COORDINATOR', 'COUNSELLOR', 'PROGRAM_ADMIN', 'DEPARTMENT_ADMIN']),
  departmentId: z.string().uuid().optional(),
  // Only the Platform Owner (no institution of their own) chooses the institution
  institutionId: z.string().uuid().optional(),
});

adminRouter.post(
  '/users',
  requireRole(...ACCOUNT_CREATORS),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const parsed = createStaffSchema.safeParse(req.body);
      if (!parsed.success) throw new AppError(422, 'Validation failed', 'VALIDATION_ERROR');
      const { name, email, role, departmentId } = parsed.data;

      if (!assignableRoles(req.user!.role).includes(role)) {
        throw new AppError(403, `You cannot create a ${role} account`, 'FORBIDDEN');
      }
      const institutionId = (await callerInstitution(req)) ?? parsed.data.institutionId;
      if (!institutionId) throw new AppError(422, 'institutionId is required', 'VALIDATION_ERROR');

      if (departmentId) {
        const { rows: dept } = await db.query(
          'SELECT id FROM org.departments WHERE id = $1 AND institution_id = $2',
          [departmentId, institutionId]
        );
        if (dept.length === 0) throw new AppError(404, 'Department not found', 'NOT_FOUND');
      }

      const { rows: existing } = await db.query('SELECT id FROM identity.users WHERE email = $1', [email]);
      if (existing.length > 0) throw new AppError(409, 'Email already registered', 'CONFLICT');

      const password = temporaryPassword();
      const passwordHash = await bcrypt.hash(password, 10);

      const { rows } = await db.query(
        `INSERT INTO identity.users (name, email, password_hash, role, institution_id, department_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, name, email, role, institution_id, department_id, created_at`,
        [name, email, passwordHash, role, institutionId, departmentId ?? null]
      );
      const user = rows[0];

      // Send welcome email non-blocking — failure must not break the 201 response
      sendStaffWelcomeEmail({
        to: email,
        name,
        role,
        password,
        createdBy: req.user?.name ?? 'Platform Admin',
      }).catch((err: unknown) => {
        console.error('[adminRouter] Welcome email failed:', err);
      });

      sendSuccess(res, { user, temporaryPassword: passwordForResponse(password) }, 201);
    } catch (err) {
      sendError(res, err);
    }
  }
);

// ── Students ─────────────────────────────────────────────────────────────────

// GET /api/admin/students?programId=&batchId=&search= — institution student directory
adminRouter.get(
  '/students',
  requireRole(...STUDENT_READ_ROLES),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const institutionId = await callerInstitution(req);
      const programId = (req.query.programId as string) || null;
      const batchId = (req.query.batchId as string) || null;
      const search = (req.query.search as string) || null;
      const { rows } = await db.query(
        `${STUDENT_SUMMARY_SELECT}
         WHERE ($1::uuid IS NULL OR u.institution_id = $1)
           AND ($2::text IS NULL OR b.program_id::text = $2)
           AND ($3::text IS NULL OR s.batch_id::text = $3)
           AND ($4::text IS NULL OR u.name ILIKE '%' || $4 || '%' OR u.email ILIKE '%' || $4 || '%'
                OR s.roll_number ILIKE '%' || $4 || '%')
         ORDER BY u.name
         LIMIT 1000`,
        [institutionId, programId, batchId, search]
      );
      sendSuccess(res, { students: rows });
    } catch (err) {
      sendError(res, err);
    }
  }
);

const enrolSchema = z.object({
  name: z.string().trim().min(2).max(255),
  email: z.string().email().transform(s => s.toLowerCase()),
  rollNumber: z.string().trim().min(1).max(50).optional(),
  batchId: z.string().uuid(),
  subdivisionId: z.string().uuid().optional(),
  mentorUserId: z.string().uuid().optional(),
  password: z.string().min(8).optional(),
});
type EnrolInput = z.infer<typeof enrolSchema>;

// Creates one student account inside the caller's institution. A mentor who
// enrols a student becomes that student's mentor.
async function enrolStudent(req: AuthRequest, input: EnrolInput, institutionId: string | null) {
  const { rows: batchRows } = await db.query<{ program_id: string; institution_id: string }>(
    `SELECT b.program_id, p.institution_id
     FROM org.batches b JOIN org.programs p ON p.id = b.program_id
     WHERE b.id = $1 AND b.is_active = true`,
    [input.batchId]
  );
  const batch = batchRows[0];
  if (!batch || (institutionId && batch.institution_id !== institutionId)) {
    throw new AppError(404, 'Batch not found', 'NOT_FOUND');
  }

  const mentorUserId = req.user!.role === 'FACULTY_MENTOR' ? req.user!.id : input.mentorUserId;
  if (mentorUserId && mentorUserId !== req.user!.id) {
    const { rows: mentor } = await db.query(
      `SELECT id FROM identity.users WHERE id = $1 AND role = 'FACULTY_MENTOR' AND institution_id = $2`,
      [mentorUserId, batch.institution_id]
    );
    if (mentor.length === 0) throw new AppError(404, 'Mentor not found', 'NOT_FOUND');
  }

  const password = input.password ?? temporaryPassword();
  const passwordHash = await bcrypt.hash(password, 10);

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows: userRows } = await client.query<{ id: string }>(
      `INSERT INTO identity.users (name, email, password_hash, role, institution_id)
       VALUES ($1, $2, $3, 'STUDENT', $4) RETURNING id`,
      [input.name, input.email, passwordHash, batch.institution_id]
    );
    const userId = userRows[0].id;
    const { rows: studentRows } = await client.query<{ id: string }>(
      `INSERT INTO org.students (user_id, roll_number, program_id, batch_id, subdivision_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [userId, input.rollNumber ?? null, batch.program_id, input.batchId, input.subdivisionId ?? null]
    );
    const studentId = studentRows[0].id;
    if (mentorUserId) {
      await client.query(
        `INSERT INTO org.student_mentor_assignments (student_id, mentor_user_id, assigned_by, is_active, starts_at)
         VALUES ($1, $2, $3, true, now())`,
        [studentId, mentorUserId, req.user!.id]
      );
    }
    await client.query('COMMIT');

    // Credit account + performance profile are created by the USER_REGISTERED handlers
    const payload: UserRegisteredPayload = { userId, studentId, email: input.email, name: input.name };
    eventBus.emit(Events.USER_REGISTERED, payload);

    return {
      studentId,
      userId,
      email: input.email,
      name: input.name,
      temporaryPassword: input.password ? undefined : passwordForResponse(password),
    };
  } catch (err) {
    await client.query('ROLLBACK');
    if ((err as { code?: string }).code === '23505') {
      const isRoll = (err as { constraint?: string }).constraint === 'uq_students_roll_number';
      throw new AppError(409, isRoll ? 'Roll number already registered' : 'Email already registered', 'CONFLICT');
    }
    throw err;
  } finally {
    client.release();
  }
}

// POST /api/admin/students — enrol one student
adminRouter.post(
  '/students',
  requireRole(...STUDENT_ENROLLERS),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const parsed = enrolSchema.safeParse(req.body);
      if (!parsed.success) throw new AppError(422, 'Validation failed', 'VALIDATION_ERROR');
      const created = await enrolStudent(req, parsed.data, await callerInstitution(req));
      sendSuccess(res, { student: created }, 201);
    } catch (err) {
      sendError(res, err);
    }
  }
);

// POST /api/admin/students/bulk — enrol many; each row succeeds or fails on its own
const bulkSchema = z.object({ students: z.array(z.unknown()).min(1).max(500) });

adminRouter.post(
  '/students/bulk',
  requireRole(...ACCOUNT_CREATORS),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const parsed = bulkSchema.safeParse(req.body);
      if (!parsed.success) throw new AppError(422, 'Provide 1-500 students', 'VALIDATION_ERROR');
      const institutionId = await callerInstitution(req);

      const created: Awaited<ReturnType<typeof enrolStudent>>[] = [];
      const errors: { row: number; email?: string; message: string }[] = [];
      for (const [index, raw] of parsed.data.students.entries()) {
        const row = enrolSchema.safeParse(raw);
        if (!row.success) {
          errors.push({ row: index + 1, message: row.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ') });
          continue;
        }
        try {
          created.push(await enrolStudent(req, row.data, institutionId));
        } catch (err) {
          errors.push({ row: index + 1, email: row.data.email, message: err instanceof AppError ? err.message : 'Could not create student' });
        }
      }
      sendSuccess(res, { created, errors }, created.length > 0 ? 201 : 422);
    } catch (err) {
      sendError(res, err);
    }
  }
);
