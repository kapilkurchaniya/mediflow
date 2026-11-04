ALTER TABLE "batches" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "schemes" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "doctors" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "stores_tenant_id_uq" ON "stores" USING btree ("tenant_id","id");--> statement-breakpoint
CREATE INDEX "medicines_tenant_updated_idx" ON "medicines" USING btree ("tenant_id","updated_at","id");--> statement-breakpoint
CREATE INDEX "sms_store_updated_idx" ON "store_medicine_settings" USING btree ("store_id","updated_at","medicine_id");--> statement-breakpoint
CREATE INDEX "batches_store_updated_idx" ON "batches" USING btree ("store_id","updated_at","id");--> statement-breakpoint
CREATE INDEX "schemes_tenant_updated_idx" ON "schemes" USING btree ("tenant_id","updated_at","id");--> statement-breakpoint
CREATE INDEX "doctors_tenant_updated_idx" ON "doctors" USING btree ("tenant_id","updated_at","id");--> statement-breakpoint
CREATE INDEX "customers_tenant_updated_idx" ON "customers" USING btree ("tenant_id","updated_at","id");--> statement-breakpoint
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
DECLARE
  old_rec RECORD;
  new_rec RECORD;
BEGIN
  old_rec := OLD;
  new_rec := NEW;
  old_rec.updated_at := NULL;
  new_rec.updated_at := NULL;
  IF (old_rec IS DISTINCT FROM new_rec) THEN
    NEW.updated_at = clock_timestamp();
  ELSE
    NEW.updated_at = OLD.updated_at;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_batches_set_updated_at ON "batches";--> statement-breakpoint
CREATE TRIGGER trg_batches_set_updated_at
BEFORE UPDATE ON "batches"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_customers_set_updated_at ON "customers";--> statement-breakpoint
CREATE TRIGGER trg_customers_set_updated_at
BEFORE UPDATE ON "customers"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_doctors_set_updated_at ON "doctors";--> statement-breakpoint
CREATE TRIGGER trg_doctors_set_updated_at
BEFORE UPDATE ON "doctors"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_schemes_set_updated_at ON "schemes";--> statement-breakpoint
CREATE TRIGGER trg_schemes_set_updated_at
BEFORE UPDATE ON "schemes"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_store_medicine_settings_set_updated_at ON "store_medicine_settings";--> statement-breakpoint
CREATE TRIGGER trg_store_medicine_settings_set_updated_at
BEFORE UPDATE ON "store_medicine_settings"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_medicines_set_updated_at ON "medicines";--> statement-breakpoint
CREATE TRIGGER trg_medicines_set_updated_at
BEFORE UPDATE ON "medicines"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
