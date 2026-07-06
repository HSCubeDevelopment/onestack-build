-- 0005_eventing (cards #9 event bus, #9.15 outbox/DLQ, #9.05 job tenancy). Tenant-scoped, forced RLS.

-- Transactional outbox: events are written in the SAME transaction as the state change, then a relay
-- publishes them. status: pending → published, or → dead after max attempts (the DLQ).
CREATE TABLE IF NOT EXISTS "onestack_outbox_event" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"      uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "type"          text NOT NULL,
  "payload"       jsonb NOT NULL DEFAULT '{}',
  "status"        text NOT NULL DEFAULT 'pending', -- pending | published | dead
  "attempts"      integer NOT NULL DEFAULT 0,
  "lastError"     text,
  "nextAttemptAt" timestamptz NOT NULL DEFAULT now(),
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  "publishedAt"   timestamptz
);
CREATE INDEX IF NOT EXISTS "onestack_outbox_event_tenantId_idx" ON "onestack_outbox_event" ("tenantId");
-- Relay scan index: find due pending work fast.
CREATE INDEX IF NOT EXISTS "onestack_outbox_event_due_idx"
  ON "onestack_outbox_event" ("status", "nextAttemptAt");

-- Idempotency inbox: one row per (consumer, event). A duplicate delivery finds the row and no-ops.
CREATE TABLE IF NOT EXISTS "onestack_inbox_consumed" (
  "tenantId"     uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "consumerName" text NOT NULL,
  "eventId"      uuid NOT NULL,
  "consumedAt"   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("consumerName", "eventId")
);
CREATE INDEX IF NOT EXISTS "onestack_inbox_consumed_tenantId_idx" ON "onestack_inbox_consumed" ("tenantId");

GRANT SELECT, INSERT, UPDATE, DELETE ON "onestack_outbox_event", "onestack_inbox_consumed" TO app_user;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['onestack_outbox_event', 'onestack_inbox_consumed'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'tenant_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING ("tenantId" = NULLIF(current_setting(''app.current_tenant_id'', true), '''')::uuid) WITH CHECK ("tenantId" = NULLIF(current_setting(''app.current_tenant_id'', true), '''')::uuid)',
      'tenant_isolation', t
    );
  END LOOP;
END $$;
