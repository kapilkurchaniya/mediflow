CREATE TABLE "device_invoice_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"client_reservation_id" text NOT NULL,
	"fiscal_year" text NOT NULL,
	"start_seq" integer NOT NULL,
	"end_seq" integer NOT NULL,
	"count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_sync_idempotency" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"client_operation_id" text NOT NULL,
	"payload_hash" text NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "device_invoice_reservations" ADD CONSTRAINT "device_invoice_reservations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_invoice_reservations" ADD CONSTRAINT "device_invoice_reservations_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_invoice_reservations" ADD CONSTRAINT "device_invoice_reservations_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_invoice_reservations" ADD CONSTRAINT "dev_inv_res_tenant_store_fk" FOREIGN KEY ("tenant_id","store_id") REFERENCES "public"."stores"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_sync_idempotency" ADD CONSTRAINT "device_sync_idempotency_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_sync_idempotency" ADD CONSTRAINT "device_sync_idempotency_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_sync_idempotency" ADD CONSTRAINT "device_sync_idempotency_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_sync_idempotency" ADD CONSTRAINT "dev_sync_idemp_tenant_store_fk" FOREIGN KEY ("tenant_id","store_id") REFERENCES "public"."stores"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dev_inv_res_client_uq" ON "device_invoice_reservations" USING btree ("device_id","client_reservation_id");--> statement-breakpoint
CREATE INDEX "dev_inv_res_range_idx" ON "device_invoice_reservations" USING btree ("device_id","fiscal_year","start_seq","end_seq");--> statement-breakpoint
CREATE INDEX "dev_inv_res_tenant_store_idx" ON "device_invoice_reservations" USING btree ("tenant_id","store_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dev_sync_idemp_uq" ON "device_sync_idempotency" USING btree ("tenant_id","device_id","scope","client_operation_id");--> statement-breakpoint
CREATE INDEX "dev_sync_idemp_created_idx" ON "device_sync_idempotency" USING btree ("tenant_id","created_at");--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_tenant_store_fk" FOREIGN KEY ("tenant_id","store_id") REFERENCES "public"."stores"("tenant_id","id") ON DELETE restrict ON UPDATE no action;