-- 0037_loyalty (Phase 4 — card #230, Loyalty, rewards & gift cards). Points ledger per customer + gift
-- cards with a balance, to drive repeat visits. GENERIC core (Comms & Marketing). These are LEDGERS only
-- — no card payment processing (that is the deferred payments phase). Tenant-scoped, forced RLS.

CREATE TABLE IF NOT EXISTS "onestack_loyalty_account" (
  "id"        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"  uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "contactId" uuid NOT NULL REFERENCES "onestack_contact"("id") ON DELETE CASCADE,
  "points"    integer NOT NULL DEFAULT 0,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("tenantId", "contactId")
);
CREATE INDEX IF NOT EXISTS "onestack_loyalty_account_tenantId_idx" ON "onestack_loyalty_account" ("tenantId");

CREATE TABLE IF NOT EXISTS "onestack_loyalty_txn" (
  "id"        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"  uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "contactId" uuid NOT NULL REFERENCES "onestack_contact"("id") ON DELETE CASCADE,
  "delta"     integer NOT NULL,
  "reason"    text NOT NULL DEFAULT 'adjust',
  "note"      text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "onestack_loyalty_txn_contact_idx" ON "onestack_loyalty_txn" ("tenantId", "contactId");

CREATE TABLE IF NOT EXISTS "onestack_gift_card" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"     uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "code"         text NOT NULL,
  "initialCents" integer NOT NULL,
  "balanceCents" integer NOT NULL,
  "status"       text NOT NULL DEFAULT 'active', -- 'active' | 'void'
  "note"         text,
  "createdAt"    timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("tenantId", "code")
);
CREATE INDEX IF NOT EXISTS "onestack_gift_card_tenantId_idx" ON "onestack_gift_card" ("tenantId");

CREATE TABLE IF NOT EXISTS "onestack_gift_card_txn" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"    uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "giftCardId"  uuid NOT NULL REFERENCES "onestack_gift_card"("id") ON DELETE CASCADE,
  "amountCents" integer NOT NULL,
  "note"        text,
  "createdAt"   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "onestack_gift_card_txn_card_idx" ON "onestack_gift_card_txn" ("tenantId", "giftCardId");

GRANT SELECT, INSERT, UPDATE, DELETE ON "onestack_loyalty_account" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "onestack_loyalty_txn" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "onestack_gift_card" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "onestack_gift_card_txn" TO app_user;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['onestack_loyalty_account','onestack_loyalty_txn','onestack_gift_card','onestack_gift_card_txn']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I FOR ALL USING ("tenantId" = NULLIF(current_setting(''app.current_tenant_id'', true), '''')::uuid) WITH CHECK ("tenantId" = NULLIF(current_setting(''app.current_tenant_id'', true), '''')::uuid)', t);
  END LOOP;
END $$;
