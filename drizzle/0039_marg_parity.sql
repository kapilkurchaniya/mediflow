-- Migration 0039: Marg ERP Parity (Stages 1-3 + Final Plan)
ALTER TABLE "sale_items" ADD COLUMN IF NOT EXISTS "free_qty" integer DEFAULT 0 NOT NULL;
ALTER TABLE "sale_items" ADD COLUMN IF NOT EXISTS "scheme_id" uuid;

ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "drug_license_no" text;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "drug_license_expiry" date;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "default_discount_bp" integer DEFAULT 0 NOT NULL;

CREATE TABLE IF NOT EXISTS "supplier_item_map" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "supplier_id" uuid,
  "external_item_code" text,
  "external_item_name" text NOT NULL,
  "normalized_name" text NOT NULL,
  "medicine_id" uuid NOT NULL REFERENCES "medicines"("id") ON DELETE CASCADE,
  "last_purchase_rate" integer DEFAULT 0 NOT NULL,
  "use_count" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "supplier_item_map_uq" ON "supplier_item_map" ("tenant_id", "supplier_id", "normalized_name");
CREATE INDEX IF NOT EXISTS "supplier_item_map_med_idx" ON "supplier_item_map" ("tenant_id", "medicine_id");

CREATE TABLE IF NOT EXISTS "pdc_cheques" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "store_id" uuid NOT NULL REFERENCES "stores"("id") ON DELETE CASCADE,
  "direction" text NOT NULL,
  "party_type" text NOT NULL,
  "party_id" uuid,
  "party_name" text NOT NULL,
  "cheque_no" text NOT NULL,
  "cheque_date" date NOT NULL,
  "bank_name" text NOT NULL,
  "amount" integer NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "pay_in_slip_no" text,
  "deposited_at" date,
  "cleared_at" date,
  "dishonour_reason" text,
  "journal_entry_id" uuid REFERENCES "journal_entries"("id"),
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "pdc_cheques_tenant_status_idx" ON "pdc_cheques" ("tenant_id", "status", "cheque_date");
CREATE INDEX IF NOT EXISTS "pdc_cheques_tenant_store_idx" ON "pdc_cheques" ("tenant_id", "store_id");

CREATE TABLE IF NOT EXISTS "drug_master" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "brand_name" text NOT NULL,
  "generic_name" text NOT NULL,
  "manufacturer" text,
  "hsn" text DEFAULT '30049099' NOT NULL,
  "gst_rate_bp" integer DEFAULT 1200 NOT NULL,
  "schedule" text DEFAULT 'none' NOT NULL,
  "pack_size" text,
  "mrp_paise" bigint,
  "is_banned_fdc" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "drug_master_brand_idx" ON "drug_master" ("brand_name");
CREATE INDEX IF NOT EXISTS "drug_master_generic_idx" ON "drug_master" ("generic_name");

CREATE TABLE IF NOT EXISTS "tds_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "store_id" uuid NOT NULL REFERENCES "stores"("id") ON DELETE CASCADE,
  "section" text NOT NULL,
  "party_name" text NOT NULL,
  "party_pan" text,
  "entry_date" date NOT NULL,
  "base_amount" integer NOT NULL,
  "rate_bp" integer NOT NULL,
  "tds_amount" integer NOT NULL,
  "net_payable" integer NOT NULL,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "tds_entries_tenant_date_idx" ON "tds_entries" ("tenant_id", "entry_date");

CREATE TABLE IF NOT EXISTS "wholesale_challans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "store_id" uuid NOT NULL REFERENCES "stores"("id") ON DELETE CASCADE,
  "challan_no" text NOT NULL,
  "challan_date" date NOT NULL,
  "buyer_name" text NOT NULL,
  "buyer_gstin" text,
  "route_name" text,
  "salesman_name" text,
  "lr_no" text,
  "taxable_amount" integer NOT NULL,
  "gst_amount" integer NOT NULL,
  "grand_total" integer NOT NULL,
  "requires_eway_bill" boolean DEFAULT false NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "wholesale_challans_tenant_idx" ON "wholesale_challans" ("tenant_id", "challan_date");
