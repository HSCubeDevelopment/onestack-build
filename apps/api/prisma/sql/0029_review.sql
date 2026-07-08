-- 0029_review (Phase 3 — reviews & reputation). Request a review from a customer after a job (a tokenised
-- link), let them submit a star rating + comment publicly, and aggregate it into a reputation summary.
-- GENERIC (Comms & Marketing core). Emailing the invite is a vendor step (no-op until a provider is wired);
-- pulling external Google/Facebook reviews is deferred (vendor). The public submit resolves the token via
-- the BYPASSRLS admin connection, then writes through the tenant wrapper. Tenant-scoped, forced RLS.

CREATE TABLE IF NOT EXISTS "onestack_review" (
  "id"                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"           uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "workItemId"         uuid REFERENCES "onestack_work_item"("id") ON DELETE SET NULL,
  "contactId"          uuid REFERENCES "onestack_contact"("id") ON DELETE SET NULL,
  "token"             text NOT NULL UNIQUE,
  "status"             text NOT NULL DEFAULT 'requested',  -- 'requested' | 'submitted'
  "source"             text NOT NULL DEFAULT 'web',        -- 'web' | 'google' | ... (external deferred)
  "reviewerName"       text,
  "rating"             integer,                            -- 1..5 once submitted
  "comment"            text,
  "published"          boolean NOT NULL DEFAULT true,      -- shop can hide a review from public display
  "requestedByUserId"  uuid,
  "createdAt"          timestamptz NOT NULL DEFAULT now(),
  "submittedAt"        timestamptz
);
CREATE INDEX IF NOT EXISTS "onestack_review_tenantId_idx" ON "onestack_review" ("tenantId");
CREATE INDEX IF NOT EXISTS "onestack_review_status_idx" ON "onestack_review" ("tenantId", "status");

GRANT SELECT, INSERT, UPDATE, DELETE ON "onestack_review" TO app_user;

ALTER TABLE "onestack_review" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onestack_review" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "onestack_review";
CREATE POLICY "tenant_isolation" ON "onestack_review" FOR ALL
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
