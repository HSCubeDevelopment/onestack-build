-- 0001_init — core tables (industry-neutral). Owned by the migration role (Supabase `postgres`).
-- All tables are prefixed `onestack_`. Applied with:
--   prisma db execute --file prisma/sql/0001_init.sql --schema prisma/schema.prisma
-- (Production path is `prisma migrate`; SQL is kept canonical + reviewable for the tenancy senior review.)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
  CREATE TYPE "onestack_role" AS ENUM ('OWNER', 'STAFF');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "onestack_tenant" (
  "id"        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name"      text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "onestack_membership" (
  "id"        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"  uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "userId"    uuid NOT NULL,
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
-- tenantId is the LEADING column of the composite index (RLS predicate + planner). See architecture doc.
CREATE INDEX IF NOT EXISTS "onestack_contact_tenantId_idx" ON "onestack_contact" ("tenantId");
