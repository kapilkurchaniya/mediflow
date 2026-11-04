CREATE TABLE IF NOT EXISTS "cash_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"cash_session_id" uuid NOT NULL,
	"movement_type" text NOT NULL,
	"direction" text NOT NULL,
	"amount" bigint DEFAULT 0 NOT NULL,
	"payment_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "client_operation_id" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "cash_session_id" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "paid_from_till" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "payee_name" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "vendor_invoice_no" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "vendor_invoice_date" date;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "vendor_gstin" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_cash_session_id_cash_sessions_id_fk" FOREIGN KEY ("cash_session_id") REFERENCES "public"."cash_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cash_movements_session_idx" ON "cash_movements" USING btree ("tenant_id","cash_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cash_movements_payment_uq" ON "cash_movements" USING btree ("payment_id") WHERE "cash_movements"."payment_id" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_cash_session_idx" ON "payments" USING btree ("tenant_id","cash_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payments_tenant_client_op_uq" ON "payments" USING btree ("tenant_id","client_operation_id") WHERE "payments"."client_operation_id" is not null;
