-- ============================================================================
-- OneStack — FULL Supabase setup (paste into the Supabase SQL editor, run once).
-- Project: Supabase (Sydney). Run as the default `postgres` role.
-- Creates: least-privilege runtime role, core tables (onestack_ prefixed), indexes,
--          forced RLS + policies, and grants. Idempotent — safe to re-run.
--
-- BEFORE RUNNING:
--   1. Replace CHANGE_ME_STRONG_PASSWORD below with a strong password (this is a SECRET).
--   2. Put that password into APP_DATABASE_URL in apps/api/.env (role = app_user).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0) Runtime role — least privilege. The app connects as this; it can NEVER bypass RLS.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user
      LOGIN
      PASSWORD 'CHANGE_ME_STRONG_PASSWORD'
      NOSUPERUSER
      NOBYPASSRLS
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1) Extensions + enum
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
  CREATE TYPE "onestack_role" AS ENUM ('OWNER', 'STAFF');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- 2) Core tables (industry-neutral; no vertical nouns) — all prefixed onestack_
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "onestack_tenant" (
  "id"        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name"      text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "onestack_membership" (
  "id"        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"  uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "userId"    uuid NOT NULL,   -- Supabase auth user id (auth.users.id)
  "role"      "onestack_role" NOT NULL DEFAULT 'STAFF',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "onestack_membership_tenantId_userId_key" UNIQUE ("tenantId", "userId")
);
CREATE INDEX IF NOT EXISTS "onestack_membership_tenantId_idx" ON "onestack_membership" ("tenantId");

CREATE TABLE IF NOT EXISTS "onestack_contact" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"    uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "displayName" text NOT NULL,
  "email"       text,
  "phone"       text,
  "createdAt"   timestamptz NOT NULL DEFAULT now(),
  "updatedAt"   timestamptz NOT NULL DEFAULT now(),
  "deletedAt"   timestamptz
);
-- tenantId is the LEADING column of the composite index (RLS predicate + planner).
CREATE INDEX IF NOT EXISTS "onestack_contact_tenantId_idx" ON "onestack_contact" ("tenantId");

-- ---------------------------------------------------------------------------
-- 3) Grants — app_user gets row DML only (never ownership).
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;

-- ---------------------------------------------------------------------------
-- 4) Row-Level Security — ENABLE + FORCE + policy (WITH CHECK) on every tenant table.
--    Keyed on set_config('app.current_tenant_id', $id, true), which the app sets per-request
--    inside a transaction. No context => current_setting is NULL => 0 rows (safe default).
-- ---------------------------------------------------------------------------
ALTER TABLE "onestack_contact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onestack_contact" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "onestack_contact";
CREATE POLICY "tenant_isolation" ON "onestack_contact"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::uuid);

ALTER TABLE "onestack_membership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onestack_membership" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "onestack_membership";
CREATE POLICY "tenant_isolation" ON "onestack_membership"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::uuid);

-- onestack_tenant has no tenantId column (it IS the scope). Provisioning uses the owner/service
-- role (BYPASSRLS on Supabase); app_user may read only its own tenant row.
ALTER TABLE "onestack_tenant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onestack_tenant" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_self_read" ON "onestack_tenant";
CREATE POLICY "tenant_self_read" ON "onestack_tenant"
  FOR SELECT
  USING ("id" = current_setting('app.current_tenant_id', true)::uuid);

-- ---------------------------------------------------------------------------
-- 5) (Optional) Custom access-token hook — stamps tenant_id + role into Supabase JWTs.
--    Configure as the "Custom Access Token" hook in Supabase → Authentication → Hooks.
-- ---------------------------------------------------------------------------
-- CREATE OR REPLACE FUNCTION public.custom_access_token(event jsonb)
-- RETURNS jsonb LANGUAGE plpgsql AS $$
-- DECLARE m record;
-- BEGIN
--   SELECT "tenantId", "role" INTO m
--   FROM "onestack_membership"
--   WHERE "userId" = (event->>'user_id')::uuid
--   ORDER BY "createdAt" ASC
--   LIMIT 1;
--   IF m."tenantId" IS NOT NULL THEN
--     event := jsonb_set(event, '{claims,tenant_id}', to_jsonb(m."tenantId"::text));
--     event := jsonb_set(event, '{claims,role}', to_jsonb(m."role"::text));
--   END IF;
--   RETURN event;
-- END $$;

-- Done. Verify with:  select tablename, rowsecurity, forcerowsecurity from pg_tables
--                     join pg_class on relname = tablename where tablename like 'onestack_%';
