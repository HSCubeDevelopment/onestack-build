-- 0040_webhooks (Phase 4 — card #252, Public API & webhooks). Lets customers/partners subscribe to events:
-- a tenant registers an endpoint URL + which events it wants; we POST signed payloads to it. GENERIC core
-- (Platform). Delivery is our OWN outbound HTTP (no vendor). Each delivery is logged. Tenant-scoped, RLS.

CREATE TABLE IF NOT EXISTS "onestack_webhook_endpoint" (
  "id"        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"  uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "url"       text NOT NULL,
  "secret"    text NOT NULL,
  "events"    jsonb NOT NULL DEFAULT '["*"]',
  "active"    boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "onestack_webhook_endpoint_tenantId_idx" ON "onestack_webhook_endpoint" ("tenantId");

CREATE TABLE IF NOT EXISTS "onestack_webhook_delivery" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"     uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "endpointId"   uuid NOT NULL REFERENCES "onestack_webhook_endpoint"("id") ON DELETE CASCADE,
  "eventType"    text NOT NULL,
  "status"       text NOT NULL, -- 'success' | 'failed'
  "responseCode" integer,
  "error"        text,
  "createdAt"    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "onestack_webhook_delivery_endpoint_idx" ON "onestack_webhook_delivery" ("tenantId", "endpointId");

GRANT SELECT, INSERT, UPDATE, DELETE ON "onestack_webhook_endpoint" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "onestack_webhook_delivery" TO app_user;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['onestack_webhook_endpoint','onestack_webhook_delivery']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I FOR ALL USING ("tenantId" = NULLIF(current_setting(''app.current_tenant_id'', true), '''')::uuid) WITH CHECK ("tenantId" = NULLIF(current_setting(''app.current_tenant_id'', true), '''')::uuid)', t);
  END LOOP;
END $$;
