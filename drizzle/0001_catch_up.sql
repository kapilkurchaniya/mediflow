CREATE TABLE "bank_statement_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"statement_id" uuid NOT NULL,
	"transaction_date" date NOT NULL,
	"description" text NOT NULL,
	"reference" text,
	"debit" bigint DEFAULT 0 NOT NULL,
	"credit" bigint DEFAULT 0 NOT NULL,
	"balance" bigint DEFAULT 0 NOT NULL,
	"matched_payment_id" uuid,
	"match_status" text DEFAULT 'unmatched' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_statements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"store_id" uuid,
	"bank_name" text NOT NULL,
	"account_no" text NOT NULL,
	"statement_date" date NOT NULL,
	"upload_file_name" text,
	"status" text DEFAULT 'completed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"primary_customer_id" uuid,
	"credit_limit" bigint DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dispensing_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"sale_id" uuid NOT NULL,
	"sale_item_id" uuid NOT NULL,
	"medicine_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"medicine_name" text NOT NULL,
	"batch_no" text NOT NULL,
	"expiry_date" date NOT NULL,
	"manufacturer_name" text,
	"schedule" text NOT NULL,
	"patient_name" text NOT NULL,
	"patient_age" integer,
	"patient_gender" text,
	"patient_address" text,
	"patient_phone" text,
	"doctor_name" text NOT NULL,
	"doctor_reg_no" text,
	"doctor_address" text,
	"prescription_ref" text,
	"prescription_date" date,
	"quantity_dispensed" integer NOT NULL,
	"pharmacist_id" uuid,
	"pharmacist_name" text,
	"pharmacist_reg_no" text,
	"statutory_register" text NOT NULL,
	"dispensed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doctors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"reg_no" text NOT NULL,
	"qualification" text,
	"specialization" text,
	"hospital" text,
	"phone" text,
	"email" text,
	"address" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "e_invoice_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"gst_document_id" uuid NOT NULL,
	"action" text NOT NULL,
	"request_payload" jsonb,
	"response_payload" jsonb,
	"status" text NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"store_id" uuid,
	"source" text DEFAULT 'whatsapp' NOT NULL,
	"order_no" text NOT NULL,
	"customer_id" uuid,
	"customer_name" text NOT NULL,
	"customer_phone" text NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"items" jsonb NOT NULL,
	"total_amount" bigint DEFAULT 0 NOT NULL,
	"notes" text,
	"sale_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gst_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"doc_type" text NOT NULL,
	"doc_no" text NOT NULL,
	"doc_date" date NOT NULL,
	"party_gstin" text,
	"party_name" text,
	"party_state_code" text,
	"place_of_supply" text,
	"supply_type" text DEFAULT 'B2C' NOT NULL,
	"is_reverse_charge" boolean DEFAULT false NOT NULL,
	"taxable_amount" bigint DEFAULT 0 NOT NULL,
	"cgst" bigint DEFAULT 0 NOT NULL,
	"sgst" bigint DEFAULT 0 NOT NULL,
	"igst" bigint DEFAULT 0 NOT NULL,
	"cess" bigint DEFAULT 0 NOT NULL,
	"total" bigint DEFAULT 0 NOT NULL,
	"ref_type" text,
	"ref_id" uuid,
	"irn" text,
	"irn_date" timestamp with time zone,
	"ack_no" text,
	"ack_date" timestamp with time zone,
	"signed_qr_code" text,
	"e_way_bill_no" text,
	"e_way_bill_date" timestamp with time zone,
	"e_way_bill_valid_till" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loyalty_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"points_per_rupee" integer DEFAULT 1 NOT NULL,
	"redemption_value_paise" integer DEFAULT 100 NOT NULL,
	"min_redemption_points" integer DEFAULT 10 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loyalty_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"type" text NOT NULL,
	"points" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"sale_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medical_reps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"company_name" text,
	"commission_rate_bp" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prescription_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"prescription_id" uuid NOT NULL,
	"medicine_id" uuid,
	"medicine_name" text NOT NULL,
	"dosage" text,
	"frequency" text,
	"duration_days" integer,
	"quantity_prescribed" integer NOT NULL,
	"quantity_dispensed" integer DEFAULT 0 NOT NULL,
	"instructions" text
);
--> statement-breakpoint
CREATE TABLE "prescriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"customer_id" uuid,
	"patient_name" text NOT NULL,
	"patient_age" integer,
	"patient_gender" text,
	"patient_phone" text,
	"patient_address" text,
	"doctor_id" uuid,
	"doctor_name" text NOT NULL,
	"doctor_reg_no" text,
	"doctor_address" text,
	"rx_number" text,
	"prescription_date" date NOT NULL,
	"diagnosis" text,
	"notes" text,
	"image_url" text,
	"status" text DEFAULT 'active' NOT NULL,
	"valid_until" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promise_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"customer_id" uuid,
	"customer_name" text NOT NULL,
	"customer_phone" text NOT NULL,
	"medicine_id" uuid,
	"medicine_name" text NOT NULL,
	"qty_requested" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"sale_id" uuid,
	"purchase_order_id" uuid,
	"notes" text,
	"promised_date" date,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "racks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"store_id" uuid,
	"customer_id" uuid,
	"customer_name" text,
	"customer_phone" text NOT NULL,
	"type" text DEFAULT 'refill' NOT NULL,
	"medicine_id" uuid,
	"scheduled_date" date NOT NULL,
	"message" text NOT NULL,
	"channel" text DEFAULT 'both' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schemes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"store_id" uuid,
	"name" text NOT NULL,
	"scheme_type" text NOT NULL,
	"supplier_id" uuid,
	"medicine_id" uuid,
	"category_id" uuid,
	"buy_qty" integer DEFAULT 0 NOT NULL,
	"free_qty" integer DEFAULT 0 NOT NULL,
	"discount_bp" integer DEFAULT 0 NOT NULL,
	"flat_discount" bigint DEFAULT 0 NOT NULL,
	"min_qty" integer DEFAULT 1 NOT NULL,
	"valid_from" date,
	"valid_to" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sms_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider" text DEFAULT 'msg91' NOT NULL,
	"api_key" text,
	"sender_id" text,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"phone_number_id" text,
	"business_account_id" text,
	"access_token" text,
	"webhook_verify_token" text,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"store_id" uuid,
	"direction" text DEFAULT 'outbound' NOT NULL,
	"customer_id" uuid,
	"customer_phone" text NOT NULL,
	"template_id" uuid,
	"message_body" text NOT NULL,
	"message_type" text DEFAULT 'text' NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"meta_message_id" text,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT 'UTILITY' NOT NULL,
	"language_code" text DEFAULT 'en' NOT NULL,
	"header" text,
	"body" text NOT NULL,
	"footer" text,
	"variables" jsonb,
	"status" text DEFAULT 'approved' NOT NULL,
	"meta_template_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "group_id" uuid;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "loyalty_points" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "age" integer;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "gender" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "doctor_name" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "doctor_reg_no" text;--> statement-breakpoint
ALTER TABLE "medicines" ADD COLUMN "rack_id" uuid;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "medical_rep_id" uuid;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "doctor_reg_no" text;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "doctor_address" text;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "patient_age" integer;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "patient_gender" text;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "patient_address" text;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "prescription_id" uuid;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "pharmacist_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "pharmacist_reg_no" text;--> statement-breakpoint
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_statement_id_bank_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."bank_statements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_matched_payment_id_payments_id_fk" FOREIGN KEY ("matched_payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statements" ADD CONSTRAINT "bank_statements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statements" ADD CONSTRAINT "bank_statements_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_groups" ADD CONSTRAINT "customer_groups_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispensing_logs" ADD CONSTRAINT "dispensing_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispensing_logs" ADD CONSTRAINT "dispensing_logs_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispensing_logs" ADD CONSTRAINT "dispensing_logs_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispensing_logs" ADD CONSTRAINT "dispensing_logs_sale_item_id_sale_items_id_fk" FOREIGN KEY ("sale_item_id") REFERENCES "public"."sale_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispensing_logs" ADD CONSTRAINT "dispensing_logs_medicine_id_medicines_id_fk" FOREIGN KEY ("medicine_id") REFERENCES "public"."medicines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispensing_logs" ADD CONSTRAINT "dispensing_logs_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispensing_logs" ADD CONSTRAINT "dispensing_logs_pharmacist_id_users_id_fk" FOREIGN KEY ("pharmacist_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctors" ADD CONSTRAINT "doctors_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "e_invoice_logs" ADD CONSTRAINT "e_invoice_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "e_invoice_logs" ADD CONSTRAINT "e_invoice_logs_gst_document_id_gst_documents_id_fk" FOREIGN KEY ("gst_document_id") REFERENCES "public"."gst_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_orders" ADD CONSTRAINT "external_orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_orders" ADD CONSTRAINT "external_orders_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_orders" ADD CONSTRAINT "external_orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_orders" ADD CONSTRAINT "external_orders_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gst_documents" ADD CONSTRAINT "gst_documents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gst_documents" ADD CONSTRAINT "gst_documents_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_configs" ADD CONSTRAINT "loyalty_configs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_reps" ADD CONSTRAINT "medical_reps_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescription_items" ADD CONSTRAINT "prescription_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescription_items" ADD CONSTRAINT "prescription_items_prescription_id_prescriptions_id_fk" FOREIGN KEY ("prescription_id") REFERENCES "public"."prescriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescription_items" ADD CONSTRAINT "prescription_items_medicine_id_medicines_id_fk" FOREIGN KEY ("medicine_id") REFERENCES "public"."medicines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_doctor_id_doctors_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promise_orders" ADD CONSTRAINT "promise_orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promise_orders" ADD CONSTRAINT "promise_orders_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promise_orders" ADD CONSTRAINT "promise_orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promise_orders" ADD CONSTRAINT "promise_orders_medicine_id_medicines_id_fk" FOREIGN KEY ("medicine_id") REFERENCES "public"."medicines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promise_orders" ADD CONSTRAINT "promise_orders_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promise_orders" ADD CONSTRAINT "promise_orders_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "racks" ADD CONSTRAINT "racks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "racks" ADD CONSTRAINT "racks_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_medicine_id_medicines_id_fk" FOREIGN KEY ("medicine_id") REFERENCES "public"."medicines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schemes" ADD CONSTRAINT "schemes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schemes" ADD CONSTRAINT "schemes_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schemes" ADD CONSTRAINT "schemes_medicine_id_medicines_id_fk" FOREIGN KEY ("medicine_id") REFERENCES "public"."medicines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schemes" ADD CONSTRAINT "schemes_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_configs" ADD CONSTRAINT "sms_configs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_configs" ADD CONSTRAINT "whatsapp_configs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_template_id_whatsapp_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."whatsapp_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_templates" ADD CONSTRAINT "whatsapp_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bank_lines_statement_idx" ON "bank_statement_lines" USING btree ("statement_id");--> statement-breakpoint
CREATE INDEX "bank_lines_match_idx" ON "bank_statement_lines" USING btree ("match_status");--> statement-breakpoint
CREATE INDEX "customer_groups_tenant_idx" ON "customer_groups" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "dispensing_logs_reg_idx" ON "dispensing_logs" USING btree ("store_id","statutory_register","dispensed_at");--> statement-breakpoint
CREATE INDEX "dispensing_logs_med_idx" ON "dispensing_logs" USING btree ("medicine_id","dispensed_at");--> statement-breakpoint
CREATE INDEX "dispensing_logs_sale_idx" ON "dispensing_logs" USING btree ("sale_id");--> statement-breakpoint
CREATE UNIQUE INDEX "doctors_tenant_reg_uq" ON "doctors" USING btree ("tenant_id",lower("reg_no"));--> statement-breakpoint
CREATE INDEX "doctors_tenant_name_idx" ON "doctors" USING btree ("tenant_id",lower("name"));--> statement-breakpoint
CREATE INDEX "e_inv_logs_doc_idx" ON "e_invoice_logs" USING btree ("gst_document_id");--> statement-breakpoint
CREATE INDEX "ext_orders_tenant_status_idx" ON "external_orders" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "ext_orders_customer_phone_idx" ON "external_orders" USING btree ("tenant_id","customer_phone");--> statement-breakpoint
CREATE INDEX "gst_docs_tenant_date_idx" ON "gst_documents" USING btree ("tenant_id","doc_date");--> statement-breakpoint
CREATE INDEX "gst_docs_store_idx" ON "gst_documents" USING btree ("store_id","doc_type");--> statement-breakpoint
CREATE INDEX "gst_docs_party_gstin_idx" ON "gst_documents" USING btree ("party_gstin");--> statement-breakpoint
CREATE INDEX "gst_docs_irn_idx" ON "gst_documents" USING btree ("irn");--> statement-breakpoint
CREATE INDEX "gst_docs_ref_idx" ON "gst_documents" USING btree ("ref_type","ref_id");--> statement-breakpoint
CREATE INDEX "loyalty_tx_customer_idx" ON "loyalty_transactions" USING btree ("customer_id","created_at");--> statement-breakpoint
CREATE INDEX "loyalty_tx_tenant_idx" ON "loyalty_transactions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "medical_reps_tenant_idx" ON "medical_reps" USING btree ("tenant_id","is_active");--> statement-breakpoint
CREATE INDEX "prescription_items_rx_idx" ON "prescription_items" USING btree ("prescription_id");--> statement-breakpoint
CREATE INDEX "prescriptions_store_idx" ON "prescriptions" USING btree ("store_id","prescription_date");--> statement-breakpoint
CREATE INDEX "prescriptions_customer_idx" ON "prescriptions" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "promise_orders_tenant_status_idx" ON "promise_orders" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "promise_orders_store_idx" ON "promise_orders" USING btree ("store_id","status");--> statement-breakpoint
CREATE INDEX "promise_orders_medicine_idx" ON "promise_orders" USING btree ("medicine_id");--> statement-breakpoint
CREATE UNIQUE INDEX "racks_store_code_uq" ON "racks" USING btree ("store_id",lower("code"));--> statement-breakpoint
CREATE INDEX "racks_tenant_store_idx" ON "racks" USING btree ("tenant_id","store_id");--> statement-breakpoint
CREATE INDEX "reminders_tenant_date_idx" ON "reminders" USING btree ("tenant_id","scheduled_date","status");--> statement-breakpoint
CREATE INDEX "reminders_customer_idx" ON "reminders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "schemes_tenant_idx" ON "schemes" USING btree ("tenant_id","is_active");--> statement-breakpoint
CREATE INDEX "schemes_medicine_idx" ON "schemes" USING btree ("medicine_id");--> statement-breakpoint
CREATE INDEX "schemes_supplier_idx" ON "schemes" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "wa_messages_tenant_phone_idx" ON "whatsapp_messages" USING btree ("tenant_id","customer_phone");--> statement-breakpoint
CREATE INDEX "wa_messages_customer_idx" ON "whatsapp_messages" USING btree ("customer_id");--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_group_id_customer_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."customer_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medicines" ADD CONSTRAINT "medicines_rack_id_racks_id_fk" FOREIGN KEY ("rack_id") REFERENCES "public"."racks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_medical_rep_id_medical_reps_id_fk" FOREIGN KEY ("medical_rep_id") REFERENCES "public"."medical_reps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_prescription_id_prescriptions_id_fk" FOREIGN KEY ("prescription_id") REFERENCES "public"."prescriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_pharmacist_id_users_id_fk" FOREIGN KEY ("pharmacist_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customers_group_idx" ON "customers" USING btree ("group_id");