-- 0032_portal_access (Phase 3 — card #150, Customer / client portal). A per-customer, passwordless portal:
-- an unguessable token opens a branded self-service page where the customer sees their jobs, documents,
-- quotes (approve/decline) and invoices. GENERIC core (Customer-facing). Passwordless by design — we do
-- NOT hand-roll customer auth (rulebook: auth is managed / off-limits); the token is the credential, and
-- can be revoked. Online PAYMENTS are deferred to the payments phase (shown read-only here). Nothing
-- auto-sends — the owner shares the link. Tenant-scoped, forced RLS.

CREATE TABLE IF NOT EXISTS "onestack_portal_access" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "contactId"       uuid NOT NULL REFERENCES "onestack_contact"("id") ON DELETE CASCADE,
  "token"           text NOT NULL UNIQUE,
  "createdByUserId" uuid,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "revokedAt"       timestamptz
);
CREATE INDEX IF NOT EXISTS "onestack_portal_access_tenantId_idx"
  ON "onestack_portal_access" ("tenantId");
CREATE INDEX IF NOT EXISTS "onestack_portal_access_contact_idx"
  ON "onestack_portal_access" ("tenantId", "contactId");

GRANT SELECT, INSERT, UPDATE, DELETE ON "onestack_portal_access" TO app_user;

ALTER TABLE "onestack_portal_access" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onestack_portal_access" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "onestack_portal_access";
CREATE POLICY "tenant_isolation" ON "onestack_portal_access" FOR ALL
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
