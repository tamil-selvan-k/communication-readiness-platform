import { Response, NextFunction } from 'express';
import { AuthRequest } from './authenticate';
import { UserRole, STAFF_ROLES } from '../shared/types/roles';
import { AppError } from '../shared/errors/AppError';

export const requireRole = (...roles: UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      const err = new AppError(401, 'Authentication required', 'UNAUTHENTICATED');
      res.status(401).json({ status: 'error', message: err.message, code: err.code });
      return;
    }
    if (!roles.includes(req.user.role)) {
      const err = new AppError(403, `Requires one of: ${roles.join(', ')}`, 'FORBIDDEN');
      res.status(403).json({ status: 'error', message: err.message, code: err.code });
      return;
    }
    next();
  };
};

// Coarse guard: STUDENT or any staff role. The handler must still check the
// specific student (assertStudentAccess) — students and mentors are scoped.
export const requireStudentSelfOrStaff = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  const user = req.user!;

  if (STAFF_ROLES.includes(user.role)) { next(); return; }
  if (user.role === 'STUDENT') { next(); return; }

  const err = new AppError(403, 'Access denied', 'FORBIDDEN');
  res.status(403).json({ status: 'error', message: err.message, code: err.code });
};
