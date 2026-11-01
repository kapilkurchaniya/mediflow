UPDATE "store_medicine_settings" sms
SET "reorder_level" = NULL
FROM "medicines" m
WHERE sms."medicine_id" = m."id"
  AND sms."reorder_level" = m."reorder_level";--> statement-breakpoint
UPDATE "store_medicine_settings" sms
SET "max_stock" = NULL
FROM "medicines" m
WHERE sms."medicine_id" = m."id"
  AND sms."max_stock" = m."max_stock";
