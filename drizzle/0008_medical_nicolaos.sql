ALTER TABLE "stores" ADD COLUMN "drug_license_expiry" date;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "fssai_no" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "pharmacist_reg_expiry" date;--> statement-breakpoint
ALTER TABLE "medicines" ADD COLUMN "units_per_pack" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "medicines" ADD COLUMN "pack_unit" text DEFAULT 'strip' NOT NULL;--> statement-breakpoint
ALTER TABLE "medicines" ADD COLUMN "loose_unit" text DEFAULT 'tablet' NOT NULL;