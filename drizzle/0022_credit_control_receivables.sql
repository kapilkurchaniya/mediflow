ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "credit_days" integer DEFAULT 30 NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customers_tenant_credit_idx" ON "customers" USING btree ("tenant_id","credit_limit");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_tenant_cust_credit_idx" ON "sales" USING btree ("tenant_id","customer_id","credit_amount");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_tenant_store_completed_idx" ON "sales" USING btree ("tenant_id","store_id","completed_at");
