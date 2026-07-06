-- 0010_quote (card #30). A quote on a job; line items are the shared onestack_line_item (#6.9). Money
-- lives on the lines (cents); quote totals are derived. Tenant-scoped, forced RLS.

-- Generic per-tenant reference sequence (scope = 'quote' | 'invoice' | …). Work Items keep their own.
CREATE TABLE IF NOT EXISTS "onestack_reference_counter" (
  "tenantId" uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "scope"    text NOT NULL,
  "value"    integer NOT NULL DEFAULT 0,
  PRIMARY KEY ("tenantId", "scope")
);

CREATE TABLE IF NOT EXISTS "onestack_quote" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"   uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "workItemId" uuid NOT NULL REFERENCES "onestack_work_item"("id"), -- the job
  "reference"  text NOT NULL,                                       -- Q-000001
  "status"     text NOT NULL DEFAULT 'Draft',                       -- Draft | Sent | Accepted | Declined
  "createdAt"  timestamptz NOT NULL DEFAULT now(),
  "updatedAt"  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "onestack_quote_tenantId_reference_key" UNIQUE ("tenantId", "reference")
);
CREATE INDEX IF NOT EXISTS "onestack_quote_tenantId_idx" ON "onestack_quote" ("tenantId");
CREATE INDEX IF NOT EXISTS "onestack_quote_job_idx" ON "onestack_quote" ("tenantId", "workItemId");

GRANT SELECT, INSERT, UPDATE, DELETE ON "onestack_reference_counter", "onestack_quote" TO app_user;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['onestack_reference_counter', 'onestack_quote'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'tenant_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING ("tenantId" = NULLIF(current_setting(''app.current_tenant_id'', true), '''')::uuid) WITH CHECK ("tenantId" = NULLIF(current_setting(''app.current_tenant_id'', true), '''')::uuid)',
      'tenant_isolation', t
    );
  END LOOP;
END $$;
