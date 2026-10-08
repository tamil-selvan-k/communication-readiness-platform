import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { env } from '../config/env';
import { db } from '../shared/db/pool';
import { authenticate, AuthRequest, accountBlock } from '../middleware/authenticate';
import { AppError } from '../shared/errors/AppError';
import { sendSuccess, sendError } from '../shared/helpers/response';
import { eventBus } from '../shared/events/eventBus';
import { Events, UserRegisteredPayload } from '../shared/events/events';
import { UserRole } from '../shared/types/roles';
import { AuthUser } from '../shared/types/auth';
import { lockedForSeconds, recordFailure, clearFailures } from '../shared/security/loginThrottle';
import crypto from 'crypto';

export const authRouter = Router();

// A real bcrypt hash (cost 10) of a throwaway value, compared when the email does
// not exist so both paths cost the same. A malformed hash makes compare() return
// immediately, which would reveal which emails are registered.
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 10);

function signToken(user: AuthUser): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      tokenVersion: user.tokenVersion,
    },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] }
  );
}

// ── POST /api/auth/register ────────────────────────────────────────────────────

const registerSchema = z.object({
  name: z.string().min(2).max(255),
  email: z.string().email().transform(s => s.toLowerCase()),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  batchId: z.string().uuid(),
  subdivisionId: z.string().uuid().optional(),
  rollNumber: z.string().trim().min(1).max(50).optional(),
});

authRouter.post('/register', async (req: Request, res: Response): Promise<void> => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, new AppError(422, 'Validation failed', 'VALIDATION_ERROR'));
    return;
  }
  const { name, email, password, batchId, subdivisionId, rollNumber } = parsed.data;

  const client = await db.connect();
  try {
    const { rows: batchRows } = await client.query<{ id: string; program_id: string; institution_id: string }>(
      `SELECT b.id, b.program_id, p.institution_id
       FROM org.batches b JOIN org.programs p ON p.id = b.program_id
       WHERE b.id = $1 AND b.is_active = true`,
      [batchId]
    );
    if (batchRows.length === 0) {
      throw new AppError(404, 'Batch not found', 'NOT_FOUND');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await client.query('BEGIN');
    try {
      const { rows: userRows } = await client.query<{ id: string }>(
        `INSERT INTO identity.users (name, email, password_hash, role, token_version, status, institution_id)
         VALUES ($1, $2, $3, 'STUDENT', 0, 'ACTIVE', $4) RETURNING id`,
        [name, email, passwordHash, batchRows[0].institution_id]
      );
      const userId = userRows[0].id;

      // program_id is required and always the batch's program
      const { rows: studentRows } = await client.query<{ id: string }>(
        `INSERT INTO org.students (user_id, roll_number, program_id, batch_id, subdivision_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [userId, rollNumber ?? null, batchRows[0].program_id, batchId, subdivisionId ?? null]
      );
      const studentId = studentRows[0].id;

      await client.query('COMMIT');

      const authUser: AuthUser = { id: userId, email, role: 'STUDENT', name, tokenVersion: 0 };
      const token = signToken(authUser);

      const payload: UserRegisteredPayload = { userId, studentId, email, name };
      eventBus.emit(Events.USER_REGISTERED, payload);

      sendSuccess(res, { token, user: { id: userId, name, email, role: 'STUDENT' }, studentId }, 201);
    } catch (innerErr) {
      await client.query('ROLLBACK');
      throw innerErr;
    }
  } catch (err) {
    if (err instanceof AppError) { sendError(res, err); return; }
    if ((err as { code?: string }).code === '23505') {
      const isRollNumber = (err as { constraint?: string }).constraint === 'uq_students_roll_number';
      sendError(res, isRollNumber
        ? new AppError(409, 'Roll number already registered', 'DUPLICATE_ROLL_NUMBER')
        : new AppError(409, 'Email already registered', 'DUPLICATE_EMAIL'));
      return;
    }
    sendError(res, err);
  } finally {
    client.release();
  }
});

// ── POST /api/auth/login ───────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().email().transform(s => s.toLowerCase()),
  password: z.string().min(1),
});

authRouter.post('/login', async (req: Request, res: Response): Promise<void> => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, new AppError(422, 'Validation failed', 'VALIDATION_ERROR'));
    return;
  }
  const { email, password } = parsed.data;
  const ip = req.ip ?? 'unknown';

  try {
    const lockSeconds = lockedForSeconds(ip, email);
    if (lockSeconds > 0) {
      throw new AppError(429, `Too many failed attempts. Try again in ${Math.ceil(lockSeconds / 60)} minute(s).`, 'TOO_MANY_ATTEMPTS');
    }

    const { rows } = await db.query<{
      id: string; name: string; email: string; role: UserRole;
      password_hash: string; token_version: number; status: string;
    }>(
      `SELECT id, name, email, role, password_hash, token_version, status
       FROM identity.users WHERE email = $1`,
      [email]
    );

    // Always run bcrypt regardless of whether the email exists — prevents timing-based
    // user enumeration (a found email would otherwise be ~100ms slower than a missing one).
    const hashToCheck = rows.length > 0 ? rows[0].password_hash : DUMMY_HASH;
    const passwordMatch = await bcrypt.compare(password, hashToCheck);
    if (rows.length === 0 || !passwordMatch) {
      recordFailure(ip, email);
      throw new AppError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
    }
    clearFailures(ip, email);

    const user = rows[0];
    const blocked = accountBlock(user.status, null);
    if (blocked) throw blocked;

    let studentId: string | null = null;
    if (user.role === 'STUDENT') {
      const { rows: sRows } = await db.query<{ id: string }>(
        'SELECT id FROM org.students WHERE user_id = $1', [user.id]
      );
      studentId = sRows[0]?.id ?? null;
    }

    const authUser: AuthUser = {
      id: user.id, email: user.email, role: user.role,
      name: user.name, tokenVersion: user.token_version,
    };
    const token = signToken(authUser);

    sendSuccess(res, {
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      studentId,
    });
  } catch (err) {
    sendError(res, err);
  }
});

// ── POST /api/auth/logout ──────────────────────────────────────────────────────

authRouter.post('/logout', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await db.query(
      'UPDATE identity.users SET token_version = token_version + 1 WHERE id = $1',
      [req.user!.id]
    );
    sendSuccess(res, { message: 'Logged out successfully' });
  } catch (err) {
    sendError(res, err);
  }
});

// ── GET /api/auth/me ───────────────────────────────────────────────────────────

authRouter.get('/me', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    let studentId: string | null = null;
    if (req.user!.role === 'STUDENT') {
      const { rows } = await db.query<{ id: string }>(
        'SELECT id FROM org.students WHERE user_id = $1', [req.user!.id]
      );
      studentId = rows[0]?.id ?? null;
    }
    sendSuccess(res, {
      user: { id: req.user!.id, name: req.user!.name, email: req.user!.email, role: req.user!.role },
      studentId,
    });
  } catch (err) {
    sendError(res, err);
  }
});

// ── GET /api/auth/invite/:token ────────────────────────────────────────────────
// Public: shows the invitee who invited them before they set a password. Only
// pending, unexpired invites resolve; the token itself is the credential.

authRouter.get('/invite/:token', async (req: Request, res: Response): Promise<void> => {
  try {
    const token = String(req.params.token ?? '');
    if (!/^[0-9a-f]{64}$/i.test(token)) {
      throw new AppError(404, 'Invalid or expired invitation', 'INVALID_INVITE');
    }
    const { rows } = await db.query(
      `SELECT i.email, i.name, i.first_name, i.last_name, i.role, i.institution_id,
              inst.name AS institution_name, i.permissions, i.status, i.expires_at, i.created_at
       FROM identity.invites i
       LEFT JOIN org.institutions inst ON inst.id = i.institution_id
       WHERE i.token = $1 AND i.status = 'PENDING' AND i.expires_at > now()`,
      [token]
    );
    if (rows.length === 0) throw new AppError(404, 'Invalid or expired invitation', 'INVALID_INVITE');
    sendSuccess(res, { invite: rows[0] });
  } catch (err) {
    sendError(res, err);
  }
});

// ── POST /api/auth/accept-invite ───────────────────────────────────────────────
// Accept an invitation and create user account

const acceptInviteSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, 'Password must be at least 8 characters')
});

authRouter.post('/accept-invite', async (req: Request, res: Response): Promise<void> => {
  const parsed = acceptInviteSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, new AppError(422, 'Validation failed', 'VALIDATION_ERROR'));
    return;
  }

  const { token, password } = parsed.data;

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Find invite by token
    const inviteResult = await client.query(
      `SELECT * FROM identity.invites
       WHERE token = $1
       AND status = 'PENDING'
       AND expires_at > now()`,
      [token]
    );

    if (inviteResult.rows.length === 0) {
      throw new AppError(404, 'Invalid or expired invitation', 'INVALID_INVITE');
    }

    const invite = inviteResult.rows[0];

    // Check if user already exists with this email
    const existingUser = await client.query(
      `SELECT id FROM identity.users WHERE email = $1`,
      [invite.email]
    );

    if (existingUser.rows.length > 0) {
      throw new AppError(409, 'User with this email already exists', 'USER_EXISTS');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user account
    const userResult = await client.query(
      `INSERT INTO identity.users (
        name,
        email,
        password_hash,
        role,
        token_version,
        status,
        institution_id,
        first_name,
        last_name
      ) VALUES ($1, $2, $3, $4, 0, 'ACTIVE', $5, $6, $7)
      RETURNING id, name, email, role, token_version`,
      [invite.name, invite.email, passwordHash, invite.role, invite.institution_id, invite.first_name, invite.last_name]
    );

    const user = userResult.rows[0];

    // Update invite status
    await client.query(
      `UPDATE identity.invites
       SET status = 'ACCEPTED',
           accepted_by_user_id = $1,
           accepted_at = now()
       WHERE id = $2`,
      [user.id, invite.id]
    );

    await client.query('COMMIT');

    // Generate JWT token
    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      tokenVersion: user.token_version
    };
    const jwtToken = signToken(authUser);

    sendSuccess(res, {
      token: jwtToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      message: 'Invitation accepted successfully'
    }, 201);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err instanceof AppError) {
      sendError(res, err);
      return;
    }
    sendError(res, err);
  } finally {
    client.release();
  }
});
