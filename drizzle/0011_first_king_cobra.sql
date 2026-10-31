CREATE TABLE "expiry_claim_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"claim_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"medicine_id" uuid NOT NULL,
	"qty" integer NOT NULL,
	"rate_paise" bigint DEFAULT 0 NOT NULL,
	"total_paise" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expiry_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"claim_no" text NOT NULL,
	"supplier_id" uuid NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"total_paise" bigint DEFAULT 0 NOT NULL,
	"supplier_credit_note_no" text,
	"settlement_type" text,
	"notes" text,
	"created_by" uuid NOT NULL,
	"settled_by" uuid,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quarantine_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"medicine_id" uuid NOT NULL,
	"supplier_id" uuid,
	"qty" integer NOT NULL,
	"reason" text DEFAULT 'expired' NOT NULL,
	"status" text DEFAULT 'quarantined' NOT NULL,
	"claim_id" uuid,
	"notes" text,
	"quarantined_by" uuid NOT NULL,
	"quarantined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_audit_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"medicine_id" uuid NOT NULL,
	"rack_id" uuid,
	"system_qty" integer DEFAULT 0 NOT NULL,
	"counted_qty" integer,
	"variance_qty" integer,
	"unit_cost_paise" bigint DEFAULT 0 NOT NULL,
	"variance_cost_paise" bigint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"counted_by" uuid,
	"counted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "stock_audit_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"session_no" text NOT NULL,
	"scope" text DEFAULT 'racks' NOT NULL,
	"rack_ids" jsonb DEFAULT '[]'::jsonb,
	"blind_count" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"notes" text,
	"started_by" uuid NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_transfer_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"transfer_id" uuid NOT NULL,
	"medicine_id" uuid NOT NULL,
	"from_batch_id" uuid NOT NULL,
	"batch_no" text NOT NULL,
	"expiry_date" date NOT NULL,
	"qty" integer NOT NULL,
	"received_qty" integer,
	"unit_cost" bigint DEFAULT 0 NOT NULL,
	"mrp" bigint DEFAULT 0 NOT NULL,
	"sale_rate" bigint DEFAULT 0 NOT NULL,
	"to_batch_id" uuid
);
--> statement-breakpoint
CREATE TABLE "stock_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"transfer_no" text NOT NULL,
	"from_store_id" uuid NOT NULL,
	"to_store_id" uuid NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"doc_kind" text DEFAULT 'delivery_challan' NOT NULL,
	"gst_document_id" uuid,
	"e_way_bill_no" text,
	"notes" text,
	"created_by" uuid NOT NULL,
	"dispatched_by" uuid,
	"dispatched_at" timestamp with time zone,
	"received_by" uuid,
	"received_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"ref_type" text NOT NULL,
	"ref_id" uuid NOT NULL,
	"amount" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "expiry_claim_items" ADD CONSTRAINT "expiry_claim_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expiry_claim_items" ADD CONSTRAINT "expiry_claim_items_claim_id_expiry_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."expiry_claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expiry_claim_items" ADD CONSTRAINT "expiry_claim_items_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expiry_claim_items" ADD CONSTRAINT "expiry_claim_items_medicine_id_medicines_id_fk" FOREIGN KEY ("medicine_id") REFERENCES "public"."medicines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expiry_claims" ADD CONSTRAINT "expiry_claims_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expiry_claims" ADD CONSTRAINT "expiry_claims_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expiry_claims" ADD CONSTRAINT "expiry_claims_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quarantine_batches" ADD CONSTRAINT "quarantine_batches_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quarantine_batches" ADD CONSTRAINT "quarantine_batches_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quarantine_batches" ADD CONSTRAINT "quarantine_batches_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quarantine_batches" ADD CONSTRAINT "quarantine_batches_medicine_id_medicines_id_fk" FOREIGN KEY ("medicine_id") REFERENCES "public"."medicines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quarantine_batches" ADD CONSTRAINT "quarantine_batches_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_audit_items" ADD CONSTRAINT "stock_audit_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_audit_items" ADD CONSTRAINT "stock_audit_items_session_id_stock_audit_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."stock_audit_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_audit_items" ADD CONSTRAINT "stock_audit_items_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_audit_items" ADD CONSTRAINT "stock_audit_items_medicine_id_medicines_id_fk" FOREIGN KEY ("medicine_id") REFERENCES "public"."medicines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_audit_sessions" ADD CONSTRAINT "stock_audit_sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_audit_sessions" ADD CONSTRAINT "stock_audit_sessions_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_transfer_id_stock_transfers_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "public"."stock_transfers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_medicine_id_medicines_id_fk" FOREIGN KEY ("medicine_id") REFERENCES "public"."medicines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_from_batch_id_batches_id_fk" FOREIGN KEY ("from_batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_from_store_id_stores_id_fk" FOREIGN KEY ("from_store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_to_store_id_stores_id_fk" FOREIGN KEY ("to_store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expiry_claim_items_claim_idx" ON "expiry_claim_items" USING btree ("claim_id");--> statement-breakpoint
CREATE UNIQUE INDEX "expiry_claims_no_uq" ON "expiry_claims" USING btree ("tenant_id","claim_no");--> statement-breakpoint
CREATE INDEX "expiry_claims_supplier_idx" ON "expiry_claims" USING btree ("supplier_id","status");--> statement-breakpoint
CREATE INDEX "expiry_claims_store_idx" ON "expiry_claims" USING btree ("store_id","status");--> statement-breakpoint
CREATE INDEX "quarantine_batches_store_status_idx" ON "quarantine_batches" USING btree ("store_id","status");--> statement-breakpoint
CREATE INDEX "quarantine_batches_supplier_idx" ON "quarantine_batches" USING btree ("supplier_id","status");--> statement-breakpoint
CREATE INDEX "stock_audit_items_session_idx" ON "stock_audit_items" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_audit_sessions_no_uq" ON "stock_audit_sessions" USING btree ("tenant_id","session_no");--> statement-breakpoint
CREATE INDEX "stock_audit_sessions_store_idx" ON "stock_audit_sessions" USING btree ("store_id","status");--> statement-breakpoint
CREATE INDEX "stock_transfer_items_trf_idx" ON "stock_transfer_items" USING btree ("transfer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_transfers_no_uq" ON "stock_transfers" USING btree ("tenant_id","transfer_no");--> statement-breakpoint
CREATE INDEX "stock_transfers_from_idx" ON "stock_transfers" USING btree ("from_store_id","status");--> statement-breakpoint
CREATE INDEX "stock_transfers_to_idx" ON "stock_transfers" USING btree ("to_store_id","status");--> statement-breakpoint
CREATE INDEX "payment_alloc_tenant_payment_idx" ON "payment_allocations" USING btree ("tenant_id","payment_id");--> statement-breakpoint
CREATE INDEX "payment_alloc_tenant_ref_idx" ON "payment_allocations" USING btree ("tenant_id","ref_type","ref_id");