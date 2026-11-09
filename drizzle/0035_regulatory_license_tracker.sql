-- Regulatory Compliance & Drug License Renewal Alerts (B5.7)
-- Drugs and Cosmetics Rules 1945 Form 20, 21, 20B, 21B, FSSAI, and Chief Pharmacist Registrations

ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "form20_no" text;
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "form20_expiry" date;
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "form21_no" text;
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "form21_expiry" date;
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "form20b_no" text;
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "form20b_expiry" date;
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "form21b_no" text;
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "form21b_expiry" date;
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "fssai_expiry" date;
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "chief_pharmacist_id" uuid;

DO $$ BEGIN
  ALTER TABLE "stores" ADD CONSTRAINT "stores_chief_pharmacist_id_users_id_fk" FOREIGN KEY ("chief_pharmacist_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "pharmacist_council_state" text;
