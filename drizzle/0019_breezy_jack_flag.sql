CREATE TABLE "stock_conflict_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"medicine_id" uuid NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"required_reconciliation_qty" integer DEFAULT 0 NOT NULL,
	"reconciled_qty" integer DEFAULT 0 NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"resolution_type" text,
	"resolution_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_conflict_contributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"conflict_case_id" uuid NOT NULL,
	"sale_id" uuid NOT NULL,
	"client_sale_id" text NOT NULL,
	"device_id" uuid NOT NULL,
	"invoice_no" text NOT NULL,
	"contributed_qty" integer NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_conflict_resolutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"conflict_case_id" uuid NOT NULL,
	"operation_key" text NOT NULL,
	"resolution_type" text NOT NULL,
	"reconciled_qty" integer DEFAULT 0 NOT NULL,
	"source_batch_id" uuid,
	"target_batch_id" uuid,
	"transfer_id" uuid,
	"transfer_receipt_event_id" uuid,
	"stock_movement_id" uuid,
	"evidence_notes" text,
	"performed_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stock_conflict_cases" ADD CONSTRAINT "stock_conflict_cases_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_conflict_cases" ADD CONSTRAINT "stock_conflict_cases_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_conflict_cases" ADD CONSTRAINT "stock_conflict_cases_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_conflict_cases" ADD CONSTRAINT "stock_conflict_cases_medicine_id_medicines_id_fk" FOREIGN KEY ("medicine_id") REFERENCES "public"."medicines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_conflict_cases" ADD CONSTRAINT "stock_conflict_cases_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_conflict_contributions" ADD CONSTRAINT "stock_conflict_contributions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_conflict_contributions" ADD CONSTRAINT "stock_conflict_contributions_conflict_case_id_stock_conflict_cases_id_fk" FOREIGN KEY ("conflict_case_id") REFERENCES "public"."stock_conflict_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_conflict_contributions" ADD CONSTRAINT "stock_conflict_contributions_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_conflict_contributions" ADD CONSTRAINT "stock_conflict_contributions_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_conflict_resolutions" ADD CONSTRAINT "stock_conflict_resolutions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_conflict_resolutions" ADD CONSTRAINT "stock_conflict_resolutions_conflict_case_id_stock_conflict_cases_id_fk" FOREIGN KEY ("conflict_case_id") REFERENCES "public"."stock_conflict_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_conflict_resolutions" ADD CONSTRAINT "stock_conflict_resolutions_source_batch_id_batches_id_fk" FOREIGN KEY ("source_batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_conflict_resolutions" ADD CONSTRAINT "stock_conflict_resolutions_target_batch_id_batches_id_fk" FOREIGN KEY ("target_batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_conflict_resolutions" ADD CONSTRAINT "stock_conflict_resolutions_transfer_id_stock_transfers_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "public"."stock_transfers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_conflict_resolutions" ADD CONSTRAINT "stock_conflict_resolutions_transfer_receipt_event_id_stock_transfer_receipt_events_id_fk" FOREIGN KEY ("transfer_receipt_event_id") REFERENCES "public"."stock_transfer_receipt_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_conflict_resolutions" ADD CONSTRAINT "stock_conflict_resolutions_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_conflicts_tenant_store_idx" ON "stock_conflict_cases" USING btree ("tenant_id","store_id","status");--> statement-breakpoint
CREATE INDEX "stock_conflicts_batch_idx" ON "stock_conflict_cases" USING btree ("batch_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "conflict_contrib_case_sale_uq" ON "stock_conflict_contributions" USING btree ("conflict_case_id","sale_id");--> statement-breakpoint
CREATE INDEX "conflict_contrib_case_idx" ON "stock_conflict_contributions" USING btree ("conflict_case_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conflict_res_op_key_uq" ON "stock_conflict_resolutions" USING btree ("tenant_id","operation_key");--> statement-breakpoint
CREATE INDEX "conflict_res_case_idx" ON "stock_conflict_resolutions" USING btree ("conflict_case_id");