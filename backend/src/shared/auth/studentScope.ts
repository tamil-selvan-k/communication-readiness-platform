import { db } from '../db/pool';
import { AppError } from '../errors/AppError';
import { AuthUser } from '../types/auth';
import { STUDENT_READ_ROLES } from '../types/roles';

/**
 * Throws unless `user` may read the records of `studentId`:
 *   STUDENT        — only their own student record
 *   FACULTY_MENTOR — only students actively assigned to them
 *   other staff    — any student (see STUDENT_READ_ROLES)
 */
export async function assertStudentAccess(user: AuthUser, studentId: string): Promise<void> {
  if (STUDENT_READ_ROLES.includes(user.role)) return;

  if (user.role === 'STUDENT') {
    const { rows } = await db.query(
      'SELECT id FROM org.students WHERE id::text = $1 AND user_id = $2',
      [studentId, user.id]
    );
    if (rows.length === 0) throw new AppError(403, 'Access denied', 'FORBIDDEN');
    return;
  }

  if (user.role === 'FACULTY_MENTOR') {
    const { rows } = await db.query(
      `SELECT id FROM org.student_mentor_assignments
       WHERE student_id::text = $1 AND mentor_user_id = $2 AND is_active = true`,
      [studentId, user.id]
    );
    if (rows.length === 0) throw new AppError(403, 'Not assigned to this student', 'FORBIDDEN');
    return;
  }

  throw new AppError(403, 'Access denied', 'FORBIDDEN');
}
