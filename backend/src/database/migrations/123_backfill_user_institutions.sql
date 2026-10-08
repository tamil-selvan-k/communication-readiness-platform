-- Add institution_id and department_id to identity.users, then backfill.
-- These columns are referenced throughout the application but were dropped during
-- schema refactoring without a compensating ADD COLUMN.

ALTER TABLE identity.users
  ADD COLUMN IF NOT EXISTS institution_id UUID REFERENCES org.institutions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS department_id  UUID REFERENCES org.departments(id)  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_institution_id ON identity.users (institution_id);
CREATE INDEX IF NOT EXISTS idx_users_department_id  ON identity.users (department_id);

-- Students belong to their program's institution (program_id lives on the batch, not the student).
UPDATE identity.users u
SET institution_id = p.institution_id
FROM org.students s
JOIN org.batches b  ON b.id = s.batch_id
JOIN org.programs p ON p.id = b.program_id
WHERE s.user_id = u.id AND u.institution_id IS NULL;

-- In a single-institution deployment every remaining non-owner account belongs to it.
UPDATE identity.users
SET institution_id = (SELECT id FROM org.institutions)
WHERE institution_id IS NULL
  AND role <> 'PLATFORM_OWNER'
  AND (SELECT count(*) FROM org.institutions) = 1;
