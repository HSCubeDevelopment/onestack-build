-- 0006_audit_notifications (cards #9.2 audit, #9.1 notifications). Tenant-scoped, forced RLS.

-- ---- Audit log: immutable who-did-what trail (card #9.2) ----
CREATE TABLE IF NOT EXISTS "onestack_audit_log" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"    uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "actorUserId" uuid,                        -- who (null = system)
  "action"      text NOT NULL,               -- e.g. 'contact.created'
  "entityType"  text,
  "entityId"    text,
  "metadata"    jsonb NOT NULL DEFAULT '{}',
  "createdAt"   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "onestack_audit_log_tenantId_createdAt_idx"
  ON "onestack_audit_log" ("tenantId", "createdAt");

-- ---- Notifications: internal + customer messages across channels (card #9.1) ----
CREATE TABLE IF NOT EXISTS "onestack_notification" (
  "id"        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"  uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "channel"   text NOT NULL,                 -- in_app | email | sms
  "recipient" text NOT NULL,
  "template"  text NOT NULL,
  "payload"   jsonb NOT NULL DEFAULT '{}',
  "status"    text NOT NULL DEFAULT 'pending', -- pending | sent | failed
  "error"     text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "sentAt"    timestamptz
);
CREATE INDEX IF NOT EXISTS "onestack_notification_tenantId_idx" ON "onestack_notification" ("tenantId");
CREATE INDEX IF NOT EXISTS "onestack_notification_status_idx" ON "onestack_notification" ("status");

-- Grants. Notifications get full DML; audit is APPEND-ONLY (revoke UPDATE/DELETE below).
GRANT SELECT, INSERT, UPDATE, DELETE ON "onestack_notification" TO app_user;
GRANT SELECT, INSERT ON "onestack_audit_log" TO app_user;
REVOKE UPDATE, DELETE ON "onestack_audit_log" FROM app_user; -- immutability at the grant level too

-- RLS. Notification: FOR ALL. Audit: SELECT + INSERT only (no UPDATE/DELETE policy → append-only).
ALTER TABLE "onestack_notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onestack_notification" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "onestack_notification";
CREATE POLICY "tenant_isolation" ON "onestack_notification"
  FOR ALL
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "onestack_audit_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onestack_audit_log" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_read" ON "onestack_audit_log";
CREATE POLICY "tenant_read" ON "onestack_audit_log"
  FOR SELECT
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
DROP POLICY IF EXISTS "tenant_append" ON "onestack_audit_log";
CREATE POLICY "tenant_append" ON "onestack_audit_log"
  FOR INSERT
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
