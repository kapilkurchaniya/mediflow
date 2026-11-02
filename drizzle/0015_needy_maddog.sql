CREATE TABLE "stock_transfer_receipt_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"transfer_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"received_by" uuid NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "import_job_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"row_no" integer NOT NULL,
	"raw" jsonb NOT NULL,
	"normalized" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"target_id" uuid,
	"external_ref" text
);
--> statement-breakpoint
CREATE TABLE "import_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"store_id" uuid,
	"entity" text NOT NULL,
	"source" text DEFAULT 'generic' NOT NULL,
	"file_name" text NOT NULL,
	"status" text DEFAULT 'uploaded' NOT NULL,
	"mapping" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"totals" jsonb DEFAULT '{"rows":0,"valid":0,"errors":0,"created":0,"updated":0,"skipped":0}'::jsonb NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
DROP INDEX "stock_transfers_no_uq";--> statement-breakpoint
ALTER TABLE "store_medicine_settings" ALTER COLUMN "sale_price_override" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "store_medicine_settings" ALTER COLUMN "sale_price_override" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_transfer_items" ALTER COLUMN "received_qty" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "stock_transfer_items" ALTER COLUMN "received_qty" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_transfer_items" ADD COLUMN "mfg_date" date;--> statement-breakpoint
ALTER TABLE "stock_transfer_items" ADD COLUMN "hsn" text;--> statement-breakpoint
ALTER TABLE "stock_transfer_items" ADD COLUMN "gst_rate_bp" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_transfer_items" ADD COLUMN "qty_dispatched" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_transfer_items" ADD COLUMN "qty_damaged" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_transfer_items" ADD COLUMN "qty_shortage" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_transfer_items" ADD COLUMN "discrepancy_reason" text;--> statement-breakpoint
ALTER TABLE "stock_transfer_items" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_transfer_items" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD COLUMN "document_no" text;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD COLUMN "document_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD COLUMN "gstin_source_snapshot" text;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD COLUMN "gstin_dest_snapshot" text;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD COLUMN "source_address_snapshot" text;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD COLUMN "dest_address_snapshot" text;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD COLUMN "place_of_supply" text;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD COLUMN "transport_mode" text DEFAULT 'road';--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD COLUMN "vehicle_no" text;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD COLUMN "transporter_name" text;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD COLUMN "transporter_id" text;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD COLUMN "e_way_bill_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD COLUMN "taxable_value_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD COLUMN "cgst_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD COLUMN "sgst_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD COLUMN "igst_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD COLUMN "total_value_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD COLUMN "cancelled_by" uuid;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD COLUMN "cancel_reason" text;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_transfer_receipt_events" ADD CONSTRAINT "stock_transfer_receipt_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfer_receipt_events" ADD CONSTRAINT "stock_transfer_receipt_events_transfer_id_stock_transfers_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "public"."stock_transfers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_job_rows" ADD CONSTRAINT "import_job_rows_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_job_rows" ADD CONSTRAINT "import_job_rows_job_id_import_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."import_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_transfer_receipt_idempotency" ON "stock_transfer_receipt_events" USING btree ("tenant_id","transfer_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "import_job_rows_job_status_idx" ON "import_job_rows" USING btree ("job_id","status");--> statement-breakpoint
CREATE INDEX "import_job_rows_job_row_idx" ON "import_job_rows" USING btree ("job_id","row_no");--> statement-breakpoint
CREATE INDEX "import_job_rows_tenant_ext_idx" ON "import_job_rows" USING btree ("tenant_id","external_ref");--> statement-breakpoint
CREATE INDEX "import_jobs_tenant_status_idx" ON "import_jobs" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "import_jobs_tenant_created_idx" ON "import_jobs" USING btree ("tenant_id","created_at");--> statement-breakpoint
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_to_batch_id_batches_id_fk" FOREIGN KEY ("to_batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_transfer_items_med_batch_idx" ON "stock_transfer_items" USING btree ("medicine_id","batch_no");--> statement-breakpoint
CREATE INDEX "stock_transfers_tenant_status_idx" ON "stock_transfers" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_transfers_no_uq" ON "stock_transfers" USING btree ("tenant_id",lower("transfer_no"));