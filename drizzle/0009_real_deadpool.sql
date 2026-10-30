ALTER TABLE "sale_items" ADD COLUMN "units_per_pack" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "sale_items" ADD COLUMN "pack_unit" text DEFAULT 'strip' NOT NULL;--> statement-breakpoint
ALTER TABLE "sale_items" ADD COLUMN "loose_unit" text DEFAULT 'tablet' NOT NULL;--> statement-breakpoint
ALTER TABLE "sale_items" ADD COLUMN "pack_qty" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sale_items" ADD COLUMN "loose_qty" integer DEFAULT 0 NOT NULL;