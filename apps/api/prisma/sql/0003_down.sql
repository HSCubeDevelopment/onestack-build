-- Rollback of 0003_feature_flags. DESTRUCTIVE (drops the flags table).
DROP POLICY IF EXISTS "tenant_isolation" ON "onestack_feature_flag";
DROP TABLE IF EXISTS "onestack_feature_flag";
