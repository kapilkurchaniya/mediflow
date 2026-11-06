-- Task A5.7: Mobile Management App & REST APIs Migration
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'memberships_tenant_user_uq') THEN
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'memberships_tenant_user_uq') THEN
      ALTER TABLE memberships ADD CONSTRAINT memberships_tenant_user_uq UNIQUE USING INDEX memberships_tenant_user_uq;
    ELSE
      ALTER TABLE memberships ADD CONSTRAINT memberships_tenant_user_uq UNIQUE (tenant_id, user_id);
    END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_tenant_store_id_uq') THEN
    ALTER TABLE sales ADD CONSTRAINT sales_tenant_store_id_uq UNIQUE (tenant_id, store_id, id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS mobile_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  user_id UUID NOT NULL REFERENCES users(id),
  device_name TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  device_uuid TEXT NOT NULL,
  enrollment_status TEXT NOT NULL DEFAULT 'pending' CHECK (enrollment_status IN ('pending', 'enrolled', 'revoked')),
  push_token TEXT,
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_mobile_device_uuid UNIQUE (tenant_id, user_id, device_uuid),
  CONSTRAINT uq_mobile_device_tenant_user UNIQUE (tenant_id, user_id, id),
  CONSTRAINT fk_device_membership FOREIGN KEY (tenant_id, user_id) REFERENCES memberships(tenant_id, user_id)
);

CREATE TABLE IF NOT EXISTS mobile_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  user_id UUID NOT NULL REFERENCES users(id),
  device_id UUID NOT NULL,
  refresh_token_hash TEXT NOT NULL,
  family_id UUID NOT NULL DEFAULT gen_random_uuid(),
  session_version INT NOT NULL DEFAULT 1,
  is_consumed BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_mobile_refresh_token_hash UNIQUE (refresh_token_hash),
  CONSTRAINT uq_mobile_sessions_composite UNIQUE (tenant_id, user_id, device_id, id),
  CONSTRAINT fk_session_device FOREIGN KEY (tenant_id, user_id, device_id) REFERENCES mobile_devices(tenant_id, user_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_mobile_sessions_family ON mobile_sessions(tenant_id, family_id);

CREATE TABLE IF NOT EXISTS remote_approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  store_id UUID NOT NULL,
  request_type TEXT NOT NULL CHECK (request_type IN ('credit_override', 'po_limit')),
  ref_id UUID NOT NULL,
  requested_by UUID NOT NULL,
  snapshot_payload JSONB NOT NULL,
  snapshot_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_approval_request_tenant UNIQUE (tenant_id, id),
  CONSTRAINT fk_approval_req_store FOREIGN KEY (tenant_id, store_id) REFERENCES stores(tenant_id, id),
  CONSTRAINT fk_approval_req_user FOREIGN KEY (tenant_id, requested_by) REFERENCES memberships(tenant_id, user_id)
);

CREATE TABLE IF NOT EXISTS remote_approval_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  request_id UUID NOT NULL,
  approver_user_id UUID NOT NULL,
  device_id UUID NOT NULL,
  session_id UUID NOT NULL,
  challenge_token_hash TEXT NOT NULL,
  snapshot_hash TEXT NOT NULL,
  is_consumed BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_approval_challenge_token UNIQUE (challenge_token_hash),
  CONSTRAINT uq_approval_challenge_actor UNIQUE (tenant_id, approver_user_id, id),
  CONSTRAINT fk_challenge_request FOREIGN KEY (tenant_id, request_id) REFERENCES remote_approval_requests(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_challenge_session_device FOREIGN KEY (tenant_id, approver_user_id, device_id, session_id) REFERENCES mobile_sessions(tenant_id, user_id, device_id, id)
);
CREATE INDEX IF NOT EXISTS idx_approval_active_challenge ON remote_approval_challenges(tenant_id, request_id, approver_user_id) WHERE (is_consumed = false);

CREATE TABLE IF NOT EXISTS remote_approval_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  request_id UUID NOT NULL,
  challenge_id UUID NOT NULL,
  decided_by UUID NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
  decision_reason TEXT,
  idempotency_key TEXT NOT NULL,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_approval_request_decision UNIQUE (tenant_id, request_id),
  CONSTRAINT uq_approval_idempotency UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT fk_decision_request FOREIGN KEY (tenant_id, request_id) REFERENCES remote_approval_requests(tenant_id, id),
  CONSTRAINT fk_decision_challenge_actor FOREIGN KEY (tenant_id, decided_by, challenge_id) REFERENCES remote_approval_challenges(tenant_id, approver_user_id, id)
);

CREATE OR REPLACE FUNCTION trg_protect_approval_snapshot() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.snapshot_payload <> OLD.snapshot_payload OR NEW.snapshot_hash <> OLD.snapshot_hash THEN
    RAISE EXCEPTION 'Approval request snapshot is immutable';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_approval_snapshot_immutability ON remote_approval_requests;
CREATE TRIGGER trg_approval_snapshot_immutability
BEFORE UPDATE ON remote_approval_requests FOR EACH ROW EXECUTE FUNCTION trg_protect_approval_snapshot();

CREATE TABLE IF NOT EXISTS delivery_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  store_id UUID NOT NULL,
  sale_id UUID NOT NULL,
  delivery_staff_user_id UUID,
  delivery_status TEXT NOT NULL DEFAULT 'assigned' CHECK (delivery_status IN ('assigned', 'in_transit', 'delivered', 'failed')),
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'intent_created', 'collected', 'verified')),
  delivery_address TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  recipient_phone TEXT NOT NULL,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_delivery_order_tenant UNIQUE (tenant_id, id),
  CONSTRAINT fk_delivery_store FOREIGN KEY (tenant_id, store_id) REFERENCES stores(tenant_id, id),
  CONSTRAINT fk_delivery_sale FOREIGN KEY (tenant_id, store_id, sale_id) REFERENCES sales(tenant_id, store_id, id),
  CONSTRAINT fk_delivery_staff FOREIGN KEY (tenant_id, delivery_staff_user_id) REFERENCES memberships(tenant_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_delivery_staff_assigned ON delivery_orders(tenant_id, store_id, delivery_staff_user_id, delivery_status);

CREATE TABLE IF NOT EXISTS delivery_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  delivery_order_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('assigned', 'reassigned', 'in_transit', 'delivered', 'failed', 'proof_uploaded')),
  actor_user_id UUID NOT NULL,
  prev_assignee_id UUID,
  new_assignee_id UUID,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_event_order FOREIGN KEY (tenant_id, delivery_order_id) REFERENCES delivery_orders(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_event_actor FOREIGN KEY (tenant_id, actor_user_id) REFERENCES memberships(tenant_id, user_id),
  CONSTRAINT fk_event_prev_staff FOREIGN KEY (tenant_id, prev_assignee_id) REFERENCES memberships(tenant_id, user_id),
  CONSTRAINT fk_event_new_staff FOREIGN KEY (tenant_id, new_assignee_id) REFERENCES memberships(tenant_id, user_id)
);

CREATE OR REPLACE FUNCTION trg_block_event_modifications() RETURNS TRIGGER AS $$
BEGIN
  IF current_setting('session_replication_role', true) = 'replica' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  RAISE EXCEPTION 'delivery_events is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_delivery_events_immutability ON delivery_events;
CREATE TRIGGER trg_delivery_events_immutability
BEFORE UPDATE OR DELETE ON delivery_events FOR EACH ROW EXECUTE FUNCTION trg_block_event_modifications();

CREATE TABLE IF NOT EXISTS delivery_proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  delivery_order_id UUID NOT NULL,
  proof_type TEXT NOT NULL CHECK (proof_type IN ('delivery_photo', 'recipient_signature')),
  file_key TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('image/jpeg', 'image/png', 'application/pdf')),
  file_size_bytes INT NOT NULL CHECK (file_size_bytes > 0 AND file_size_bytes <= 10485760),
  checksum_sha256 TEXT NOT NULL,
  upload_status TEXT NOT NULL DEFAULT 'pending' CHECK (upload_status IN ('pending', 'completed', 'failed')),
  idempotency_key TEXT NOT NULL,
  uploaded_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_proof_idempotency UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT fk_proof_order FOREIGN KEY (tenant_id, delivery_order_id) REFERENCES delivery_orders(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_proof_uploader FOREIGN KEY (tenant_id, uploaded_by) REFERENCES memberships(tenant_id, user_id)
);

CREATE TABLE IF NOT EXISTS delivery_payment_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  delivery_order_id UUID NOT NULL,
  provider TEXT NOT NULL DEFAULT 'razorpay' CHECK (provider IN ('razorpay', 'mock')),
  provider_qr_id TEXT NOT NULL,
  provider_order_ref TEXT NOT NULL,
  provider_payment_id TEXT,
  amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
  qr_payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'failed', 'expired')),
  verified_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_delivery_order_ref UNIQUE (tenant_id, provider_order_ref),
  CONSTRAINT fk_intent_order FOREIGN KEY (tenant_id, delivery_order_id) REFERENCES delivery_orders(tenant_id, id)
);

CREATE TABLE IF NOT EXISTS delivery_payment_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  provider_payment_id TEXT,
  event_type TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'processed', 'ignored', 'failed')),
  error_message TEXT,
  retry_count INT NOT NULL DEFAULT 0,
  lease_expires_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_payment_webhook_event UNIQUE (provider, provider_event_id)
);
