-- Run ONCE in the Supabase SQL editor (Sydney project), as the `postgres` role.
-- Creates the least-privilege runtime role the app connects as. Everything else (RLS, grants) is in
-- prisma/sql/0002_rls.sql, applied by the migration step.
--
-- 1) Choose a strong password and replace CHANGE_ME below (this is a SECRET — do not commit it).
-- 2) Put that password into APP_DATABASE_URL in apps/api/.env (see .env.example).
-- 3) Then run the migrations (npm run migrate:sql from apps/api).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user
      LOGIN
      PASSWORD 'CHANGE_ME'
      NOSUPERUSER
      NOBYPASSRLS      -- critical: the app can never bypass row-level security
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT;
  END IF;
END $$;

-- Optional but recommended: a custom access-token hook so Supabase Auth JWTs carry the active
-- tenant + role. Configure this function as the "Custom Access Token" hook in
-- Supabase → Authentication → Hooks. It stamps `tenant_id` and `role` into the JWT from Membership,
-- so the API never has to resolve the tenant before setting RLS context.
--
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
