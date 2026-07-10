-- 0041_integration (Phase 4 — card #253, Integration marketplace). A per-tenant connection record for an
-- integration from the built-in catalogue. GENERIC core (Platform). The catalogue itself is a code registry;
-- each integration's actual vendor wiring is DEFERRED (this just records connection intent + config).
-- Revenue share is a later stage. Tenant-scoped, forced RLS.

CREATE TABLE IF NOT EXISTS "onestack_integration_connection" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"    uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "slug"        text NOT NULL,
  "status"      text NOT NULL DEFAULT 'connected', -- 'connected' | 'disconnected'
  "config"      jsonb NOT NULL DEFAULT '{}',
  "connectedAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt"   timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("tenantId", "slug")
);
CREATE INDEX IF NOT EXISTS "onestack_integration_connection_tenantId_idx" ON "onestack_integration_connection" ("tenantId");

GRANT SELECT, INSERT, UPDATE, DELETE ON "onestack_integration_connection" TO app_user;

ALTER TABLE "onestack_integration_connection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onestack_integration_connection" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "onestack_integration_connection";
CREATE POLICY "tenant_isolation" ON "onestack_integration_connection" FOR ALL
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
