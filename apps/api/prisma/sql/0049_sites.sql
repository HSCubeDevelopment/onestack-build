-- 0049_sites (Multi-site, story SITE-1). A shop that runs more than one physical location tags each
-- job with the site it belongs to, so the owner can see and filter work per branch. GENERIC core
-- (Scheduling & Ops) — a site is a business LOCATION, not a vertical noun (no Vehicle/Job in core).
-- Tenant-scoped with forced RLS, like every other tenant table. Nothing here touches another module's
-- tables beyond a non-destructive ADD COLUMN on the core work_item.

-- ---------------------------------------------------------------- sites (the shop's location network)
CREATE TABLE IF NOT EXISTS "onestack_site" (
  "id"        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"  uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "name"      text NOT NULL,
  "code"      text,               -- short label for pills/badges, e.g. "NTH" (optional)
  "address"   text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "deletedAt" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "onestack_site_name_key" ON "onestack_site" ("tenantId", "name");
CREATE INDEX IF NOT EXISTS "onestack_site_tenantId_idx" ON "onestack_site" ("tenantId");
-- A composite target so a job's (tenantId, siteId) can only reference a site in its OWN tenant.
CREATE UNIQUE INDEX IF NOT EXISTS "onestack_site_tenant_id_key" ON "onestack_site" ("tenantId", "id");

-- ---------------------------------------------------------------- work_item ↔ site (non-destructive)
-- A job optionally belongs to a site. Nullable → existing jobs stay "unassigned"; the composite FK
-- below ties (tenantId, siteId) to a site row of the SAME tenant, so a cross-tenant siteId cannot be
-- stored even by a crafted request. Sites are soft-deleted (deletedAt), so the FK is always satisfiable
-- and never needs an ON DELETE action.
ALTER TABLE "onestack_work_item" ADD COLUMN IF NOT EXISTS "siteId" uuid;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'onestack_work_item_site_fk'
  ) THEN
    ALTER TABLE "onestack_work_item"
      ADD CONSTRAINT "onestack_work_item_site_fk"
      FOREIGN KEY ("tenantId", "siteId") REFERENCES "onestack_site"("tenantId", "id");
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "onestack_work_item_siteId_idx" ON "onestack_work_item" ("tenantId", "siteId");

-- ---------------------------------------------------------------- grants + forced RLS + tenant policy
GRANT SELECT, INSERT, UPDATE, DELETE ON "onestack_site" TO app_user;
ALTER TABLE "onestack_site" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onestack_site" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "onestack_site";
CREATE POLICY "tenant_isolation" ON "onestack_site" FOR ALL
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
