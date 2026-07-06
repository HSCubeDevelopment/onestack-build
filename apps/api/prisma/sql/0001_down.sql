-- Rollback of 0001_init — drops the core tables + enum. DESTRUCTIVE (data loss). Run only on rollback.
DROP TABLE IF EXISTS "onestack_contact";
DROP TABLE IF EXISTS "onestack_membership";
DROP TABLE IF EXISTS "onestack_tenant";
DROP TYPE IF EXISTS "onestack_role";
