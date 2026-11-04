CREATE TABLE "tenant_gsp_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"store_id" uuid,
	"provider" text DEFAULT 'sandbox_co_in' NOT NULL,
	"client_id_enc" text NOT NULL,
	"client_secret_enc" text NOT NULL,
	"portal_username_enc" text NOT NULL,
	"portal_password_enc" text NOT NULL,
	"cached_auth_token_enc" text,
	"token_expires_at" timestamp with time zone,
	"is_sandbox" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gst_documents" ADD COLUMN "signed_invoice" text;--> statement-breakpoint
ALTER TABLE "gst_documents" ADD COLUMN "einvoice_provider" text;--> statement-breakpoint
ALTER TABLE "gst_documents" ADD COLUMN "cancelled_reason" text;--> statement-breakpoint
ALTER TABLE "gst_documents" ADD COLUMN "cancelled_remarks" text;--> statement-breakpoint
ALTER TABLE "tenant_gsp_credentials" ADD CONSTRAINT "tenant_gsp_credentials_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gsp_creds_tenant_idx" ON "tenant_gsp_credentials" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "gsp_creds_store_idx" ON "tenant_gsp_credentials" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "journal_tenant_store_date_idx" ON "journal_entries" USING btree ("tenant_id","store_id","entry_date");--> statement-breakpoint
CREATE INDEX "journal_lines_tenant_party_idx" ON "journal_lines" USING btree ("tenant_id","party_type","party_id");