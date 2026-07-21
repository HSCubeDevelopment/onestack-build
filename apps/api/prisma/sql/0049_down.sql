-- Reverse of 0049_sites. Drop the FK + column first, then the table.
ALTER TABLE "onestack_work_item" DROP CONSTRAINT IF EXISTS "onestack_work_item_site_fk";
DROP INDEX IF EXISTS "onestack_work_item_siteId_idx";
ALTER TABLE "onestack_work_item" DROP COLUMN IF EXISTS "siteId";
DROP TABLE IF EXISTS "onestack_site";
