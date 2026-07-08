-- 0028_campaign (Phase 3 — marketing campaigns). A one-shot segmented email/SMS campaign: a shop writes a
-- message, targets a tag/segment (0024), and sends it. GENERIC (Comms & Marketing core). Actual delivery
-- is a vendor step behind a provider interface — no-op until an email/SMS provider is wired, so nothing is
-- ever auto-sent. Drip sequences + win-back automation are a follow-up (not modelled here). Tenant-scoped.

CREATE TABLE IF NOT EXISTS "onestack_campaign" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "name"            text NOT NULL,
  "channel"         text NOT NULL,                 -- 'email' | 'sms'
  "subject"         text,                          -- email only
  "body"            text NOT NULL DEFAULT '',
  "tagId"           uuid REFERENCES "onestack_tag"("id") ON DELETE SET NULL,  -- target segment
  "status"          text NOT NULL DEFAULT 'draft', -- 'draft' | 'sent'
  "recipientCount"  integer,
  "sentAt"          timestamptz,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedAt"       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "onestack_campaign_tenantId_idx" ON "onestack_campaign" ("tenantId");

GRANT SELECT, INSERT, UPDATE, DELETE ON "onestack_campaign" TO app_user;

ALTER TABLE "onestack_campaign" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onestack_campaign" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "onestack_campaign";
CREATE POLICY "tenant_isolation" ON "onestack_campaign" FOR ALL
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
