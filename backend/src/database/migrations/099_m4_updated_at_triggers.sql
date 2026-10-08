-- M4: updated_at auto-update triggers for credit and placement tables
-- Reuses the trigger function created in migration 015 (M1).

DROP TRIGGER IF EXISTS trg_credit_accounts_updated_at ON credit.credit_accounts;
CREATE TRIGGER trg_credit_accounts_updated_at
    BEFORE UPDATE ON credit.credit_accounts
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

DROP TRIGGER IF EXISTS trg_credit_policies_updated_at ON credit.credit_policies;
CREATE TRIGGER trg_credit_policies_updated_at
    BEFORE UPDATE ON credit.credit_policies
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

DROP TRIGGER IF EXISTS trg_checklist_items_updated_at ON placement.checklist_items;
CREATE TRIGGER trg_checklist_items_updated_at
    BEFORE UPDATE ON placement.checklist_items
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

DROP TRIGGER IF EXISTS trg_checklist_progress_updated_at ON placement.checklist_progress;
CREATE TRIGGER trg_checklist_progress_updated_at
    BEFORE UPDATE ON placement.checklist_progress
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

DROP TRIGGER IF EXISTS trg_mentor_verifications_updated_at ON placement.mentor_verifications;
CREATE TRIGGER trg_mentor_verifications_updated_at
    BEFORE UPDATE ON placement.mentor_verifications
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

DROP TRIGGER IF EXISTS trg_placement_eligibility_updated_at ON placement.placement_eligibility;
CREATE TRIGGER trg_placement_eligibility_updated_at
    BEFORE UPDATE ON placement.placement_eligibility
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();
