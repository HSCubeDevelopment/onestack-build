-- 0009_contact_fields (card #10). Custom fields on Contact (e.g. automotive: insurer, excess). Additive.
ALTER TABLE "onestack_contact" ADD COLUMN IF NOT EXISTS "fields" jsonb NOT NULL DEFAULT '{}';
