-- Migration 0026: Opening Balances, Inventory Snapshots & Database Double-Entry Enforcement
-- 1. Ensure composite unique constraints exist on stores, journal_entries, batches, stock_movements
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
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'batches_tenant_store_id_uq') THEN
    ALTER TABLE "batches" ADD CONSTRAINT "batches_tenant_store_id_uq" UNIQUE ("tenant_id", "store_id", "id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_movements_tenant_store_id_uq') THEN
    ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tenant_store_id_uq" UNIQUE ("tenant_id", "store_id", "id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_lines_tenant_entry_fk') THEN
    ALTER TABLE "journal_lines" 
      ADD CONSTRAINT "journal_lines_tenant_entry_fk" 
      FOREIGN KEY ("tenant_id", "entry_id") REFERENCES "journal_entries"("tenant_id", "id") ON DELETE CASCADE;
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

-- 3. Opening Inventory Snapshot & Items with Composite Referential Integrity
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
  CONSTRAINT "opening_inv_snapshots_tenant_store_id_uq"
    UNIQUE ("tenant_id", "store_id", "id"),
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
  "snapshot_id" uuid NOT NULL,
  "stock_movement_id" bigint NOT NULL,
  "batch_id" uuid NOT NULL,
  "store_id" uuid NOT NULL,
  "qty" integer NOT NULL,
  "unit_cost_paise" bigint NOT NULL,
  "line_total_paise" bigint NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "opening_inv_items_tenant_store_fk" 
    FOREIGN KEY ("tenant_id", "store_id") REFERENCES "stores"("tenant_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "opening_inv_items_snapshot_fk"
    FOREIGN KEY ("tenant_id", "store_id", "snapshot_id") REFERENCES "opening_inventory_snapshots"("tenant_id", "store_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "opening_inv_items_movement_fk"
    FOREIGN KEY ("tenant_id", "store_id", "stock_movement_id") REFERENCES "stock_movements"("tenant_id", "store_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "opening_inv_items_batch_fk"
    FOREIGN KEY ("tenant_id", "store_id", "batch_id") REFERENCES "batches"("tenant_id", "store_id", "id") ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS "opening_inv_items_snapshot_movement_uq" 
  ON "opening_inventory_items" ("snapshot_id", "stock_movement_id");
CREATE UNIQUE INDEX IF NOT EXISTS "opening_inv_items_movement_uq" 
  ON "opening_inventory_items" ("stock_movement_id");

-- 4. Database Constraint Trigger for Double-Entry Lines Enforcement
CREATE OR REPLACE FUNCTION fn_validate_journal_double_entry()
RETURNS TRIGGER AS $$
DECLARE
  v_entry_id uuid;
  v_count integer;
  v_debit_sum numeric;
  v_credit_sum numeric;
  v_invalid_lines integer;
  v_tenant_id uuid;
  v_cross_tenant integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_entry_id := OLD.entry_id;
    v_tenant_id := OLD.tenant_id;
  ELSE
    v_entry_id := NEW.entry_id;
    v_tenant_id := NEW.tenant_id;
  END IF;

  IF EXISTS (SELECT 1 FROM journal_entries WHERE id = v_entry_id) THEN
    SELECT 
      COUNT(*),
      COALESCE(SUM(debit::numeric), 0),
      COALESCE(SUM(credit::numeric), 0),
      COUNT(*) FILTER (WHERE debit < 0 OR credit < 0 OR (debit = 0 AND credit = 0) OR (debit > 0 AND credit > 0)),
      COUNT(*) FILTER (WHERE tenant_id <> v_tenant_id)
    INTO v_count, v_debit_sum, v_credit_sum, v_invalid_lines, v_cross_tenant
    FROM journal_lines
    WHERE entry_id = v_entry_id;

    IF v_count < 2 THEN
      RAISE EXCEPTION 'Journal entry % must have at least 2 lines (found %)', v_entry_id, v_count;
    END IF;

    IF v_invalid_lines > 0 THEN
      RAISE EXCEPTION 'Journal entry % contains invalid lines', v_entry_id;
    END IF;

    IF v_cross_tenant > 0 THEN
      RAISE EXCEPTION 'Journal entry % has lines from another tenant', v_entry_id;
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
        COUNT(*) FILTER (WHERE debit < 0 OR credit < 0 OR (debit = 0 AND credit = 0) OR (debit > 0 AND credit > 0)),
        COUNT(*) FILTER (WHERE tenant_id <> OLD.tenant_id)
      INTO v_count, v_debit_sum, v_credit_sum, v_invalid_lines, v_cross_tenant
      FROM journal_lines
      WHERE entry_id = OLD.entry_id;

      IF v_count < 2 OR v_invalid_lines > 0 OR v_cross_tenant > 0 OR v_debit_sum <> v_credit_sum THEN
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

-- 5. Deferred Guard on Journal Header to Ensure Every Committed Header Has Valid Balanced Lines
CREATE OR REPLACE FUNCTION fn_validate_journal_entry_header()
RETURNS TRIGGER AS $$
DECLARE
  v_count integer;
  v_debit_sum numeric;
  v_credit_sum numeric;
  v_cross_tenant integer;
BEGIN
  IF EXISTS (SELECT 1 FROM journal_entries WHERE id = NEW.id) THEN
    SELECT 
      COUNT(*),
      COALESCE(SUM(debit::numeric), 0),
      COALESCE(SUM(credit::numeric), 0),
      COUNT(*) FILTER (WHERE tenant_id <> NEW.tenant_id)
    INTO v_count, v_debit_sum, v_credit_sum, v_cross_tenant
    FROM journal_lines
    WHERE entry_id = NEW.id;

    IF v_count < 2 THEN
      RAISE EXCEPTION 'Committed journal entry % must have at least 2 lines (found %)', NEW.id, v_count;
    END IF;

    IF v_cross_tenant > 0 THEN
      RAISE EXCEPTION 'Committed journal entry % has lines from another tenant', NEW.id;
    END IF;

    IF v_debit_sum <> v_credit_sum THEN
      RAISE EXCEPTION 'Committed journal entry % is unbalanced: debits=% credits=%', NEW.id, v_debit_sum, v_credit_sum;
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_journal_entry_header ON journal_entries;
CREATE CONSTRAINT TRIGGER trg_validate_journal_entry_header
AFTER INSERT OR UPDATE ON journal_entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION fn_validate_journal_entry_header();

-- 6. Immutability Triggers for Opening Inventory Snapshots & Items
CREATE OR REPLACE FUNCTION fn_protect_opening_inventory_snapshot_immutability()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'posted' THEN
      RAISE EXCEPTION 'Cannot delete posted inventory snapshot %', OLD.id;
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'posted' AND (
      OLD.as_of_date <> NEW.as_of_date OR
      OLD.total_value_paise <> NEW.total_value_paise OR
      OLD.store_id <> NEW.store_id OR
      OLD.tenant_id <> NEW.tenant_id OR
      OLD.journal_entry_id IS DISTINCT FROM NEW.journal_entry_id
    ) THEN
      RAISE EXCEPTION 'Cannot modify posted inventory snapshot %', OLD.id;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_opening_inventory_snapshots ON opening_inventory_snapshots;
CREATE TRIGGER trg_protect_opening_inventory_snapshots
BEFORE UPDATE OR DELETE ON opening_inventory_snapshots
FOR EACH ROW EXECUTE FUNCTION fn_protect_opening_inventory_snapshot_immutability();

CREATE OR REPLACE FUNCTION fn_protect_opening_inventory_items_immutability()
RETURNS TRIGGER AS $$
DECLARE
  v_status text;
  v_snap_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_snap_id := OLD.snapshot_id;
  ELSE
    v_snap_id := NEW.snapshot_id;
  END IF;

  SELECT status INTO v_status FROM opening_inventory_snapshots WHERE id = v_snap_id;
  IF v_status = 'posted' THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'Cannot add items to posted inventory snapshot %', v_snap_id;
    ELSIF TG_OP = 'UPDATE' THEN
      RAISE EXCEPTION 'Cannot modify items of posted inventory snapshot %', v_snap_id;
    ELSIF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Cannot delete items of posted inventory snapshot %', v_snap_id;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_opening_inventory_items ON opening_inventory_items;
CREATE TRIGGER trg_protect_opening_inventory_items
BEFORE INSERT OR UPDATE OR DELETE ON opening_inventory_items
FOR EACH ROW EXECUTE FUNCTION fn_protect_opening_inventory_items_immutability();
