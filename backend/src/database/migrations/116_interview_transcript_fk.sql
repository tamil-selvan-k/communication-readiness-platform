-- Shared FKs: adds deferred constraints on session.interview_transcripts (migration 016).
-- Both referenced tables are created in M2 migrations (034, 038) which run after 016.

DO $$ BEGIN
  ALTER TABLE session.interview_transcripts
      ADD CONSTRAINT fk_transcripts_session
      FOREIGN KEY (session_id) REFERENCES session.assessment_sessions(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- interview_transcripts (016) has no response_id column; add it before the FK.
ALTER TABLE session.interview_transcripts ADD COLUMN IF NOT EXISTS response_id UUID;

DO $$ BEGIN
  ALTER TABLE session.interview_transcripts
      ADD CONSTRAINT fk_transcripts_response
      FOREIGN KEY (response_id) REFERENCES evaluation.responses(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
