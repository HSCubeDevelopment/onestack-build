-- 0038_referral (Phase 4 — card #231, Referral engine). Turn happy customers into referrers with a stable
-- referral code + trackable referrals and incentives. GENERIC core (Comms & Marketing). Tenant-scoped, RLS.

CREATE TABLE IF NOT EXISTS "onestack_referral_code" (
  "id"        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"  uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "contactId" uuid NOT NULL REFERENCES "onestack_contact"("id") ON DELETE CASCADE,
  "code"      text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("tenantId", "contactId"),
  UNIQUE ("tenantId", "code")
);
CREATE INDEX IF NOT EXISTS "onestack_referral_code_tenantId_idx" ON "onestack_referral_code" ("tenantId");

CREATE TABLE IF NOT EXISTS "onestack_referral" (
  "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"          uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "referrerContactId" uuid NOT NULL REFERENCES "onestack_contact"("id") ON DELETE CASCADE,
  "referredName"      text NOT NULL,
  "referredPhone"     text,
  "referredContactId" uuid REFERENCES "onestack_contact"("id") ON DELETE SET NULL,
  "status"            text NOT NULL DEFAULT 'pending', -- 'pending' | 'converted' | 'rewarded'
  "rewardNote"        text,
  "createdAt"         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "onestack_referral_tenantId_idx" ON "onestack_referral" ("tenantId");
CREATE INDEX IF NOT EXISTS "onestack_referral_referrer_idx" ON "onestack_referral" ("tenantId", "referrerContactId");

GRANT SELECT, INSERT, UPDATE, DELETE ON "onestack_referral_code" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "onestack_referral" TO app_user;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['onestack_referral_code','onestack_referral']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I FOR ALL USING ("tenantId" = NULLIF(current_setting(''app.current_tenant_id'', true), '''')::uuid) WITH CHECK ("tenantId" = NULLIF(current_setting(''app.current_tenant_id'', true), '''')::uuid)', t);
  END LOOP;
END $$;
