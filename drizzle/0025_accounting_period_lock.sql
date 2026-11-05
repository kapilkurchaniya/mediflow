CREATE TABLE IF NOT EXISTS "accounting_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"gstin" text,
	"period_key" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"financial_year" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" uuid,
	"lock_note" text,
	"closing_snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounting_periods_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "accounting_period_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"period_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"event_sequence" integer NOT NULL,
	"reason" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"performed_by" uuid NOT NULL,
	"performed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounting_period_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "accounting_period_events_period_id_accounting_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."accounting_periods"("id") ON DELETE restrict ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "acct_periods_tenant_global_uq" ON "accounting_periods" USING btree ("tenant_id","period_key") WHERE "accounting_periods"."gstin" is null;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "acct_periods_tenant_gstin_uq" ON "accounting_periods" USING btree ("tenant_id","gstin","period_key") WHERE "accounting_periods"."gstin" is not null;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "acct_periods_tenant_fy_idx" ON "accounting_periods" USING btree ("tenant_id","financial_year");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "acct_periods_tenant_status_idx" ON "accounting_periods" USING btree ("tenant_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "acct_period_events_period_seq_idx" ON "accounting_period_events" USING btree ("period_id","event_sequence");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "acct_period_events_tenant_idx" ON "accounting_period_events" USING btree ("tenant_id","performed_at");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_accounting_period_events_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'accounting_period_events is append-only: updates and deletes are prohibited';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_prevent_accounting_period_events_mutation ON "accounting_period_events";
--> statement-breakpoint
CREATE TRIGGER trg_prevent_accounting_period_events_mutation
BEFORE UPDATE OR DELETE ON "accounting_period_events"
FOR EACH ROW
EXECUTE FUNCTION prevent_accounting_period_events_mutation();
