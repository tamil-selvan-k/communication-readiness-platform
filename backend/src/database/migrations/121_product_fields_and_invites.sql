-- Product data the DBML does not model but the application needs. Migration 034
-- dropped these from org.students / org.institutions while the routes and the
-- frontend still use them, and no migration ever created identity.invites.

-- ── Student profile fields ───────────────────────────────────────────────────
-- Resumes live in org.resumes and resume sign-off in placement.mentor_verifications
-- (verification_type = 'PROFILE'), both per DBML.
ALTER TABLE org.students ADD COLUMN IF NOT EXISTS roll_number    VARCHAR(50);
ALTER TABLE org.students ADD COLUMN IF NOT EXISTS coding_handles JSONB NOT NULL DEFAULT '{}';
CREATE UNIQUE INDEX IF NOT EXISTS uq_students_roll_number
  ON org.students (roll_number) WHERE roll_number IS NOT NULL;

-- ── Institution display field (Platform Owner portal) ───────────────────────
ALTER TABLE org.institutions ADD COLUMN IF NOT EXISTS campus_city VARCHAR(100);

-- ── RBAC role catalogue (mirrors identity.user_role) ────────────────────────
INSERT INTO identity.roles (name, description, is_active) VALUES
  ('PLATFORM_OWNER',   'Operates the platform across institutions', true),
  ('SUPER_ADMIN',      'Administers one institution',               true),
  ('COLLEGE_ADMIN',    'College-level administrator',               true),
  ('DEPARTMENT_ADMIN', 'Administers one department',                true),
  ('COUNSELLOR',       'Class counsellor for assigned students',    true)
ON CONFLICT (name) DO NOTHING;

-- ── Staff invitations (Platform Owner → Super Admin, admins → staff) ─────────
CREATE TABLE IF NOT EXISTS identity.invites (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  token               VARCHAR(128) NOT NULL UNIQUE,
  email               VARCHAR(255) NOT NULL CHECK (email = lower(email)),
  first_name          VARCHAR(100),
  last_name           VARCHAR(100),
  name                VARCHAR(255) NOT NULL,
  role                identity.user_role NOT NULL,
  institution_id      UUID         REFERENCES org.institutions(id) ON DELETE CASCADE,
  program_id          UUID         REFERENCES org.programs(id) ON DELETE SET NULL,
  department          VARCHAR(255),
  permissions         JSONB        NOT NULL DEFAULT '[]',
  status              VARCHAR(20)  NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING', 'ACCEPTED', 'CANCELLED', 'EXPIRED')),
  expires_at          TIMESTAMPTZ  NOT NULL,
  invited_by_user_id  UUID         REFERENCES identity.users(id) ON DELETE SET NULL,
  accepted_by_user_id UUID         REFERENCES identity.users(id) ON DELETE SET NULL,
  accepted_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invites_institution_status ON identity.invites (institution_id, status);
CREATE INDEX IF NOT EXISTS idx_invites_email              ON identity.invites (email);

DROP TRIGGER IF EXISTS trg_invites_updated_at ON identity.invites;
CREATE TRIGGER trg_invites_updated_at
  BEFORE UPDATE ON identity.invites
  FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();
