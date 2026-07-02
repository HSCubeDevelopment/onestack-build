-- 0001_init — core tables (industry-neutral). Owned by the migration role (Supabase `postgres`).
-- Applied with: prisma db execute --file prisma/sql/0001_init.sql --schema prisma/schema.prisma
-- (Production path is `prisma migrate`; SQL is kept canonical + reviewable for the tenancy senior review.)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
  CREATE TYPE "Role" AS ENUM ('OWNER', 'STAFF');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "Tenant" (
  "id"        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name"      text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Membership" (
  "id"        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"  uuid NOT NULL REFERENCES "Tenant"("id"),
  "userId"    uuid NOT NULL,
  "role"      "Role" NOT NULL DEFAULT 'STAFF',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "Membership_tenantId_userId_key" UNIQUE ("tenantId", "userId")
);
CREATE INDEX IF NOT EXISTS "Membership_tenantId_idx" ON "Membership" ("tenantId");

CREATE TABLE IF NOT EXISTS "Contact" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"    uuid NOT NULL REFERENCES "Tenant"("id"),
  "displayName" text NOT NULL,
  "email"       text,
  "phone"       text,
  "createdAt"   timestamptz NOT NULL DEFAULT now(),
  "updatedAt"   timestamptz NOT NULL DEFAULT now(),
  "deletedAt"   timestamptz
);
-- tenantId is the LEADING column of the composite index (RLS predicate + planner). See architecture doc.
CREATE INDEX IF NOT EXISTS "Contact_tenantId_idx" ON "Contact" ("tenantId");
