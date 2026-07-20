DROP TABLE IF EXISTS "onestack_job_embedding";
-- The `vector` extension is deliberately left installed: dropping it would break any other schema that
-- adopted it, and re-creating it is the cheap half of this migration.
