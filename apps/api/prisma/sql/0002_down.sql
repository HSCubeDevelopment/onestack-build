-- Rollback of 0002_rls — removes policies + RLS + grants. Does NOT drop tables (that is 0001_down).
DROP POLICY IF EXISTS "tenant_isolation" ON "onestack_contact";
ALTER TABLE "onestack_contact" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "onestack_contact" DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation" ON "onestack_membership";
ALTER TABLE "onestack_membership" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "onestack_membership" DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_self_read" ON "onestack_tenant";
ALTER TABLE "onestack_tenant" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "onestack_tenant" DISABLE ROW LEVEL SECURITY;

REVOKE SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM app_user;
