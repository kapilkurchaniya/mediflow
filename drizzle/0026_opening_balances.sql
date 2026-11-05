-- Migration 0026: Opening Balances, Inventory Snapshots & Database Double-Entry Enforcement
-- 1. Ensure composite unique constraints exist on stores and journal_entries
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stores_tenant_id_uq') THEN
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'stores_tenant_id_uq') THEN
      ALTER TABLE "stores" ADD CONSTRAINT "stores_tenant_id_uq" UNIQUE USING INDEX "stores_tenant_id_uq";
    ELSE
      ALTER TABLE "stores" ADD CONSTRAINT "stores_tenant_id_uq" UNIQUE ("tenant_id", "id");
    END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_entries_tenant_id_uq') THEN
    ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_tenant_id_uq" UNIQUE ("tenant_id", "id");
  END IF;
END $$;

-- 2. Opening Balance Records for Parties and Accounts
CREATE TABLE IF NOT EXISTS "opening_balance_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "store_id" uuid REFERENCES "stores"("id") ON DELETE RESTRICT,
  "entity_type" text NOT NULL, -- 'customer' | 'supplier' | 'inventory_snapshot' | 'account'
  "entity_id" uuid NOT NULL,
  "as_of_date" date NOT NULL,
  "amount_paise" bigint NOT NULL DEFAULT 0,
  "journal_entry_id" uuid NOT NULL,
  "payload_hash" text NOT NULL,
  "status" text NOT NULL DEFAULT 'posted', -- 'posted' | 'reversed'
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "opening_balances_tenant_store_fk" 
    FOREIGN KEY ("tenant_id", "store_id") REFERENCES "stores"("tenant_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "opening_balances_tenant_journal_fk" 
    FOREIGN KEY ("tenant_id", "journal_entry_id") REFERENCES "journal_entries"("tenant_id", "id") ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS "opening_balances_tenant_entity_date_uq" 
  ON "opening_balance_records" ("tenant_id", "entity_type", "entity_id", "as_of_date");
CREATE UNIQUE INDEX IF NOT EXISTS "opening_balances_tenant_journal_uq" 
  ON "opening_balance_records" ("tenant_id", "journal_entry_id");

-- 3. Opening Inventory Snapshot & Items
CREATE TABLE IF NOT EXISTS "opening_inventory_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "store_id" uuid NOT NULL,
  "as_of_date" date NOT NULL,
  "total_value_paise" bigint NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'captured', -- 'captured' | 'posted'
  "journal_entry_id" uuid,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "opening_inv_snapshots_tenant_store_fk" 
    FOREIGN KEY ("tenant_id", "store_id") REFERENCES "stores"("tenant_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "opening_inv_snapshots_tenant_journal_fk" 
    FOREIGN KEY ("tenant_id", "journal_entry_id") REFERENCES "journal_entries"("tenant_id", "id") ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS "opening_inventory_snapshots_store_date_uq"
  ON "opening_inventory_snapshots" ("tenant_id", "store_id", "as_of_date");
CREATE UNIQUE INDEX IF NOT EXISTS "opening_inventory_snapshots_tenant_journal_uq"
  ON "opening_inventory_snapshots" ("tenant_id", "journal_entry_id") WHERE "journal_entry_id" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "opening_inventory_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "snapshot_id" uuid NOT NULL REFERENCES "opening_inventory_snapshots"("id") ON DELETE CASCADE,
  "stock_movement_id" bigint NOT NULL REFERENCES "stock_movements"("id") ON DELETE RESTRICT,
  "batch_id" uuid NOT NULL REFERENCES "batches"("id") ON DELETE RESTRICT,
  "store_id" uuid NOT NULL,
  "qty" integer NOT NULL,
  "unit_cost_paise" bigint NOT NULL,
  "line_total_paise" bigint NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "opening_inv_items_tenant_store_fk" 
    FOREIGN KEY ("tenant_id", "store_id") REFERENCES "stores"("tenant_id", "id") ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS "opening_inv_items_snapshot_movement_uq" 
  ON "opening_inventory_items" ("snapshot_id", "stock_movement_id");
CREATE UNIQUE INDEX IF NOT EXISTS "opening_inv_items_movement_uq" 
  ON "opening_inventory_items" ("stock_movement_id");

-- 4. Database Constraint Trigger for Double-Entry Enforcement
CREATE OR REPLACE FUNCTION fn_validate_journal_double_entry()
RETURNS TRIGGER AS $$
DECLARE
  v_entry_id uuid;
  v_count integer;
  v_debit_sum numeric;
  v_credit_sum numeric;
  v_invalid_lines integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_entry_id := OLD.entry_id;
  ELSE
    v_entry_id := NEW.entry_id;
  END IF;

  IF EXISTS (SELECT 1 FROM journal_entries WHERE id = v_entry_id) THEN
    SELECT 
      COUNT(*),
      COALESCE(SUM(debit::numeric), 0),
      COALESCE(SUM(credit::numeric), 0),
      COUNT(*) FILTER (WHERE debit < 0 OR credit < 0 OR (debit = 0 AND credit = 0) OR (debit > 0 AND credit > 0))
    INTO v_count, v_debit_sum, v_credit_sum, v_invalid_lines
    FROM journal_lines
    WHERE entry_id = v_entry_id;

    IF v_count < 2 THEN
      RAISE EXCEPTION 'Journal entry % must have at least 2 lines (found %)', v_entry_id, v_count;
    END IF;

    IF v_invalid_lines > 0 THEN
      RAISE EXCEPTION 'Journal entry % contains invalid lines', v_entry_id;
    END IF;

    IF v_debit_sum <> v_credit_sum THEN
      RAISE EXCEPTION 'Journal entry % is unbalanced: debits=% credits=%', v_entry_id, v_debit_sum, v_credit_sum;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.entry_id IS DISTINCT FROM NEW.entry_id THEN
    IF EXISTS (SELECT 1 FROM journal_entries WHERE id = OLD.entry_id) THEN
      SELECT 
        COUNT(*),
        COALESCE(SUM(debit::numeric), 0),
        COALESCE(SUM(credit::numeric), 0),
        COUNT(*) FILTER (WHERE debit < 0 OR credit < 0 OR (debit = 0 AND credit = 0) OR (debit > 0 AND credit > 0))
      INTO v_count, v_debit_sum, v_credit_sum, v_invalid_lines
      FROM journal_lines
      WHERE entry_id = OLD.entry_id;

      IF v_count < 2 OR v_invalid_lines > 0 OR v_debit_sum <> v_credit_sum THEN
        RAISE EXCEPTION 'Source journal entry % is unbalanced after moving line', OLD.entry_id;
      END IF;
    END IF;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_journal_lines_double_entry ON journal_lines;
CREATE CONSTRAINT TRIGGER trg_validate_journal_lines_double_entry
AFTER INSERT OR UPDATE OR DELETE ON journal_lines
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION fn_validate_journal_double_entry();

