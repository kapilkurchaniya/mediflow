-- Phase 6.6 (A6.6) Drop deprecated medicines.rack_id column
-- Racks are store-scoped and managed authoritatively via store_medicine_settings.rack_id (introduced in A3.3)

ALTER TABLE "medicines" DROP CONSTRAINT IF EXISTS "medicines_rack_id_racks_id_fk";
ALTER TABLE "medicines" DROP COLUMN IF EXISTS "rack_id";
