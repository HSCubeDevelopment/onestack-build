-- Rollback of 0005_eventing. DESTRUCTIVE.
DROP TABLE IF EXISTS "onestack_inbox_consumed";
DROP TABLE IF EXISTS "onestack_outbox_event";
