CREATE TABLE IF NOT EXISTS "gst_2b_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"gstin" text NOT NULL,
	"return_period" text NOT NULL,
	"file_name" text NOT NULL,
	"file_size" integer,
	"total_invoices" integer DEFAULT 0 NOT NULL,
	"total_taxable_amount" bigint DEFAULT 0 NOT NULL,
	"total_cgst" bigint DEFAULT 0 NOT NULL,
	"total_sgst" bigint DEFAULT 0 NOT NULL,
	"total_igst" bigint DEFAULT 0 NOT NULL,
	"total_cess" bigint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'imported' NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gst_2b_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"import_id" uuid NOT NULL,
	"supplier_gstin" text NOT NULL,
	"supplier_name" text,
	"doc_type" text DEFAULT 'invoice' NOT NULL,
	"invoice_no" text NOT NULL,
	"invoice_date" date NOT NULL,
	"taxable_amount" bigint DEFAULT 0 NOT NULL,
	"cgst" bigint DEFAULT 0 NOT NULL,
	"sgst" bigint DEFAULT 0 NOT NULL,
	"igst" bigint DEFAULT 0 NOT NULL,
	"cess" bigint DEFAULT 0 NOT NULL,
	"total_amount" bigint DEFAULT 0 NOT NULL,
	"itc_availability" text DEFAULT 'Y' NOT NULL,
	"itc_reason" text,
	"match_status" text DEFAULT 'unmatched' NOT NULL,
	"matched_purchase_id" uuid,
	"match_variance_amount" bigint DEFAULT 0 NOT NULL,
	"match_notes" text,
	"ims_action" text DEFAULT 'pending' NOT NULL,
	"ims_action_date" timestamp with time zone,
	"ims_action_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gst_2b_imports_tenant_id_tenants_id_fk') THEN
    ALTER TABLE "gst_2b_imports" ADD CONSTRAINT "gst_2b_imports_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gst_2b_imports_uploaded_by_users_id_fk') THEN
    ALTER TABLE "gst_2b_imports" ADD CONSTRAINT "gst_2b_imports_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gst_2b_lines_tenant_id_tenants_id_fk') THEN
    ALTER TABLE "gst_2b_lines" ADD CONSTRAINT "gst_2b_lines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gst_2b_lines_import_id_gst_2b_imports_id_fk') THEN
    ALTER TABLE "gst_2b_lines" ADD CONSTRAINT "gst_2b_lines_import_id_gst_2b_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."gst_2b_imports"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gst_2b_lines_matched_purchase_id_purchases_id_fk') THEN
    ALTER TABLE "gst_2b_lines" ADD CONSTRAINT "gst_2b_lines_matched_purchase_id_purchases_id_fk" FOREIGN KEY ("matched_purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gst_2b_lines_ims_action_by_users_id_fk') THEN
    ALTER TABLE "gst_2b_lines" ADD CONSTRAINT "gst_2b_lines_ims_action_by_users_id_fk" FOREIGN KEY ("ims_action_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gst2b_imports_tenant_period_idx" ON "gst_2b_imports" USING btree ("tenant_id","return_period");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gst2b_imports_gstin_idx" ON "gst_2b_imports" USING btree ("gstin");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gst2b_lines_import_idx" ON "gst_2b_lines" USING btree ("import_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gst2b_lines_supplier_inv_idx" ON "gst_2b_lines" USING btree ("supplier_gstin","invoice_no");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gst2b_lines_match_status_idx" ON "gst_2b_lines" USING btree ("tenant_id","match_status");
