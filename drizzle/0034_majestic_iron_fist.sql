CREATE TABLE IF NOT EXISTS "customer_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"granted" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'pos' NOT NULL,
	"captured_by" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "privacy_notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" text DEFAULT 'Pharmacy Patient Privacy Notice' NOT NULL,
	"notice_text" text NOT NULL,
	"dpo_name" text,
	"dpo_contact" text,
	"retention_policy_summary" text,
	"version" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "customer_consents" ADD CONSTRAINT "customer_consents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "customer_consents" ADD CONSTRAINT "customer_consents_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "customer_consents" ADD CONSTRAINT "customer_consents_captured_by_users_id_fk" FOREIGN KEY ("captured_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "privacy_notices" ADD CONSTRAINT "privacy_notices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_consents_tenant_idx" ON "customer_consents" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_consents_customer_idx" ON "customer_consents" USING btree ("customer_id","purpose");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_consents_tenant_purpose_idx" ON "customer_consents" USING btree ("tenant_id","purpose","granted");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "privacy_notices_tenant_idx" ON "privacy_notices" USING btree ("tenant_id");
