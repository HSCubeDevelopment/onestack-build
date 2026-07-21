-- 0048_yards (Yards & vehicle logistics, story YRD-1). A tow driver or estimator parks an incoming car
-- at one of the shop's yards before a job exists, so every car is traceable from the moment it lands.
-- GENERIC core (Scheduling & Ops) — a yard is a shop location, not a vertical noun. Nothing here touches
-- another module's tables. Every table is tenant-scoped with forced RLS.
--
-- PRIVACY: a yard's own lat/long is a fixed BUSINESS location (like the workshop address), stored so the
-- app can suggest the nearest yard to a driver. The driver's live position is NEVER stored — it is used
-- transiently on the device to pre-select a yard, mirroring the geofenced check-in (0047).

-- ---------------------------------------------------------------- yards (the shop's yard network)
CREATE TABLE IF NOT EXISTS "onestack_yard" (
  "id"        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"  uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "name"      text NOT NULL,
  "latitude"  double precision,
  "longitude" double precision,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "deletedAt" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "onestack_yard_name_key" ON "onestack_yard" ("tenantId", "name");
CREATE INDEX IF NOT EXISTS "onestack_yard_tenantId_idx" ON "onestack_yard" ("tenantId");

-- ---------------------------------------------------------------- drops (a car parked at a yard)
CREATE TABLE IF NOT EXISTS "onestack_yard_drop" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"    uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "yardId"      uuid NOT NULL REFERENCES "onestack_yard"("id"),
  "rego"        text NOT NULL,               -- the parked car (normalised: trimmed + uppercased)
  "comments"    text,
  "status"      text NOT NULL DEFAULT 'in_yard', -- 'in_yard' | 'collected'
  "droppedAt"   timestamptz NOT NULL DEFAULT now(),
  "collectedAt" timestamptz,
  "createdAt"   timestamptz NOT NULL DEFAULT now(),
  "updatedAt"   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "onestack_yard_drop_tenantId_idx" ON "onestack_yard_drop" ("tenantId");
CREATE INDEX IF NOT EXISTS "onestack_yard_drop_status_idx" ON "onestack_yard_drop" ("tenantId", "status");

-- ---------------------------------------------------------------- grants + forced RLS + tenant policy
GRANT SELECT, INSERT, UPDATE, DELETE ON "onestack_yard" TO app_user;
ALTER TABLE "onestack_yard" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onestack_yard" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "onestack_yard";
CREATE POLICY "tenant_isolation" ON "onestack_yard" FOR ALL
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON "onestack_yard_drop" TO app_user;
ALTER TABLE "onestack_yard_drop" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onestack_yard_drop" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "onestack_yard_drop";
CREATE POLICY "tenant_isolation" ON "onestack_yard_drop" FOR ALL
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
