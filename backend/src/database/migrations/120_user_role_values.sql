-- Roles the application uses beyond the original five: platform owner, college
-- super admins, department admins and counsellors (see src/shared/types/roles.ts).
-- A value added with ADD VALUE cannot be used in the same transaction, so this
-- file only extends the enum; 121 uses the new values.

ALTER TYPE identity.user_role ADD VALUE IF NOT EXISTS 'PLATFORM_OWNER';
ALTER TYPE identity.user_role ADD VALUE IF NOT EXISTS 'SUPER_ADMIN';
ALTER TYPE identity.user_role ADD VALUE IF NOT EXISTS 'COLLEGE_ADMIN';
ALTER TYPE identity.user_role ADD VALUE IF NOT EXISTS 'DEPARTMENT_ADMIN';
ALTER TYPE identity.user_role ADD VALUE IF NOT EXISTS 'COUNSELLOR';
