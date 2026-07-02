-- 0002_rls — tenant isolation (cards #2.1 / #2.2). OFF-LIMITS without senior review.
-- Requires the app_user role to exist first (run scripts/supabase-setup.sql once in Supabase).
-- Applied with: prisma db execute --file prisma/sql/0002_rls.sql --schema prisma/schema.prisma
--
-- The pattern: every tenant table gets ENABLE + FORCE RLS + a FOR ALL policy with WITH CHECK, keyed on
-- current_setting('app.current_tenant_id', true). The app connects as app_user (NOSUPERUSER, NOBYPASSRLS),
-- so RLS always applies. The tenant id is set per-request via set_config(..., true) INSIDE a transaction.

-- Least-privilege grants for the runtime role. app_user owns NOTHING; it only reads/writes rows RLS allows.
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;

-- Helper: the current tenant, or NULL when unset (NULL → policy matches no rows → see nothing. Safe default).
-- (Inlined below rather than a function to keep the policy self-contained.)

-- ---- Contact (tenant table) ----
ALTER TABLE "Contact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Contact" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "Contact";
CREATE POLICY "tenant_isolation" ON "Contact"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::uuid);

-- ---- Membership (tenant table) ----
ALTER TABLE "Membership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Membership" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "Membership";
CREATE POLICY "tenant_isolation" ON "Membership"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::uuid);

-- ---- Tenant (the scope itself; no tenantId column) ----
-- Not covered by the CI RLS gate (which targets tables WITH a tenantId column), but protected anyway:
-- app_user may read only its own tenant row. Creation of tenants is a privileged provisioning path
-- (owner/service role, which has BYPASSRLS on Supabase).
ALTER TABLE "Tenant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Tenant" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_self_read" ON "Tenant";
CREATE POLICY "tenant_self_read" ON "Tenant"
  FOR SELECT
  USING ("id" = current_setting('app.current_tenant_id', true)::uuid);
