-- Reconcile columns referenced throughout the application but never added to
-- identity.users. These were likely dropped during schema refactoring (migration 034)
-- without a compensating ADD COLUMN.

ALTER TABLE identity.users
  ADD COLUMN IF NOT EXISTS institution_id UUID REFERENCES org.institutions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS department_id  UUID REFERENCES org.departments(id)  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_institution_id ON identity.users (institution_id);
CREATE INDEX IF NOT EXISTS idx_users_department_id  ON identity.users (department_id);
