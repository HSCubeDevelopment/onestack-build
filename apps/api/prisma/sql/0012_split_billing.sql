-- 0012_split_billing (card #40.5). The party billed ≠ the party served is GENERIC (insurance, Medicare,
-- NDIS, B2B). Lives in the CORE money model. Portions split an invoice across payers; payments record
-- money received per portion. Reconciles to the cent (docs/money-rules.md #29). Tenant-scoped, forced RLS.

ALTER TABLE "onestack_invoice" ADD COLUMN IF NOT EXISTS "payerContactId" uuid REFERENCES "onestack_contact"("id");

-- A portion of an invoice billed to one payer (a Contact, or an external payer by name).
CREATE TABLE IF NOT EXISTS "onestack_invoice_portion" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"       uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "invoiceId"      uuid NOT NULL REFERENCES "onestack_invoice"("id"),
  "payerContactId" uuid REFERENCES "onestack_contact"("id"),
  "payerName"      text,                 -- external payer (e.g. insurer not in Contacts)
  "description"    text NOT NULL,        -- e.g. 'Insurer authorised' | 'Customer excess'
  "amountCents"    integer NOT NULL,
  "createdAt"      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "onestack_invoice_portion_tenantId_idx" ON "onestack_invoice_portion" ("tenantId");
CREATE INDEX IF NOT EXISTS "onestack_invoice_portion_invoice_idx" ON "onestack_invoice_portion" ("tenantId", "invoiceId");

-- Money received against an invoice (optionally a specific portion). Separate entity per #29.
CREATE TABLE IF NOT EXISTS "onestack_payment" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"   uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "invoiceId"  uuid NOT NULL REFERENCES "onestack_invoice"("id"),
  "portionId"  uuid REFERENCES "onestack_invoice_portion"("id"),
  "amountCents" integer NOT NULL,
  "method"     text NOT NULL,            -- cash | bank_transfer | card | eftpos | other
  "receivedAt" timestamptz NOT NULL DEFAULT now(),
  "createdAt"  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "onestack_payment_tenantId_idx" ON "onestack_payment" ("tenantId");
CREATE INDEX IF NOT EXISTS "onestack_payment_invoice_idx" ON "onestack_payment" ("tenantId", "invoiceId");

GRANT SELECT, INSERT, UPDATE, DELETE ON "onestack_invoice_portion", "onestack_payment" TO app_user;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['onestack_invoice_portion', 'onestack_payment'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'tenant_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING ("tenantId" = NULLIF(current_setting(''app.current_tenant_id'', true), '''')::uuid) WITH CHECK ("tenantId" = NULLIF(current_setting(''app.current_tenant_id'', true), '''')::uuid)',
      'tenant_isolation', t
    );
  END LOOP;
END $$;
