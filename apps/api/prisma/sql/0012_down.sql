DROP TABLE IF EXISTS "onestack_payment";
DROP TABLE IF EXISTS "onestack_invoice_portion";
ALTER TABLE "onestack_invoice" DROP COLUMN IF EXISTS "payerContactId";
