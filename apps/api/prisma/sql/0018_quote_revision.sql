-- 0018_quote_revision (card #33). Smash repairs need a supplementary quote when hidden damage appears
-- after strip-down; an Accepted quote must be revisable WITHOUT destroying the audit trail. A revision is
-- a NEW quote (v2, v3…) linked to the one it supersedes; the original is retained untouched. Totals are
-- still derived per quote from its own lines. Core Quotes. Tenant-scoped (RLS already on onestack_quote).

ALTER TABLE "onestack_quote" ADD COLUMN IF NOT EXISTS "revision" integer NOT NULL DEFAULT 1;
ALTER TABLE "onestack_quote" ADD COLUMN IF NOT EXISTS "supersedesId" uuid REFERENCES "onestack_quote"("id");

CREATE INDEX IF NOT EXISTS "onestack_quote_supersedes_idx" ON "onestack_quote" ("tenantId", "supersedesId");
