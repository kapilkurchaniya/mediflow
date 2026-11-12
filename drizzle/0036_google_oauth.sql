CREATE TABLE "year_end_authorization_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"fiscal_year" text NOT NULL,
	"authorized_user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"action" text DEFAULT 'finalize_year_end' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_grant_ttl" CHECK ("year_end_authorization_grants"."expires_at" > "year_end_authorization_grants"."created_at" AND "year_end_authorization_grants"."expires_at" <= "year_end_authorization_grants"."created_at" + interval '300 seconds'),
	CONSTRAINT "chk_grant_action" CHECK ("year_end_authorization_grants"."action" = 'finalize_year_end')
);
--> statement-breakpoint
CREATE TABLE "year_end_period_controls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"fiscal_year" text NOT NULL,
	"cutoff_date" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"finalized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_period_ctrl_status" CHECK ("year_end_period_controls"."status" IN ('open', 'finalized')),
	CONSTRAINT "chk_period_ctrl_integrity" CHECK (("year_end_period_controls"."status" = 'open' AND "year_end_period_controls"."finalized_at" IS NULL) OR ("year_end_period_controls"."status" = 'finalized' AND "year_end_period_controls"."finalized_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "year_end_stock_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"batch_number" text NOT NULL,
	"expiry_date" date NOT NULL,
	"grn_number" text,
	"supplier_name" text,
	"canonical_unit" text DEFAULT 'unit' NOT NULL,
	"qty" integer NOT NULL,
	"landed_cost_paise" bigint DEFAULT 0 NOT NULL,
	"cost_value_paise" bigint DEFAULT 0 NOT NULL,
	"estimated_nrv_paise" bigint DEFAULT 0 NOT NULL,
	"nrv_paise" bigint DEFAULT 0 NOT NULL,
	"nrv_basis" text DEFAULT 'sales_history_90d' NOT NULL,
	"nrv_source" text DEFAULT 'sales_ledger' NOT NULL,
	"evidence_ref" text,
	"is_overridden" boolean DEFAULT false NOT NULL,
	"override_reason" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"final_valuation_paise" bigint DEFAULT 0 NOT NULL,
	"provision_paise" bigint DEFAULT 0 NOT NULL,
	"classification" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_qty_bounds" CHECK ("year_end_stock_items"."qty" >= 0 AND "year_end_stock_items"."qty" <= 10000000),
	CONSTRAINT "chk_cost_bounds" CHECK ("year_end_stock_items"."landed_cost_paise" >= 0 AND "year_end_stock_items"."landed_cost_paise" <= 100000000000),
	CONSTRAINT "chk_nrv_bounds" CHECK ("year_end_stock_items"."estimated_nrv_paise" >= 0 AND "year_end_stock_items"."estimated_nrv_paise" <= 100000000000 AND "year_end_stock_items"."nrv_paise" >= 0 AND "year_end_stock_items"."nrv_paise" <= 100000000000),
	CONSTRAINT "chk_classification_valid" CHECK ("year_end_stock_items"."classification" IN ('active', 'near_expiry', 'critical', 'expired', 'damaged', 'quarantined'))
);
--> statement-breakpoint
CREATE TABLE "year_end_stock_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"fiscal_year" text NOT NULL,
	"cutoff_date" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"total_units" bigint DEFAULT 0 NOT NULL,
	"gross_landed_cost_paise" bigint DEFAULT 0 NOT NULL,
	"total_nrv_paise" bigint DEFAULT 0 NOT NULL,
	"final_valuation_paise" bigint DEFAULT 0 NOT NULL,
	"total_provision_paise" bigint DEFAULT 0 NOT NULL,
	"valuation_policy_version" text DEFAULT 'ICDS_II_v1' NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_snapshot_status" CHECK ("year_end_stock_snapshots"."status" IN ('draft', 'finalized')),
	CONSTRAINT "chk_snapshot_aggregates" CHECK ("year_end_stock_snapshots"."total_units" >= 0 AND "year_end_stock_snapshots"."total_units" <= 1000000000 AND "year_end_stock_snapshots"."gross_landed_cost_paise" >= 0 AND "year_end_stock_snapshots"."gross_landed_cost_paise" <= 1000000000000000 AND "year_end_stock_snapshots"."total_nrv_paise" >= 0 AND "year_end_stock_snapshots"."total_nrv_paise" <= 1000000000000000 AND "year_end_stock_snapshots"."final_valuation_paise" >= 0 AND "year_end_stock_snapshots"."final_valuation_paise" <= 1000000000000000 AND "year_end_stock_snapshots"."total_provision_paise" >= 0 AND "year_end_stock_snapshots"."total_provision_paise" <= 1000000000000000)
);
--> statement-breakpoint
CREATE TABLE "delivery_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"delivery_order_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"prev_assignee_id" uuid,
	"new_assignee_id" uuid,
	"from_status" text NOT NULL,
	"to_status" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_event_type" CHECK ("delivery_events"."event_type" IN ('assigned', 'reassigned', 'in_transit', 'delivered', 'failed', 'proof_uploaded'))
);
--> statement-breakpoint
CREATE TABLE "delivery_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"sale_id" uuid NOT NULL,
	"delivery_staff_user_id" uuid,
	"delivery_status" text DEFAULT 'assigned' NOT NULL,
	"payment_status" text DEFAULT 'pending' NOT NULL,
	"delivery_address" text NOT NULL,
	"recipient_name" text NOT NULL,
	"recipient_phone" text NOT NULL,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_deliv_status" CHECK ("delivery_orders"."delivery_status" IN ('assigned', 'in_transit', 'delivered', 'failed')),
	CONSTRAINT "chk_deliv_pay_status" CHECK ("delivery_orders"."payment_status" IN ('pending', 'intent_created', 'collected', 'verified'))
);
--> statement-breakpoint
CREATE TABLE "delivery_payment_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"delivery_order_id" uuid NOT NULL,
	"provider" text DEFAULT 'razorpay' NOT NULL,
	"provider_qr_id" text NOT NULL,
	"provider_order_ref" text NOT NULL,
	"provider_payment_id" text,
	"amount_paise" bigint NOT NULL,
	"qr_payload" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"verified_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_intent_provider" CHECK ("delivery_payment_intents"."provider" IN ('razorpay', 'mock')),
	CONSTRAINT "chk_intent_status" CHECK ("delivery_payment_intents"."status" IN ('pending', 'verified', 'failed', 'expired'))
);
--> statement-breakpoint
CREATE TABLE "delivery_payment_webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"provider_payment_id" text,
	"event_type" text NOT NULL,
	"payload_sha256" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"lease_token" text,
	"lease_expires_at" timestamp with time zone,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_webhook_status" CHECK ("delivery_payment_webhooks"."status" IN ('pending', 'processing', 'processed', 'ignored', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "delivery_proofs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"delivery_order_id" uuid NOT NULL,
	"proof_type" text NOT NULL,
	"file_key" text NOT NULL,
	"file_type" text NOT NULL,
	"file_size_bytes" integer NOT NULL,
	"checksum_sha256" text NOT NULL,
	"upload_status" text DEFAULT 'pending' NOT NULL,
	"idempotency_key" text NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_proof_type" CHECK ("delivery_proofs"."proof_type" IN ('delivery_photo', 'recipient_signature')),
	CONSTRAINT "chk_proof_mime" CHECK ("delivery_proofs"."file_type" IN ('image/jpeg', 'image/png', 'application/pdf')),
	CONSTRAINT "chk_proof_size" CHECK ("delivery_proofs"."file_size_bytes" > 0 AND "delivery_proofs"."file_size_bytes" <= 10485760),
	CONSTRAINT "chk_proof_status" CHECK ("delivery_proofs"."upload_status" IN ('pending', 'completed', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "mobile_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"device_name" text NOT NULL,
	"platform" text NOT NULL,
	"device_uuid" text NOT NULL,
	"enrollment_status" text DEFAULT 'pending' NOT NULL,
	"push_token" text,
	"last_active_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_device_platform" CHECK ("mobile_devices"."platform" IN ('ios', 'android')),
	CONSTRAINT "chk_device_status" CHECK ("mobile_devices"."enrollment_status" IN ('pending', 'enrolled', 'revoked'))
);
--> statement-breakpoint
CREATE TABLE "mobile_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"refresh_token_hash" text NOT NULL,
	"family_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"session_version" integer DEFAULT 1 NOT NULL,
	"is_consumed" text DEFAULT 'false' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "remote_approval_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"approver_user_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"challenge_token_hash" text NOT NULL,
	"snapshot_hash" text NOT NULL,
	"is_consumed" text DEFAULT 'false' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "remote_approval_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"challenge_id" uuid NOT NULL,
	"decided_by" uuid NOT NULL,
	"decision" text NOT NULL,
	"decision_reason" text,
	"idempotency_key" text NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_approval_decision" CHECK ("remote_approval_decisions"."decision" IN ('approved', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "remote_approval_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"request_type" text NOT NULL,
	"ref_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"snapshot_payload" jsonb NOT NULL,
	"snapshot_hash" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_approval_req_type" CHECK ("remote_approval_requests"."request_type" IN ('credit_override', 'po_limit')),
	CONSTRAINT "chk_approval_req_status" CHECK ("remote_approval_requests"."status" IN ('pending', 'approved', 'rejected', 'expired'))
);
--> statement-breakpoint
CREATE TABLE "pilot_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"store_id" text NOT NULL,
	"user_id" text NOT NULL,
	"category" text NOT NULL,
	"severity" text DEFAULT 'medium' NOT NULL,
	"summary" text NOT NULL,
	"details" text NOT NULL,
	"diagnostics" jsonb,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "worker_heartbeats" (
	"worker_name" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"last_started_at" timestamp with time zone,
	"last_heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_success_at" timestamp with time zone,
	"last_error_at" timestamp with time zone,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"meta" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_oauth_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" text,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "medicines" DROP CONSTRAINT "medicines_rack_id_racks_id_fk";
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "form20_no" text;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "form20_expiry" date;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "form21_no" text;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "form21_expiry" date;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "form20b_no" text;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "form20b_expiry" date;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "form21b_no" text;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "form21b_expiry" date;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "fssai_expiry" date;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "chief_pharmacist_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "pharmacist_council_state" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_url" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "effective_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "opening_inventory_snapshots" ADD COLUMN "source_year_end_snapshot_id" uuid;--> statement-breakpoint
ALTER TABLE "year_end_authorization_grants" ADD CONSTRAINT "year_end_authorization_grants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "year_end_authorization_grants" ADD CONSTRAINT "grants_membership_fk" FOREIGN KEY ("tenant_id","authorized_user_id") REFERENCES "public"."memberships"("tenant_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "year_end_period_controls" ADD CONSTRAINT "year_end_period_controls_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "year_end_period_controls" ADD CONSTRAINT "period_controls_store_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "year_end_stock_items" ADD CONSTRAINT "year_end_items_store_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "year_end_stock_items" ADD CONSTRAINT "year_end_items_snapshot_fk" FOREIGN KEY ("tenant_id","store_id","snapshot_id") REFERENCES "public"."year_end_stock_snapshots"("tenant_id","store_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "year_end_stock_items" ADD CONSTRAINT "year_end_items_batch_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "year_end_stock_items" ADD CONSTRAINT "year_end_items_reviewed_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "year_end_stock_snapshots" ADD CONSTRAINT "year_end_stock_snapshots_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "year_end_stock_snapshots" ADD CONSTRAINT "year_end_snapshots_store_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "year_end_stock_snapshots" ADD CONSTRAINT "year_end_snapshots_approved_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_events" ADD CONSTRAINT "delivery_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_events" ADD CONSTRAINT "fk_event_order" FOREIGN KEY ("tenant_id","delivery_order_id") REFERENCES "public"."delivery_orders"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_orders" ADD CONSTRAINT "delivery_orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_orders" ADD CONSTRAINT "fk_delivery_store" FOREIGN KEY ("tenant_id","store_id") REFERENCES "public"."stores"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_payment_intents" ADD CONSTRAINT "delivery_payment_intents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_payment_intents" ADD CONSTRAINT "fk_intent_order" FOREIGN KEY ("tenant_id","delivery_order_id") REFERENCES "public"."delivery_orders"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_payment_webhooks" ADD CONSTRAINT "delivery_payment_webhooks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_proofs" ADD CONSTRAINT "delivery_proofs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_proofs" ADD CONSTRAINT "fk_proof_order" FOREIGN KEY ("tenant_id","delivery_order_id") REFERENCES "public"."delivery_orders"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mobile_devices" ADD CONSTRAINT "mobile_devices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mobile_devices" ADD CONSTRAINT "mobile_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mobile_sessions" ADD CONSTRAINT "mobile_sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mobile_sessions" ADD CONSTRAINT "mobile_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mobile_sessions" ADD CONSTRAINT "fk_session_device" FOREIGN KEY ("tenant_id","user_id","device_id") REFERENCES "public"."mobile_devices"("tenant_id","user_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remote_approval_challenges" ADD CONSTRAINT "remote_approval_challenges_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remote_approval_challenges" ADD CONSTRAINT "fk_challenge_request" FOREIGN KEY ("tenant_id","request_id") REFERENCES "public"."remote_approval_requests"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remote_approval_challenges" ADD CONSTRAINT "fk_challenge_session_device" FOREIGN KEY ("tenant_id","approver_user_id","device_id","session_id") REFERENCES "public"."mobile_sessions"("tenant_id","user_id","device_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remote_approval_decisions" ADD CONSTRAINT "remote_approval_decisions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remote_approval_decisions" ADD CONSTRAINT "fk_decision_request" FOREIGN KEY ("tenant_id","request_id") REFERENCES "public"."remote_approval_requests"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remote_approval_decisions" ADD CONSTRAINT "fk_decision_challenge_actor" FOREIGN KEY ("tenant_id","decided_by","challenge_id") REFERENCES "public"."remote_approval_challenges"("tenant_id","approver_user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remote_approval_requests" ADD CONSTRAINT "remote_approval_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remote_approval_requests" ADD CONSTRAINT "fk_approval_req_store" FOREIGN KEY ("tenant_id","store_id") REFERENCES "public"."stores"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_oauth_accounts" ADD CONSTRAINT "user_oauth_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_grant_token_hash" ON "year_end_authorization_grants" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "grants_lookup_idx" ON "year_end_authorization_grants" USING btree ("tenant_id","store_id","fiscal_year","token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "period_controls_tenant_store_fy_uq" ON "year_end_period_controls" USING btree ("tenant_id","store_id","fiscal_year");--> statement-breakpoint
CREATE UNIQUE INDEX "year_end_items_snapshot_batch_uq" ON "year_end_stock_items" USING btree ("tenant_id","snapshot_id","batch_id");--> statement-breakpoint
CREATE INDEX "year_end_items_snapshot_idx" ON "year_end_stock_items" USING btree ("tenant_id","store_id","snapshot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "year_end_snapshots_tenant_store_fy_uq" ON "year_end_stock_snapshots" USING btree ("tenant_id","store_id","fiscal_year");--> statement-breakpoint
CREATE UNIQUE INDEX "year_end_snapshots_tenant_store_id_uq" ON "year_end_stock_snapshots" USING btree ("tenant_id","store_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_delivery_order_tenant" ON "delivery_orders" USING btree ("tenant_id","id");--> statement-breakpoint
CREATE INDEX "idx_delivery_staff_assigned" ON "delivery_orders" USING btree ("tenant_id","store_id","delivery_staff_user_id","delivery_status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_delivery_order_ref" ON "delivery_payment_intents" USING btree ("tenant_id","provider_order_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_mobile_intent_provider_qr" ON "delivery_payment_intents" USING btree ("provider","provider_qr_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_mobile_intent_provider_payment" ON "delivery_payment_intents" USING btree ("tenant_id","provider_payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_payment_webhook_event" ON "delivery_payment_webhooks" USING btree ("provider","provider_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_proof_idempotency" ON "delivery_proofs" USING btree ("tenant_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_mobile_device_uuid" ON "mobile_devices" USING btree ("tenant_id","user_id","device_uuid");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_mobile_device_tenant_user" ON "mobile_devices" USING btree ("tenant_id","user_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_mobile_refresh_token_hash" ON "mobile_sessions" USING btree ("refresh_token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_mobile_sessions_composite" ON "mobile_sessions" USING btree ("tenant_id","user_id","device_id","id");--> statement-breakpoint
CREATE INDEX "idx_mobile_sessions_family" ON "mobile_sessions" USING btree ("tenant_id","family_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_approval_challenge_token" ON "remote_approval_challenges" USING btree ("challenge_token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_approval_challenge_actor" ON "remote_approval_challenges" USING btree ("tenant_id","approver_user_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_approval_request_decision" ON "remote_approval_decisions" USING btree ("tenant_id","request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_approval_idempotency" ON "remote_approval_decisions" USING btree ("tenant_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_approval_request_tenant" ON "remote_approval_requests" USING btree ("tenant_id","id");--> statement-breakpoint
CREATE INDEX "idx_pilot_feedback_store" ON "pilot_feedback" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_worker_heartbeats_status" ON "worker_heartbeats" USING btree ("status","last_heartbeat_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_oauth_provider_account_uq" ON "user_oauth_accounts" USING btree ("provider","provider_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_oauth_user_provider_uq" ON "user_oauth_accounts" USING btree ("user_id","provider");--> statement-breakpoint
CREATE INDEX "user_oauth_user_idx" ON "user_oauth_accounts" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_chief_pharmacist_id_users_id_fk" FOREIGN KEY ("chief_pharmacist_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opening_inventory_snapshots" ADD CONSTRAINT "opening_inv_source_year_end_fk" FOREIGN KEY ("tenant_id","store_id","source_year_end_snapshot_id") REFERENCES "public"."year_end_stock_snapshots"("tenant_id","store_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "batches_store_med_active_idx" ON "batches" USING btree ("store_id","medicine_id","expiry_date","id") WHERE "batches"."qty_on_hand" > 0;--> statement-breakpoint
CREATE INDEX "stock_mov_tenant_store_effective_idx" ON "stock_movements" USING btree ("tenant_id","store_id","effective_at");--> statement-breakpoint
CREATE INDEX "stock_mov_tenant_store_batch_effective_idx" ON "stock_movements" USING btree ("tenant_id","store_id","batch_id","effective_at");--> statement-breakpoint
CREATE INDEX "sale_items_tenant_med_sale_idx" ON "sale_items" USING btree ("tenant_id","medicine_id","sale_id");--> statement-breakpoint
CREATE INDEX "sales_tenant_store_status_created_idx" ON "sales" USING btree ("tenant_id","store_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "opening_inv_source_year_end_uq" ON "opening_inventory_snapshots" USING btree ("tenant_id","store_id","source_year_end_snapshot_id");--> statement-breakpoint
ALTER TABLE "medicines" DROP COLUMN "rack_id";