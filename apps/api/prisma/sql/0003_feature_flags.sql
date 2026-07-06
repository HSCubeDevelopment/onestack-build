-- 0003_feature_flags (cards #6 / #6.2) — per-tenant module on/off flags. Tenant-scoped → RLS.
-- Applied with: prisma db execute --file prisma/sql/0003_feature_flags.sql --schema prisma/schema.prisma

CREATE TABLE IF NOT EXISTS "onestack_feature_flag" (
  "id"        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"  uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "key"       text NOT NULL,
  "enabled"   boolean NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "onestack_feature_flag_tenantId_key_key" UNIQUE ("tenantId", "key")
);
CREATE INDEX IF NOT EXISTS "onestack_feature_flag_tenantId_idx" ON "onestack_feature_flag" ("tenantId");

GRANT SELECT, INSERT, UPDATE, DELETE ON "onestack_feature_flag" TO app_user;

ALTER TABLE "onestack_feature_flag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onestack_feature_flag" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "onestack_feature_flag";
CREATE POLICY "tenant_isolation" ON "onestack_feature_flag"
  FOR ALL
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
