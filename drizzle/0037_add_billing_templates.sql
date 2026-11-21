CREATE TABLE "billing_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"format" text NOT NULL,
	"name" text NOT NULL,
	"html_content" text NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"source_type" text DEFAULT 'manual' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing_templates" ADD CONSTRAINT "billing_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_templates" ADD CONSTRAINT "billing_templates_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_templates" ADD CONSTRAINT "billing_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_templates_store_format_idx" ON "billing_templates" USING btree ("tenant_id","store_id","format");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_templates_active_uq" ON "billing_templates" USING btree ("tenant_id","store_id","format") WHERE "billing_templates"."is_active" = true;