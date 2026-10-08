// Must match the identity.user_role enum (migrations 003 + 120).
export type UserRole =
  | 'PLATFORM_OWNER'
  | 'SUPER_ADMIN'
  | 'COLLEGE_ADMIN'
  | 'DEPARTMENT_ADMIN'
  | 'COUNSELLOR'
  | 'STUDENT'
  | 'FACULTY_MENTOR'
  | 'PROGRAM_ADMIN'
  | 'TRAINER'
  | 'PLACEMENT_COORDINATOR';

export const STAFF_ROLES: UserRole[] = [
  'PLATFORM_OWNER',
  'SUPER_ADMIN',
  'COLLEGE_ADMIN',
  'DEPARTMENT_ADMIN',
  'COUNSELLOR',
  'FACULTY_MENTOR',
  'PROGRAM_ADMIN',
  'TRAINER',
  'PLACEMENT_COORDINATOR',
];

// Staff who may read any student's records. FACULTY_MENTOR is deliberately
// absent: mentors only see students they are actively assigned to.
export const STUDENT_READ_ROLES: UserRole[] = STAFF_ROLES.filter((role) => role !== 'FACULTY_MENTOR');

// Roles that manage users and org structure for an institution.
export const ADMIN_ROLES: UserRole[] = ['SUPER_ADMIN', 'COLLEGE_ADMIN', 'PROGRAM_ADMIN', 'DEPARTMENT_ADMIN'];
