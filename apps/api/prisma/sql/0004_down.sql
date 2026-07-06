-- Rollback of 0004_platform_core. DESTRUCTIVE (drops platform-core tables). Order respects FKs.
DROP TABLE IF EXISTS "onestack_work_item_subject";
DROP TABLE IF EXISTS "onestack_subject";
DROP TABLE IF EXISTS "onestack_work_item_counter";
DROP TABLE IF EXISTS "onestack_work_item";
