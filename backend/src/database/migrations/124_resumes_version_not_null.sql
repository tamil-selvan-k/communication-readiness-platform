-- Fix: org.resumes.version was nullable, allowing duplicate NULL-version rows that
-- bypass the unique index (two NULLs are not considered equal in SQL unique indexes).
-- Backfill any existing NULLs first, then enforce NOT NULL.

-- Backfill: assign version = 1 to any rows where version IS NULL
UPDATE org.resumes
SET version = 1
WHERE version IS NULL;

-- Enforce NOT NULL going forward
ALTER TABLE org.resumes
  ALTER COLUMN version SET NOT NULL;
