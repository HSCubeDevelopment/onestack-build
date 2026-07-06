-- 0014_scheduling (card #23). Calendar & resource scheduling. GENERIC: a "resource" is any bookable
-- thing (a bay, a technician, a room, a chair) and a "booking" reserves one resource for a time range,
-- optionally linked to a work item. Part of the toggleable `scheduling` module (OFF by default).
-- Tenant-scoped, forced RLS.

CREATE TABLE IF NOT EXISTS "onestack_resource" (
  "id"        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"  uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "type"      text NOT NULL,            -- 'bay' | 'technician' (pack/shop-defined labels)
  "name"      text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "deletedAt" timestamptz
);
CREATE INDEX IF NOT EXISTS "onestack_resource_tenantId_idx" ON "onestack_resource" ("tenantId");

CREATE TABLE IF NOT EXISTS "onestack_booking" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"   uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "resourceId" uuid NOT NULL REFERENCES "onestack_resource"("id"),
  "workItemId" uuid REFERENCES "onestack_work_item"("id"),  -- optional link to the job
  "title"      text NOT NULL,
  "startsAt"   timestamptz NOT NULL,
  "endsAt"     timestamptz NOT NULL,
  "notes"      text,
  "createdAt"  timestamptz NOT NULL DEFAULT now(),
  "updatedAt"  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "onestack_booking_tenantId_idx" ON "onestack_booking" ("tenantId");
CREATE INDEX IF NOT EXISTS "onestack_booking_resource_time_idx" ON "onestack_booking" ("tenantId", "resourceId", "startsAt");
CREATE INDEX IF NOT EXISTS "onestack_booking_workItem_idx" ON "onestack_booking" ("tenantId", "workItemId");

GRANT SELECT, INSERT, UPDATE, DELETE ON "onestack_resource", "onestack_booking" TO app_user;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['onestack_resource', 'onestack_booking'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'tenant_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING ("tenantId" = NULLIF(current_setting(''app.current_tenant_id'', true), '''')::uuid) WITH CHECK ("tenantId" = NULLIF(current_setting(''app.current_tenant_id'', true), '''')::uuid)',
      'tenant_isolation', t
    );
  END LOOP;
END $$;
