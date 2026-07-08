-- 0030_assistant (Phase 3 — AI assistant / receptionist). A provider-abstracted AI assistant that DRAFTS
-- replies to customer questions for staff to review before sending. GENERIC (Workflow & AI core). Real
-- Claude when ANTHROPIC_API_KEY is set, a deterministic stub otherwise — so it works with NO external API.
-- Every answer is an EDITABLE DRAFT a human confirms; nothing is auto-sent. The phone/telephony
-- "receptionist" is a deferred vendor. Each ask + drafted answer is logged. Tenant-scoped, forced RLS.

CREATE TABLE IF NOT EXISTS "onestack_assistant_message" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "workItemId"      uuid REFERENCES "onestack_work_item"("id") ON DELETE SET NULL,
  "contactId"       uuid REFERENCES "onestack_contact"("id") ON DELETE SET NULL,
  "question"        text NOT NULL,
  "answer"          text NOT NULL,
  "model"           text NOT NULL,
  "createdByUserId" uuid,
  "createdAt"       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "onestack_assistant_message_tenantId_idx" ON "onestack_assistant_message" ("tenantId");

GRANT SELECT, INSERT, UPDATE, DELETE ON "onestack_assistant_message" TO app_user;

ALTER TABLE "onestack_assistant_message" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onestack_assistant_message" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "onestack_assistant_message";
CREATE POLICY "tenant_isolation" ON "onestack_assistant_message" FOR ALL
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
