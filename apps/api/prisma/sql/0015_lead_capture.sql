-- 0015_lead_capture (card #12). Public web-form lead capture into the CRM. GENERIC: a Lead is an
-- inbound enquiry that can convert into a Contact (the shared core record) + optionally a job. A
-- LeadForm is a shop's public form, addressed by an unguessable token (the capability for the public
-- endpoint). Tenant-scoped, forced RLS. NOTE: the public submit path resolves token→tenant via the
-- BYPASSRLS admin connection, then inserts the lead under that tenant (RLS enforced).

CREATE TABLE IF NOT EXISTS "onestack_lead_form" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"    uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "publicToken" text NOT NULL UNIQUE,   -- opaque; embedded in the form snippet / hosted page URL
  "name"        text NOT NULL,
  "enabled"     boolean NOT NULL DEFAULT true,
  "createdAt"   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "onestack_lead_form_tenantId_idx" ON "onestack_lead_form" ("tenantId");

CREATE TABLE IF NOT EXISTS "onestack_lead" (
  "id"                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"           uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "formId"             uuid REFERENCES "onestack_lead_form"("id"),
  "name"               text NOT NULL,
  "phone"              text NOT NULL,
  "email"              text,
  "message"            text,
  "vehicleInfo"        text,             -- optional freeform (rego/make/model) — pack fills this in
  "source"             text NOT NULL DEFAULT 'web_form',
  "status"             text NOT NULL DEFAULT 'New',  -- New | Contacted | Converted
  "convertedContactId" uuid REFERENCES "onestack_contact"("id"),
  "createdAt"          timestamptz NOT NULL DEFAULT now(),
  "updatedAt"          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "onestack_lead_tenantId_idx" ON "onestack_lead" ("tenantId");
CREATE INDEX IF NOT EXISTS "onestack_lead_status_idx" ON "onestack_lead" ("tenantId", "status");

GRANT SELECT, INSERT, UPDATE, DELETE ON "onestack_lead_form", "onestack_lead" TO app_user;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['onestack_lead_form', 'onestack_lead'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'tenant_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING ("tenantId" = NULLIF(current_setting(''app.current_tenant_id'', true), '''')::uuid) WITH CHECK ("tenantId" = NULLIF(current_setting(''app.current_tenant_id'', true), '''')::uuid)',
      'tenant_isolation', t
    );
  END LOOP;
END $$;
