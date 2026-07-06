DROP TABLE IF EXISTS "onestack_custom_field";
ALTER TABLE "onestack_subject" DROP COLUMN IF EXISTS "customFields";
ALTER TABLE "onestack_contact" DROP COLUMN IF EXISTS "customFields";
-- (pg_trgm extension + trigram indexes left in place; harmless.)
