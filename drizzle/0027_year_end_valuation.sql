-- Task A5.6: Year-End Rollover & Closing-Stock Valuation Report (Migration 0027)
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'mediflow_year_end_owner') THEN CREATE ROLE mediflow_year_end_owner WITH NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated WITH NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT; END IF;
END $$;

-- 1. Safe 4-Step effective_at Ledger Migration & Strictly Append-Only Trigger
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS effective_at TIMESTAMPTZ;
UPDATE stock_movements SET effective_at = created_at WHERE effective_at IS NULL;
ALTER TABLE stock_movements ALTER COLUMN effective_at SET DEFAULT now(), ALTER COLUMN effective_at SET NOT NULL;
CREATE INDEX IF NOT EXISTS stock_mov_tenant_store_effective_idx ON stock_movements(tenant_id, store_id, effective_at);

CREATE OR REPLACE FUNCTION fn_protect_stock_movements_immutability() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    RAISE EXCEPTION 'Stock movements are strictly append-only; % prohibited', TG_OP USING ERRCODE = 'P0001';
  END IF;
  RETURN NULL;
END; $$ LANGUAGE plpgsql SET search_path = pg_catalog;

DROP TRIGGER IF EXISTS trg_protect_stock_movements_immutability ON stock_movements;
CREATE TRIGGER trg_protect_stock_movements_immutability BEFORE UPDATE OR DELETE ON stock_movements FOR EACH ROW EXECUTE FUNCTION fn_protect_stock_movements_immutability();

-- 2. Period Controls with Invariant Cutoff/FY Pairing & Shared Serialization
CREATE TABLE IF NOT EXISTS year_end_period_controls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  store_id UUID NOT NULL,
  fiscal_year TEXT NOT NULL,
  cutoff_date TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  finalized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_period_ctrl_status CHECK (status IN ('open', 'finalized')),
  CONSTRAINT chk_period_ctrl_integrity CHECK (((status = 'open' AND finalized_at IS NULL) OR (status = 'finalized' AND finalized_at IS NOT NULL)) AND fiscal_year ~ '^[0-9]{4}-[0-9]{4}$'),
  CONSTRAINT chk_period_ctrl_cutoff_fy CHECK ((cutoff_date AT TIME ZONE 'Asia/Kolkata')::date = ((substring(fiscal_year, 6, 4)::int || '-03-31')::date) AND (substring(fiscal_year, 1, 4)::int + 1) = substring(fiscal_year, 6, 4)::int),
  CONSTRAINT period_controls_tenant_store_fy_uq UNIQUE (tenant_id, store_id, fiscal_year),
  CONSTRAINT period_controls_store_fk FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE RESTRICT
);

CREATE OR REPLACE FUNCTION fn_serialize_stock_movement_period() RETURNS TRIGGER AS $$
DECLARE
  v_ctrl_status TEXT; v_eff_date DATE; v_year INT; v_month INT; v_fy TEXT;
BEGIN
  v_eff_date := (NEW.effective_at AT TIME ZONE 'Asia/Kolkata')::date;
  v_year := EXTRACT(YEAR FROM v_eff_date);
  v_month := EXTRACT(MONTH FROM v_eff_date);
  v_fy := CASE WHEN v_month >= 4 THEN v_year || '-' || (v_year + 1) ELSE (v_year - 1) || '-' || v_year END;
  SELECT status INTO v_ctrl_status FROM public.year_end_period_controls
  WHERE tenant_id = NEW.tenant_id AND store_id = NEW.store_id AND fiscal_year = v_fy FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Missing period control for FY %; movements fail closed', v_fy USING ERRCODE = 'P0001';
  END IF;
  IF v_ctrl_status = 'finalized' THEN
    RAISE EXCEPTION 'Cannot backdate movement into finalized period FY %', v_fy USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql SET search_path = pg_catalog;

DROP TRIGGER IF EXISTS trg_serialize_stock_movement_period ON stock_movements;
CREATE TRIGGER trg_serialize_stock_movement_period
  BEFORE INSERT ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION fn_serialize_stock_movement_period();

CREATE OR REPLACE FUNCTION fn_protect_period_controls() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'finalized' THEN RAISE EXCEPTION 'Cannot modify finalized period control' USING ERRCODE = 'P0001'; END IF;
    IF NEW.cutoff_date <> OLD.cutoff_date OR NEW.fiscal_year <> OLD.fiscal_year THEN RAISE EXCEPTION 'Cannot modify fiscal year or cutoff date' USING ERRCODE = 'P0001'; END IF;
    IF NEW.status = 'finalized' AND current_user <> 'mediflow_year_end_owner' THEN RAISE EXCEPTION 'Direct update to finalized prohibited' USING ERRCODE = '42501'; END IF;
  ELSIF TG_OP = 'DELETE' AND OLD.status = 'finalized' THEN
    RAISE EXCEPTION 'Cannot delete finalized period control' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql SET search_path = pg_catalog;

DROP TRIGGER IF EXISTS trg_protect_period_controls ON year_end_period_controls;
CREATE TRIGGER trg_protect_period_controls
  BEFORE UPDATE OR DELETE ON year_end_period_controls
  FOR EACH ROW EXECUTE FUNCTION fn_protect_period_controls();

-- 3. Snapshots Header Table with Rigid Cutoff Invariants & Aggregate Bounds
CREATE TABLE IF NOT EXISTS year_end_stock_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  store_id UUID NOT NULL,
  fiscal_year TEXT NOT NULL,
  cutoff_date TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  total_units BIGINT NOT NULL DEFAULT 0,
  gross_landed_cost_paise BIGINT NOT NULL DEFAULT 0,
  total_nrv_paise BIGINT NOT NULL DEFAULT 0,
  final_valuation_paise BIGINT NOT NULL DEFAULT 0,
  total_provision_paise BIGINT NOT NULL DEFAULT 0,
  valuation_policy_version TEXT NOT NULL DEFAULT 'ICDS_II_v1',
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_snapshot_status CHECK (status IN ('draft', 'finalized')),
  CONSTRAINT chk_snapshot_cutoff_fy CHECK ((cutoff_date AT TIME ZONE 'Asia/Kolkata')::date = ((substring(fiscal_year, 6, 4)::int || '-03-31')::date) AND (substring(fiscal_year, 1, 4)::int + 1) = substring(fiscal_year, 6, 4)::int),
  CONSTRAINT chk_snapshot_aggregates CHECK (total_units >= 0 AND total_units <= 1000000000 AND gross_landed_cost_paise >= 0 AND gross_landed_cost_paise <= 1000000000000000 AND total_nrv_paise >= 0 AND total_nrv_paise <= 1000000000000000 AND final_valuation_paise >= 0 AND final_valuation_paise <= 1000000000000000 AND total_provision_paise >= 0 AND total_provision_paise <= 1000000000000000),
  CONSTRAINT year_end_snapshots_tenant_store_fy_uq UNIQUE (tenant_id, store_id, fiscal_year), CONSTRAINT year_end_snapshots_tenant_store_id_uq UNIQUE (tenant_id, store_id, id),
  CONSTRAINT year_end_snapshots_store_fk FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE RESTRICT,
  CONSTRAINT year_end_snapshots_approved_fk FOREIGN KEY (approved_by) REFERENCES users(id)
);

-- 4. Line Items Table with Enforced Equations, Classification & Arithmetic Bounds
CREATE TABLE IF NOT EXISTS year_end_stock_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  store_id UUID NOT NULL,
  snapshot_id UUID NOT NULL,
  batch_id UUID NOT NULL,
  batch_number TEXT NOT NULL,
  expiry_date DATE NOT NULL,
  grn_number TEXT,
  supplier_name TEXT,
  canonical_unit TEXT NOT NULL DEFAULT 'unit',
  qty INTEGER NOT NULL,
  landed_cost_paise BIGINT NOT NULL DEFAULT 0,
  cost_value_paise BIGINT NOT NULL DEFAULT 0,
  estimated_nrv_paise BIGINT NOT NULL DEFAULT 0,
  nrv_paise BIGINT NOT NULL DEFAULT 0,
  nrv_basis TEXT NOT NULL DEFAULT 'sales_history_90d',
  nrv_source TEXT NOT NULL DEFAULT 'sales_ledger',
  evidence_ref TEXT,
  is_overridden BOOLEAN NOT NULL DEFAULT false,
  override_reason TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  final_valuation_paise BIGINT NOT NULL DEFAULT 0,
  provision_paise BIGINT NOT NULL DEFAULT 0,
  classification TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_qty_bounds CHECK (qty >= 0 AND qty <= 10000000),
  CONSTRAINT chk_cost_bounds CHECK (landed_cost_paise >= 0 AND landed_cost_paise <= 100000000000 AND cost_value_paise = (qty::numeric * landed_cost_paise::numeric)::bigint),
  CONSTRAINT chk_nrv_bounds CHECK (estimated_nrv_paise >= 0 AND estimated_nrv_paise <= 100000000000 AND nrv_paise >= 0 AND nrv_paise <= 100000000000),
  CONSTRAINT chk_val_bounds CHECK (final_valuation_paise = (qty::numeric * LEAST(landed_cost_paise, nrv_paise)::numeric)::bigint AND provision_paise = GREATEST(0::bigint, cost_value_paise - final_valuation_paise)),
  CONSTRAINT chk_classification_valid CHECK (classification IN ('active', 'near_expiry', 'critical', 'expired', 'damaged', 'quarantined')),
  CONSTRAINT year_end_items_snapshot_batch_uq UNIQUE (tenant_id, snapshot_id, batch_id),
  CONSTRAINT year_end_items_store_fk FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE RESTRICT,
  CONSTRAINT year_end_items_snapshot_fk FOREIGN KEY (tenant_id, store_id, snapshot_id) REFERENCES year_end_stock_snapshots(tenant_id, store_id, id) ON DELETE RESTRICT,
  CONSTRAINT year_end_items_batch_fk FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE RESTRICT,
  CONSTRAINT year_end_items_reviewed_fk FOREIGN KEY (reviewed_by) REFERENCES users(id)
);

-- 5. Hardened Server-Only Authorization Grants Table
CREATE TABLE IF NOT EXISTS year_end_authorization_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  store_id UUID NOT NULL,
  fiscal_year TEXT NOT NULL,
  authorized_user_id UUID NOT NULL,
  token_hash TEXT NOT NULL,
  action TEXT NOT NULL DEFAULT 'finalize_year_end',
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_grant_token_hash UNIQUE (token_hash), CONSTRAINT chk_grant_token_format CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT chk_grant_ttl CHECK (expires_at > created_at AND expires_at <= created_at + interval '300 seconds'),
  CONSTRAINT chk_grant_action CHECK (action = 'finalize_year_end'), CONSTRAINT chk_grant_fy CHECK (fiscal_year ~ '^[0-9]{4}-[0-9]{4}$'),
  CONSTRAINT grants_user_fk FOREIGN KEY (authorized_user_id) REFERENCES users(id)
);

-- 6. A5.5 Continuity Contract: Immutable Composite Identity Foreign Key
ALTER TABLE opening_inventory_snapshots ADD COLUMN IF NOT EXISTS source_year_end_snapshot_id UUID;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'opening_inv_source_year_end_fk') THEN
    ALTER TABLE opening_inventory_snapshots ADD CONSTRAINT opening_inv_source_year_end_fk FOREIGN KEY (tenant_id, store_id, source_year_end_snapshot_id) REFERENCES year_end_stock_snapshots(tenant_id, store_id, id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'opening_inv_source_year_end_uq') THEN
    ALTER TABLE opening_inventory_snapshots ADD CONSTRAINT opening_inv_source_year_end_uq UNIQUE (tenant_id, store_id, source_year_end_snapshot_id);
  END IF;
END $$;

-- 7. Complete Privilege Revocations & Role Grants
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO PUBLIC, mediflow_year_end_owner;
REVOKE ALL ON year_end_authorization_grants FROM PUBLIC, authenticated; REVOKE UPDATE (status, approved_by, approved_at) ON year_end_stock_snapshots FROM PUBLIC, authenticated;
REVOKE UPDATE (status, finalized_at) ON year_end_period_controls FROM PUBLIC, authenticated;
GRANT SELECT ON public.memberships, public.roles, public.stores, public.year_end_stock_items TO mediflow_year_end_owner;
GRANT SELECT, INSERT, UPDATE ON public.year_end_authorization_grants TO mediflow_year_end_owner;
GRANT SELECT, UPDATE (status, total_units, gross_landed_cost_paise, total_nrv_paise, final_valuation_paise, total_provision_paise, approved_by, approved_at) ON public.year_end_stock_snapshots TO mediflow_year_end_owner;
GRANT SELECT, UPDATE (status, finalized_at) ON public.year_end_period_controls TO mediflow_year_end_owner;

CREATE OR REPLACE FUNCTION issue_year_end_authorization_grant(
  p_tenant_id UUID, p_store_id UUID, p_fiscal_year TEXT, p_user_id UUID, p_token_hash TEXT, p_ttl_seconds INT DEFAULT 60
) RETURNS UUID AS $$
DECLARE v_role TEXT; v_grant_id UUID;
BEGIN
  IF p_ttl_seconds <= 0 OR p_ttl_seconds > 300 THEN RAISE EXCEPTION 'Invalid TTL; must be between 1 and 300s' USING ERRCODE = 'P0001'; END IF;
  IF p_token_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Malformed token hash; must be 64 hex chars' USING ERRCODE = 'P0001'; END IF;
  PERFORM 1 FROM public.stores WHERE id = p_store_id AND tenant_id = p_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Store % does not belong to tenant %', p_store_id, p_tenant_id USING ERRCODE = 'P0001'; END IF;
  PERFORM 1 FROM public.year_end_period_controls WHERE tenant_id = p_tenant_id AND store_id = p_store_id AND fiscal_year = p_fiscal_year AND status = 'open';
  IF NOT FOUND THEN RAISE EXCEPTION 'Period control for FY % is not open', p_fiscal_year USING ERRCODE = 'P0001'; END IF;
  SELECT r.key INTO v_role FROM public.memberships m JOIN public.roles r ON r.id = m.role_id WHERE m.tenant_id = p_tenant_id AND m.user_id = p_user_id AND m.status = 'active';
  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin') THEN RAISE EXCEPTION 'User % is not active owner/admin', p_user_id USING ERRCODE = '42501'; END IF;
  INSERT INTO public.year_end_authorization_grants (tenant_id, store_id, fiscal_year, authorized_user_id, token_hash, expires_at)
  VALUES (p_tenant_id, p_store_id, p_fiscal_year, p_user_id, p_token_hash, pg_catalog.clock_timestamp() + (p_ttl_seconds || ' seconds')::interval) RETURNING id INTO v_grant_id;
  RETURN v_grant_id;
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog;

ALTER FUNCTION issue_year_end_authorization_grant(UUID, UUID, TEXT, UUID, TEXT, INT) OWNER TO mediflow_year_end_owner;
REVOKE ALL ON FUNCTION issue_year_end_authorization_grant(UUID, UUID, TEXT, UUID, TEXT, INT) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION issue_year_end_authorization_grant(UUID, UUID, TEXT, UUID, TEXT, INT) TO current_user;

CREATE OR REPLACE FUNCTION fn_protect_year_end_snapshots() RETURNS TRIGGER AS $$
DECLARE v_item_count INT; v_sum_units NUMERIC; v_sum_cost NUMERIC; v_sum_nrv NUMERIC; v_sum_val NUMERIC; v_sum_prov NUMERIC;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status <> 'draft' THEN RAISE EXCEPTION 'Must start as draft' USING ERRCODE = 'P0001';
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'finalized' THEN RAISE EXCEPTION 'Cannot modify finalized snapshot %', OLD.id USING ERRCODE = 'P0001'; END IF;
    IF NEW.status = 'finalized' THEN
      IF current_user <> 'mediflow_year_end_owner' THEN RAISE EXCEPTION 'Direct SQL update to finalized prohibited' USING ERRCODE = '42501'; END IF;
      IF OLD.status <> 'draft' OR NEW.approved_by IS NULL OR NEW.approved_at IS NULL THEN RAISE EXCEPTION 'Invalid snapshot finalization prerequisites' USING ERRCODE = 'P0001'; END IF;
      SELECT count(*), coalesce(sum(qty::numeric), 0), coalesce(sum(cost_value_paise::numeric), 0), coalesce(sum((qty::numeric * nrv_paise::numeric)), 0), coalesce(sum(final_valuation_paise::numeric), 0), coalesce(sum(provision_paise::numeric), 0)
      INTO v_item_count, v_sum_units, v_sum_cost, v_sum_nrv, v_sum_val, v_sum_prov FROM public.year_end_stock_items WHERE tenant_id = NEW.tenant_id AND store_id = NEW.store_id AND snapshot_id = NEW.id;
      IF v_item_count = 0 THEN RAISE EXCEPTION 'Cannot finalize snapshot with 0 items' USING ERRCODE = 'P0001'; END IF;
      IF v_sum_units > 1000000000 OR v_sum_cost > 1000000000000000 OR v_sum_nrv > 1000000000000000 OR v_sum_val > 1000000000000000 OR v_sum_prov > 1000000000000000 THEN
        RAISE EXCEPTION 'Snapshot aggregate overflow' USING ERRCODE = 'P0001';
      END IF;
      IF NEW.total_units <> v_sum_units::bigint OR NEW.gross_landed_cost_paise <> v_sum_cost::bigint OR NEW.total_nrv_paise <> v_sum_nrv::bigint OR NEW.final_valuation_paise <> v_sum_val::bigint OR NEW.total_provision_paise <> v_sum_prov::bigint THEN
        RAISE EXCEPTION 'Header totals do not match sum of line items' USING ERRCODE = 'P0001';
      END IF;
    ELSIF NEW.status <> 'draft' THEN RAISE EXCEPTION 'Invalid status transition to %', NEW.status USING ERRCODE = 'P0001'; END IF;
  ELSIF TG_OP = 'DELETE' AND OLD.status = 'finalized' THEN RAISE EXCEPTION 'Cannot delete finalized snapshot %', OLD.id USING ERRCODE = 'P0001'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql SET search_path = pg_catalog;

DROP TRIGGER IF EXISTS trg_protect_year_end_snapshots ON year_end_stock_snapshots;
CREATE TRIGGER trg_protect_year_end_snapshots
  BEFORE INSERT OR UPDATE OR DELETE ON year_end_stock_snapshots
  FOR EACH ROW EXECUTE FUNCTION fn_protect_year_end_snapshots();

CREATE OR REPLACE FUNCTION fn_protect_year_end_items() RETURNS TRIGGER AS $$
DECLARE v_old_status TEXT; v_new_status TEXT; v_parent_count INT; v_any_finalized BOOLEAN;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT status INTO v_old_status FROM public.year_end_stock_snapshots WHERE tenant_id = OLD.tenant_id AND store_id = OLD.store_id AND id = OLD.snapshot_id FOR SHARE;
    IF NOT FOUND OR v_old_status = 'finalized' THEN RAISE EXCEPTION 'Cannot delete items from finalized/missing snapshot' USING ERRCODE = 'P0001'; END IF;
    RETURN OLD;
  ELSIF TG_OP = 'INSERT' THEN
    SELECT status INTO v_new_status FROM public.year_end_stock_snapshots WHERE tenant_id = NEW.tenant_id AND store_id = NEW.store_id AND id = NEW.snapshot_id FOR SHARE;
    IF NOT FOUND OR v_new_status = 'finalized' THEN RAISE EXCEPTION 'Cannot insert items into finalized/missing snapshot' USING ERRCODE = 'P0001'; END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.snapshot_id = NEW.snapshot_id THEN
      SELECT status INTO v_old_status FROM public.year_end_stock_snapshots WHERE tenant_id = OLD.tenant_id AND store_id = OLD.store_id AND id = OLD.snapshot_id FOR SHARE;
      IF NOT FOUND OR v_old_status = 'finalized' THEN RAISE EXCEPTION 'Cannot update items in finalized/missing snapshot' USING ERRCODE = 'P0001'; END IF;
    ELSE
      IF OLD.tenant_id <> NEW.tenant_id OR OLD.store_id <> NEW.store_id THEN RAISE EXCEPTION 'Cross-tenant/store item moves prohibited' USING ERRCODE = 'P0001'; END IF;
      SELECT count(*), bool_or(status = 'finalized') INTO v_parent_count, v_any_finalized
      FROM (SELECT status FROM public.year_end_stock_snapshots WHERE tenant_id = OLD.tenant_id AND store_id = OLD.store_id AND id IN (OLD.snapshot_id, NEW.snapshot_id) ORDER BY id FOR SHARE) locked_parents;
      IF v_parent_count <> 2 THEN RAISE EXCEPTION 'Both parents must exist in tenant/store' USING ERRCODE = 'P0001'; END IF;
      IF v_any_finalized THEN RAISE EXCEPTION 'Cannot move line items when either parent snapshot is finalized' USING ERRCODE = 'P0001'; END IF;
    END IF;
    RETURN NEW;
  END IF;
END; $$ LANGUAGE plpgsql SET search_path = pg_catalog;

DROP TRIGGER IF EXISTS trg_protect_year_end_items ON year_end_stock_items;
CREATE TRIGGER trg_protect_year_end_items
  BEFORE INSERT OR UPDATE OR DELETE ON year_end_stock_items
  FOR EACH ROW EXECUTE FUNCTION fn_protect_year_end_items();

CREATE OR REPLACE FUNCTION finalize_year_end_snapshot(
  p_tenant_id UUID, p_store_id UUID, p_fiscal_year TEXT, p_raw_token TEXT
) RETURNS UUID AS $$
DECLARE
  v_token_hash TEXT; v_grant_id UUID; v_auth_user_id UUID; v_user_role TEXT; v_ctrl_id UUID; v_ctrl_status TEXT; v_ctrl_cutoff TIMESTAMPTZ;
  v_snap_id UUID; v_snap_cutoff TIMESTAMPTZ; v_item_count INT; v_sum_units NUMERIC; v_sum_cost NUMERIC; v_sum_nrv NUMERIC; v_sum_val NUMERIC; v_sum_prov NUMERIC;
BEGIN
  v_token_hash := encode(sha256(p_raw_token::bytea), 'hex');
  SELECT id, authorized_user_id INTO v_grant_id, v_auth_user_id FROM public.year_end_authorization_grants
  WHERE token_hash = v_token_hash AND tenant_id = p_tenant_id AND store_id = p_store_id AND fiscal_year = p_fiscal_year AND action = 'finalize_year_end' AND expires_at > pg_catalog.clock_timestamp() AND consumed_at IS NULL FOR UPDATE;
  IF v_grant_id IS NULL THEN RAISE EXCEPTION 'Invalid, expired, or consumed authorization grant' USING ERRCODE = '42501'; END IF;
  UPDATE public.year_end_authorization_grants SET consumed_at = pg_catalog.clock_timestamp() WHERE id = v_grant_id;
  SELECT r.key INTO v_user_role FROM public.memberships m JOIN public.roles r ON r.id = m.role_id WHERE m.user_id = v_auth_user_id AND m.tenant_id = p_tenant_id AND m.status = 'active';
  IF v_user_role IS NULL OR v_user_role NOT IN ('owner', 'admin') THEN RAISE EXCEPTION 'Grant user is not active owner/admin' USING ERRCODE = '42501'; END IF;
  SELECT id, status, cutoff_date INTO v_ctrl_id, v_ctrl_status, v_ctrl_cutoff FROM public.year_end_period_controls WHERE tenant_id = p_tenant_id AND store_id = p_store_id AND fiscal_year = p_fiscal_year FOR UPDATE;
  IF v_ctrl_id IS NULL OR v_ctrl_status <> 'open' THEN RAISE EXCEPTION 'Period control missing or already finalized for FY %', p_fiscal_year USING ERRCODE = 'P0001'; END IF;
  SELECT id, cutoff_date INTO v_snap_id, v_snap_cutoff FROM public.year_end_stock_snapshots WHERE tenant_id = p_tenant_id AND store_id = p_store_id AND fiscal_year = p_fiscal_year AND status = 'draft' FOR UPDATE;
  IF v_snap_id IS NULL THEN RAISE EXCEPTION 'Draft snapshot not found for FY %', p_fiscal_year USING ERRCODE = 'P0001'; END IF;
  IF v_snap_cutoff <> v_ctrl_cutoff THEN RAISE EXCEPTION 'Snapshot cutoff does not match period control cutoff' USING ERRCODE = 'P0001'; END IF;
  SELECT count(*), coalesce(sum(qty::numeric), 0), coalesce(sum(cost_value_paise::numeric), 0), coalesce(sum((qty::numeric * nrv_paise::numeric)), 0), coalesce(sum(final_valuation_paise::numeric), 0), coalesce(sum(provision_paise::numeric), 0)
  INTO v_item_count, v_sum_units, v_sum_cost, v_sum_nrv, v_sum_val, v_sum_prov FROM public.year_end_stock_items WHERE tenant_id = p_tenant_id AND store_id = p_store_id AND snapshot_id = v_snap_id;
  IF v_item_count = 0 THEN RAISE EXCEPTION 'Cannot finalize snapshot with 0 items' USING ERRCODE = 'P0001'; END IF;
  IF v_sum_units > 1000000000 OR v_sum_cost > 1000000000000000 OR v_sum_nrv > 1000000000000000 OR v_sum_val > 1000000000000000 OR v_sum_prov > 1000000000000000 THEN
    RAISE EXCEPTION 'Snapshot aggregate overflow' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.year_end_stock_snapshots SET status = 'finalized', total_units = v_sum_units::bigint, gross_landed_cost_paise = v_sum_cost::bigint, total_nrv_paise = v_sum_nrv::bigint, final_valuation_paise = v_sum_val::bigint, total_provision_paise = v_sum_prov::bigint, approved_by = v_auth_user_id, approved_at = pg_catalog.clock_timestamp() WHERE tenant_id = p_tenant_id AND store_id = p_store_id AND id = v_snap_id;
  UPDATE public.year_end_period_controls SET status = 'finalized', finalized_at = pg_catalog.clock_timestamp() WHERE tenant_id = p_tenant_id AND store_id = p_store_id AND fiscal_year = p_fiscal_year;
  RETURN v_snap_id;
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog;

ALTER FUNCTION finalize_year_end_snapshot(UUID, UUID, TEXT, TEXT) OWNER TO mediflow_year_end_owner;
REVOKE ALL ON FUNCTION finalize_year_end_snapshot(UUID, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION finalize_year_end_snapshot(UUID, UUID, TEXT, TEXT) TO current_user;
