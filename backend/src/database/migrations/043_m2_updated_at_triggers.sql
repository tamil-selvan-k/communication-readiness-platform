-- M2: updated_at auto-update triggers for session tables
-- Reuses the trigger function created in migration 015 (M1).

DROP TRIGGER IF EXISTS trg_assessments_updated_at ON assessment.assessments;
CREATE TRIGGER trg_assessments_updated_at
    BEFORE UPDATE ON assessment.assessments
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

DROP TRIGGER IF EXISTS trg_assessment_sessions_updated_at ON session.assessment_sessions;
CREATE TRIGGER trg_assessment_sessions_updated_at
    BEFORE UPDATE ON session.assessment_sessions
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

DROP TRIGGER IF EXISTS trg_question_bank_items_updated_at ON session.question_bank_items;
CREATE TRIGGER trg_question_bank_items_updated_at
    BEFORE UPDATE ON session.question_bank_items
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();
