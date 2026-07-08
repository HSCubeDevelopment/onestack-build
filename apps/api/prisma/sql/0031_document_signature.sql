-- 0031_document_signature (Phase 3 — card #143, Documents & e-signature). Adds an e-signature request on
-- an existing generated document: an unguessable token opens a public sign page (secure document
-- exchange), where the signer views the document and signs by typed-name acknowledgement. GENERIC core.
-- A legally-binding, CERTIFIED e-signature via a provider (DocuSign / Adobe Sign) is a DEFERRED vendor —
-- captured by the `provider` + `certified` columns; the built-in flow records a basic, non-certified
-- acknowledgement. Nothing auto-sends. Tenant-scoped, forced RLS.

CREATE TABLE IF NOT EXISTS "onestack_document_signature" (
  "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"          uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "documentId"        uuid NOT NULL REFERENCES "onestack_document"("id") ON DELETE CASCADE,
  "token"             text NOT NULL UNIQUE,
  "signerName"        text NOT NULL,
  "signerEmail"       text,
  "status"            text NOT NULL DEFAULT 'pending', -- 'pending' | 'signed' | 'declined'
  "signedName"        text,
  "signedAt"          timestamptz,
  "provider"          text NOT NULL DEFAULT 'noop',    -- 'noop' | certified provider name
  "certified"         boolean NOT NULL DEFAULT false,  -- legally-binding certified provider?
  "requestedByUserId" uuid,
  "createdAt"         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "onestack_document_signature_tenantId_idx"
  ON "onestack_document_signature" ("tenantId");
CREATE INDEX IF NOT EXISTS "onestack_document_signature_document_idx"
  ON "onestack_document_signature" ("tenantId", "documentId");

GRANT SELECT, INSERT, UPDATE, DELETE ON "onestack_document_signature" TO app_user;

ALTER TABLE "onestack_document_signature" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onestack_document_signature" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "onestack_document_signature";
CREATE POLICY "tenant_isolation" ON "onestack_document_signature" FOR ALL
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
