CREATE TABLE "store_medicine_settings" (
	"tenant_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"medicine_id" uuid NOT NULL,
	"reorder_level" integer,
	"max_stock" integer,
	"rack_id" uuid,
	"sale_price_override" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_medicine_settings_pk" PRIMARY KEY("store_id","medicine_id"),
	CONSTRAINT "chk_sms_reorder_non_neg" CHECK ("reorder_level" IS NULL OR "reorder_level" >= 0),
	CONSTRAINT "chk_sms_max_stock_non_neg" CHECK ("max_stock" IS NULL OR "max_stock" >= 0),
	CONSTRAINT "chk_sms_price_non_neg" CHECK ("sale_price_override" IS NULL OR "sale_price_override" >= 0)
);
--> statement-breakpoint
ALTER TABLE "store_medicine_settings" ADD CONSTRAINT "store_medicine_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_medicine_settings" ADD CONSTRAINT "store_medicine_settings_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_medicine_settings" ADD CONSTRAINT "store_medicine_settings_medicine_id_medicines_id_fk" FOREIGN KEY ("medicine_id") REFERENCES "public"."medicines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_medicine_settings" ADD CONSTRAINT "store_medicine_settings_rack_id_racks_id_fk" FOREIGN KEY ("rack_id") REFERENCES "public"."racks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_sms_tenant_store" ON "store_medicine_settings" USING btree ("tenant_id","store_id");--> statement-breakpoint
CREATE INDEX "idx_sms_store_rack" ON "store_medicine_settings" USING btree ("store_id","rack_id");--> statement-breakpoint
-- Sparse backfill: populate store_medicine_settings for legacy rack assignments where rack belongs to the store
INSERT INTO "store_medicine_settings" (
	"tenant_id",
	"store_id",
	"medicine_id",
	"rack_id",
	"reorder_level",
	"max_stock",
	"created_at",
	"updated_at"
)
SELECT
	m."tenant_id",
	r."store_id",
	m."id",
	r."id",
	m."reorder_level",
	m."max_stock",
	NOW(),
	NOW()
FROM "medicines" m
INNER JOIN "racks" r ON r."id" = m."rack_id" AND r."tenant_id" = m."tenant_id"
ON CONFLICT ("store_id", "medicine_id") DO NOTHING;
