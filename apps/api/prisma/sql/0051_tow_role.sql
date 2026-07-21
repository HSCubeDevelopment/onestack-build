-- 0051_tow_role (Role-based nav incl. TOW role, story 301). Promote the tow driver from a STAFF-labelled
-- demo login to a first-class role, so the app can give tow drivers a focused experience. Non-destructive:
-- adds a value to the existing role enum. Existing OWNER/STAFF members are untouched; a member only
-- becomes TOW when explicitly assigned. `ADD VALUE IF NOT EXISTS` is idempotent and runs outside a txn.
ALTER TYPE "onestack_role" ADD VALUE IF NOT EXISTS 'TOW';
