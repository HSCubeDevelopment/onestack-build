-- 0045_job_embedding (Card 60.3 — multimodal embedding index). The retrieval half of photo-to-quote:
-- past jobs are embedded once, then a NEW job's photos and description are matched against them so the
-- AI drafts a quote grounded in what this shop actually charged before, not a generic guess.
--
-- One row per embedded PIECE of a job (a photo, or the damage scope's text), not one per job — a job
-- with six photos yields six photo rows plus one scope row, and retrieval scores each piece separately.
-- Tenant-scoped with forced RLS: a shop's pricing history is among the most commercially sensitive data
-- it has, and one leak here would expose another shop's rates.

CREATE EXTENSION IF NOT EXISTS "vector";

-- ---------------------------------------------------------------- embeddings (one per job piece)
CREATE TABLE IF NOT EXISTS "onestack_job_embedding" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"    uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "workItemId"  uuid NOT NULL REFERENCES "onestack_work_item"("id") ON DELETE CASCADE,
  "kind"        text NOT NULL,                    -- 'photo' | 'scope'
  "sourceId"    uuid,                             -- the attachment/scope row this came from; null once that row is gone
  "contentHash" text NOT NULL,                    -- sha256 of what was embedded — lets us skip re-embedding unchanged content
  "snippet"     text NOT NULL DEFAULT '',         -- short human-readable excerpt, so a retrieved hit can be explained
  "model"       text NOT NULL,                    -- which embedder produced this vector (audit + reindex trigger)
  "embedding"   vector(1024) NOT NULL,            -- 1024 dims: voyage-multimodal-3. Changing dims is a migration, not a config flag.
  "createdAt"   timestamptz NOT NULL DEFAULT now(),
  "updatedAt"   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "onestack_job_embedding_tenantId_idx" ON "onestack_job_embedding" ("tenantId");
CREATE INDEX IF NOT EXISTS "onestack_job_embedding_workItem_idx" ON "onestack_job_embedding" ("tenantId", "workItemId");
CREATE INDEX IF NOT EXISTS "onestack_job_embedding_kind_idx" ON "onestack_job_embedding" ("tenantId", "kind");

-- Re-embedding the same piece must update in place rather than pile up duplicates that all score alike.
-- NULLS NOT DISTINCT is load-bearing: `sourceId` is null for a job's scope text, and under Postgres's
-- default every null is distinct — so the ON CONFLICT upsert would silently degrade into an append and
-- the same job would accumulate a vector per re-index, each one scoring alongside the stale ones.
CREATE UNIQUE INDEX IF NOT EXISTS "onestack_job_embedding_piece_key"
  ON "onestack_job_embedding" ("tenantId", "workItemId", "kind", "sourceId") NULLS NOT DISTINCT;

-- Cosine distance to match the embedder's normalised output. HNSW over ivfflat: it needs no training
-- pass, so it stays correct from the very first row — a shop's index starts empty and grows one job at
-- a time, which is exactly the case ivfflat handles worst.
CREATE INDEX IF NOT EXISTS "onestack_job_embedding_vector_idx"
  ON "onestack_job_embedding" USING hnsw ("embedding" vector_cosine_ops);

-- ---------------------------------------------------------------- forced RLS + tenant-isolation policy
ALTER TABLE "onestack_job_embedding" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onestack_job_embedding" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "onestack_job_embedding";
CREATE POLICY "tenant_isolation" ON "onestack_job_embedding" FOR ALL
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON "onestack_job_embedding" TO app_user;
