-- 0007_line_item (card #6.9). One Line Item table shared by BOTH Quote and Invoice (linked
-- polymorphically by parentType + parentId; the Quote/Invoice tables land with #30/#40). Tenant-scoped.
-- Money is integer cents; net/gst/total are stored (computed per docs/money-rules.md #29) for query + audit.

CREATE TABLE IF NOT EXISTS "onestack_line_item" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"       uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "parentType"     text NOT NULL,     -- 'quote' | 'invoice'
  "parentId"       uuid NOT NULL,
  "description"    text NOT NULL,
  "type"           text NOT NULL,     -- labour | product | time
  "quantity"       integer NOT NULL,
  "unitPriceCents" integer NOT NULL,
  "taxCode"        text NOT NULL,     -- GST | GST_FREE
  "taxTreatment"   text NOT NULL,     -- inclusive | exclusive
  "netCents"       integer NOT NULL,
  "gstCents"       integer NOT NULL,
  "lineTotalCents" integer NOT NULL,
  "sortOrder"      integer NOT NULL,
  "createdAt"      timestamptz NOT NULL DEFAULT now(),
  "updatedAt"      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "onestack_line_item_tenantId_idx" ON "onestack_line_item" ("tenantId");
CREATE INDEX IF NOT EXISTS "onestack_line_item_parent_idx"
  ON "onestack_line_item" ("tenantId", "parentType", "parentId", "sortOrder");

GRANT SELECT, INSERT, UPDATE, DELETE ON "onestack_line_item" TO app_user;

ALTER TABLE "onestack_line_item" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onestack_line_item" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "onestack_line_item";
CREATE POLICY "tenant_isolation" ON "onestack_line_item"
  FOR ALL
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
