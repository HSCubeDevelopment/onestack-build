-- 0052_tickets (Infringement / police tickets, captured by AI extraction). Replaces the manual ticket
-- form: an employee uploads a PDF or photographs the notice, Claude extracts the fields as an EDITABLE
-- DRAFT a human confirms, and the confirmed ticket is stored here — queryable by rego, agency, due date
-- and status. The original file lives in private Supabase Storage; the row carries the structured data.
-- Automotive pack, but a GENERIC per-tenant record (no core vertical noun added). Tenant-scoped with
-- forced RLS, exactly like every other tenant table. Non-destructive: creates one new table only.
--
-- ⚠️ REVIEW REQUIRED (CLAUDE.md §4/§7): a NEW tenant table + RLS policy. Read this before applying.
-- Apply in the Supabase SQL editor against the production project, then deploy the API + web.

-- ---------------------------------------------------------------- tickets (one infringement notice)
CREATE TABLE IF NOT EXISTS "onestack_ticket" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "rego"            text NOT NULL DEFAULT '',            -- normalised: trimmed + uppercased, no spaces
  "regoRaw"         text NOT NULL DEFAULT '',            -- as printed on the notice
  "noticeType"      text NOT NULL DEFAULT '',            -- 'Infringement Notice' | 'Notice of Final Demand' | …
  "noticeNumber"    text NOT NULL DEFAULT '',            -- primary reference (infringement / obligation number)
  "agency"          text NOT NULL DEFAULT '',            -- enforcement agency / issuer
  "offence"         text NOT NULL DEFAULT '',            -- offence description
  "offenceCode"     text NOT NULL DEFAULT '',
  "offenceAt"       text NOT NULL DEFAULT '',            -- offence date/time as printed (formats vary)
  "location"        text NOT NULL DEFAULT '',
  "issueDate"       text NOT NULL DEFAULT '',
  "dueDate"         text NOT NULL DEFAULT '',
  "amountDueCents"  integer NOT NULL DEFAULT 0,
  "status"          text NOT NULL DEFAULT 'open',        -- 'open' | 'paid' | 'disputed' | 'cancelled'
  "source"          text NOT NULL DEFAULT 'photo',       -- 'photo' | 'pdf'
  "data"            jsonb NOT NULL DEFAULT '{}'::jsonb,  -- full extracted structure (recipient, fees, times…)
  "fileStoragePath" text,                                -- original image / PDF in Storage (tenant-prefixed)
  "fileContentType" text,
  "createdByUserId" uuid,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedAt"       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "onestack_ticket_tenantId_idx" ON "onestack_ticket" ("tenantId");
CREATE INDEX IF NOT EXISTS "onestack_ticket_rego_idx"     ON "onestack_ticket" ("tenantId", "rego");
CREATE INDEX IF NOT EXISTS "onestack_ticket_status_idx"   ON "onestack_ticket" ("tenantId", "status");
CREATE INDEX IF NOT EXISTS "onestack_ticket_dueDate_idx"  ON "onestack_ticket" ("tenantId", "dueDate");

-- ---------------------------------------------------------------- grants
GRANT SELECT, INSERT, UPDATE, DELETE ON "onestack_ticket" TO app_user;

-- ---------------------------------------------------------------- forced RLS + tenant-isolation policy
ALTER TABLE "onestack_ticket" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onestack_ticket" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "onestack_ticket";
CREATE POLICY "tenant_isolation" ON "onestack_ticket" FOR ALL
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
