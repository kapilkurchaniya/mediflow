CREATE TABLE IF NOT EXISTS "sms_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sender_id" text NOT NULL,
	"dlt_template_id" text NOT NULL,
	"entity_id" text,
	"category" text DEFAULT 'service_implicit' NOT NULL,
	"body" text NOT NULL,
	"variables" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "sms_templates" ADD CONSTRAINT "sms_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sms_templates_tenant_idx" ON "sms_templates" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sms_templates_tenant_name_idx" ON "sms_templates" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sms_templates_tenant_dlt_uq" ON "sms_templates" USING btree ("tenant_id","dlt_template_id");
