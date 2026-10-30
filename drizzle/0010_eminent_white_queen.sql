ALTER TABLE "purchase_items" ADD COLUMN "units_per_pack" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD COLUMN "pack_unit" text DEFAULT 'strip' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD COLUMN "loose_unit" text DEFAULT 'tablet' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD COLUMN "scheme_type" text;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD COLUMN "trade_discount_bp" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD COLUMN "cash_discount_bp" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD COLUMN "cash_discount_amount" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "trade_discount_amount" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "cash_discount_amount" bigint DEFAULT 0 NOT NULL;