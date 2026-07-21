-- 0050_finance_view (Financials access control, story 40.8). Money & Payments is OWNER-only by default;
-- this adds a grantable per-member permission so an owner can let a bookkeeper/office member see finance
-- WITHOUT making them an owner. Non-destructive: a nullable-with-default boolean on the membership row.
-- Existing members default to false (no finance access), preserving today's OWNER-only behaviour.
ALTER TABLE "onestack_membership"
  ADD COLUMN IF NOT EXISTS "canViewFinance" boolean NOT NULL DEFAULT false;
