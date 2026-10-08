import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { db } from '../shared/db/pool';
import { AppError } from '../shared/errors/AppError';
import { AuthUser, JWTPayload } from '../shared/types/auth';

export interface AuthRequest extends Request {
  user?: AuthUser;
}

/** The error to reject a sign-in or request with, or null when the account may be used. */
export function accountBlock(status: string, isActive: boolean | null | undefined): AppError | null {
  if (status === 'SUSPENDED') return new AppError(403, 'Account suspended', 'ACCOUNT_SUSPENDED');
  if (status === 'INACTIVE' || isActive === false) {
    return new AppError(403, 'Account inactive', 'ACCOUNT_INACTIVE');
  }
  return null;
}

/**
 * Verifies a JWT and checks it against the DB (user exists, account active,
 * token_version unchanged). Shared by the HTTP middleware and the interview
 * WebSocket gateway, which cannot send an Authorization header.
 */
export async function verifyAccessToken(token: string): Promise<JWTPayload> {
  let decoded: JWTPayload;
  try {
    decoded = jwt.verify(token, env.JWT_SECRET) as JWTPayload;
  } catch (err) {
    const code = err instanceof jwt.TokenExpiredError ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID';
    throw new AppError(401, 'Invalid or expired token', code);
  }

  // DB check: token_version must match — catches revoked tokens after logout
  const { rows } = await db.query<{ token_version: number; status: string }>(
    'SELECT token_version, status FROM identity.users WHERE id = $1',
    [decoded.id]
  );
  if (rows.length === 0) {
    throw new AppError(401, 'User not found', 'USER_NOT_FOUND');
  }
  const blocked = accountBlock(rows[0].status, null);
  if (blocked) throw blocked;
  if (rows[0].token_version !== decoded.tokenVersion) {
    throw new AppError(401, 'Token has been revoked', 'TOKEN_REVOKED');
  }
  return decoded;
}

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new AppError(401, 'Bearer token required', 'UNAUTHENTICATED');
    }

    req.user = await verifyAccessToken(header.slice(7));
    next();
  } catch (err) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ status: 'error', message: err.message, code: err.code });
      return;
    }
    next(err);
  }
};
