-- 0039_pos (Phase 4 — card #221, Point of sale). In-person checkout for walk-in transactions, tied to the
-- same customer record. GENERIC core (Sales & Money). A sale has line items; on completion it records how
-- the customer paid (a TENDER LABEL — cash/card/other) but does NOT process a card payment (that is the
-- deferred payments phase). Line prices are net; GST is added at 10% (project money convention). RLS.

CREATE TABLE IF NOT EXISTS "onestack_sale" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"      uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "contactId"     uuid REFERENCES "onestack_contact"("id") ON DELETE SET NULL,
  "reference"     text NOT NULL,
  "status"        text NOT NULL DEFAULT 'open', -- 'open' | 'completed' | 'void'
  "tenderType"    text, -- 'cash' | 'card' | 'other' (label only — no processing)
  "subtotalCents" integer NOT NULL DEFAULT 0,
  "gstCents"      integer NOT NULL DEFAULT 0,
  "totalCents"    integer NOT NULL DEFAULT 0,
  "createdByUserId" uuid,
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  "completedAt"   timestamptz
);
CREATE INDEX IF NOT EXISTS "onestack_sale_tenantId_idx" ON "onestack_sale" ("tenantId");

CREATE TABLE IF NOT EXISTS "onestack_sale_line" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"       uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "saleId"         uuid NOT NULL REFERENCES "onestack_sale"("id") ON DELETE CASCADE,
  "description"    text NOT NULL,
  "quantity"       integer NOT NULL,
  "unitPriceCents" integer NOT NULL,
  "lineTotalCents" integer NOT NULL,
  "createdAt"      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "onestack_sale_line_sale_idx" ON "onestack_sale_line" ("tenantId", "saleId");

GRANT SELECT, INSERT, UPDATE, DELETE ON "onestack_sale" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "onestack_sale_line" TO app_user;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['onestack_sale','onestack_sale_line']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I FOR ALL USING ("tenantId" = NULLIF(current_setting(''app.current_tenant_id'', true), '''')::uuid) WITH CHECK ("tenantId" = NULLIF(current_setting(''app.current_tenant_id'', true), '''')::uuid)', t);
  END LOOP;
END $$;
