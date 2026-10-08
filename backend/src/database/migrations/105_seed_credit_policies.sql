-- M4: default global credit policy seed
-- GLOBAL_DEFAULT governs all students unless overridden by a narrower scope.
-- initial_credit_amount=50: students start with 50 credits on registration
-- consume_amount=10: each assessment attempt costs 10 credits
-- reward_ceiling=200: maximum balance a student can accumulate

-- policy_key is defined in 093; databases where 093 was marked applied without
-- running (031_credit_tables created the table first) may not have it yet.
ALTER TABLE credit.credit_policies ADD COLUMN IF NOT EXISTS policy_key VARCHAR(100) UNIQUE;

INSERT INTO credit.credit_policies
    (policy_key, scope_type, initial_credit_amount, consume_amount,
     reward_ceiling, max_balance, self_practice_enabled, is_active)
VALUES
    ('GLOBAL_DEFAULT', 'GLOBAL', 50, 10, 200, 200, TRUE, TRUE)
ON CONFLICT (policy_key) DO NOTHING;
