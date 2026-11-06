/** Concurrency & Race Condition Tests for Mobile Auth, Approvals & Webhooks (Lane A: A5.7.9) */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { db } from "../../src/server/db";
import * as schema from "../../src/server/db/schema";
import {
  registerDevice,
  approveDevice,
  loginMobile,
  refreshMobileSession,
  validateMobileToken,
} from "../../src/server/domain/mobile/auth";
import {
  createApprovalRequest,
  issueApprovalChallenge,
  decideApproval,
} from "../../src/server/domain/mobile/approvals";
import {
  createDeliveryUpiIntent,
  ingestRazorpayWebhook,
} from "../../src/server/domain/mobile/payments";

describe("Mobile Concurrency & Multi-Connection Suite", () => {
  let pool1: Pool;
  let pool2: Pool;
  let db1: typeof db;
  let db2: typeof db;
  let tenantId: string;
  let storeId: string;
  let ownerUserId: string;
  let staffUserId: string;
  let saleId: string;
  let deliveryOrderId: string;
  let ownerEmail: string;
  let staffEmail: string;

  beforeAll(async () => {
    pool1 = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    pool2 = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    db1 = drizzle(pool1, { schema });
    db2 = drizzle(pool2, { schema });

    tenantId = crypto.randomUUID();
    storeId = crypto.randomUUID();
    ownerUserId = crypto.randomUUID();
    staffUserId = crypto.randomUUID();
    saleId = crypto.randomUUID();
    deliveryOrderId = crypto.randomUUID();
    ownerEmail = `conc_owner_${tenantId.slice(0, 8)}@test.com`;
    staffEmail = `conc_staff_${tenantId.slice(0, 8)}@test.com`;

    const pwHash = await bcrypt.hash("pass123", 4);

    await db.execute(sql`INSERT INTO tenants (id, name, legal_name) VALUES (${tenantId}::uuid, 'Conc Tenant', 'Conc Legal')`);
    await db.execute(sql`INSERT INTO stores (id, tenant_id, name, code, state_code) VALUES (${storeId}::uuid, ${tenantId}::uuid, 'Conc Store', 'CNC1', 'MH')`);
    await db.execute(sql`INSERT INTO users (id, name, email, password_hash) VALUES (${ownerUserId}::uuid, 'Owner Conc', ${ownerEmail}, ${pwHash})`);
    await db.execute(sql`INSERT INTO users (id, name, email, password_hash) VALUES (${staffUserId}::uuid, 'Staff Conc', ${staffEmail}, ${pwHash})`);

    await db.execute(sql`INSERT INTO roles (id, tenant_id, key, name, is_system) VALUES (gen_random_uuid(), ${tenantId}::uuid, 'owner', 'Owner', true) ON CONFLICT DO NOTHING`);
    await db.execute(sql`INSERT INTO roles (id, tenant_id, key, name, is_system) VALUES (gen_random_uuid(), ${tenantId}::uuid, 'delivery_staff', 'Delivery Staff', true) ON CONFLICT DO NOTHING`);

    await db.execute(sql`
      INSERT INTO memberships (id, tenant_id, user_id, role_id, status, all_stores, store_ids)
      SELECT gen_random_uuid(), ${tenantId}::uuid, ${ownerUserId}::uuid, id, 'active', true, ARRAY[${storeId}::uuid]
      FROM roles WHERE tenant_id = ${tenantId}::uuid AND key = 'owner'
    `);
    await db.execute(sql`
      INSERT INTO memberships (id, tenant_id, user_id, role_id, status, all_stores, store_ids)
      SELECT gen_random_uuid(), ${tenantId}::uuid, ${staffUserId}::uuid, id, 'active', false, ARRAY[${storeId}::uuid]
      FROM roles WHERE tenant_id = ${tenantId}::uuid AND key = 'delivery_staff'
    `);

    await db.execute(sql`
      INSERT INTO sales (id, tenant_id, store_id, invoice_no, status, total_amount, paid_amount, cost_amount, credit_amount, created_by, completed_at)
      VALUES (${saleId}::uuid, ${tenantId}::uuid, ${storeId}::uuid, 'INV-CNC-1', 'completed', 80000, 0, 50000, 80000, ${ownerUserId}::uuid, now())
    `);

    await db.execute(sql`
      INSERT INTO delivery_orders (id, tenant_id, store_id, sale_id, delivery_status, payment_status, delivery_address, recipient_name, recipient_phone)
      VALUES (${deliveryOrderId}::uuid, ${tenantId}::uuid, ${storeId}::uuid, ${saleId}::uuid, 'assigned', 'pending', '99 Conc St', 'Cust', '9876543210')
    `);
  });

  afterAll(async () => {
    await db.execute(sql`SET session_replication_role = 'replica'`);
    await db.execute(sql`DELETE FROM delivery_payment_webhooks WHERE tenant_id = ${tenantId}::uuid`);
    await db.execute(sql`DELETE FROM delivery_payment_intents WHERE tenant_id = ${tenantId}::uuid`);
    await db.execute(sql`DELETE FROM delivery_proofs WHERE tenant_id = ${tenantId}::uuid`);
    await db.execute(sql`DELETE FROM delivery_events WHERE tenant_id = ${tenantId}::uuid`);
    await db.execute(sql`DELETE FROM delivery_orders WHERE tenant_id = ${tenantId}::uuid`);
    await db.execute(sql`DELETE FROM payments WHERE tenant_id = ${tenantId}::uuid`);
    await db.execute(sql`DELETE FROM remote_approval_decisions WHERE tenant_id = ${tenantId}::uuid`);
    await db.execute(sql`DELETE FROM remote_approval_challenges WHERE tenant_id = ${tenantId}::uuid`);
    await db.execute(sql`DELETE FROM remote_approval_requests WHERE tenant_id = ${tenantId}::uuid`);
    await db.execute(sql`DELETE FROM mobile_sessions WHERE tenant_id = ${tenantId}::uuid`);
    await db.execute(sql`DELETE FROM mobile_devices WHERE tenant_id = ${tenantId}::uuid`);
    await db.execute(sql`DELETE FROM sales WHERE tenant_id = ${tenantId}::uuid`);
    await db.execute(sql`DELETE FROM memberships WHERE tenant_id = ${tenantId}::uuid`);
    await db.execute(sql`DELETE FROM roles WHERE tenant_id = ${tenantId}::uuid`);
    await db.execute(sql`DELETE FROM stores WHERE tenant_id = ${tenantId}::uuid`);
    await db.execute(sql`DELETE FROM users WHERE id IN (${ownerUserId}::uuid, ${staffUserId}::uuid)`);
    await db.execute(sql`DELETE FROM tenants WHERE id = ${tenantId}::uuid`);
    await db.execute(sql`SET session_replication_role = 'origin'`);
    await pool1.end();
    await pool2.end();
  });

  it("handles simultaneous refresh attempts: exactly one succeeds and race is serialized", async () => {
    const devUuid = `dev_conc_${Date.now()}`;
    const dev = await registerDevice(db, { tenantId, userId: ownerUserId, deviceName: "Race Device", platform: "android", deviceUuid: devUuid });
    await approveDevice(db, tenantId, dev.id);

    const loginRes = await loginMobile(db, {
      email: ownerEmail,
      password: "pass123",
      deviceUuid: devUuid,
      deviceName: "Race Device",
      platform: "android",
    });

    const token = loginRes.refreshToken;

    // Launch two simultaneous refreshes via separate connections
    const [p1, p2] = await Promise.allSettled([
      refreshMobileSession(db1, { refreshToken: token }),
      refreshMobileSession(db2, { refreshToken: token }),
    ]);

    const successes = [p1, p2].filter((r) => r.status === "fulfilled");
    const rejections = [p1, p2].filter((r) => r.status === "rejected");

    // Exactly one refresh succeeded; the other lost the race and detected consumed replay
    expect(successes.length).toBe(1);
    expect(rejections.length).toBe(1);
  });

  it("handles simultaneous approval decisions: exactly one succeeds and second is rejected", async () => {
    const req = await createApprovalRequest(db, {
      tenantId,
      storeId,
      requestType: "credit_override",
      refId: saleId,
      requestedBy: staffUserId,
      payload: { refId: saleId, requestType: "credit_override", amountPaise: 40000, customerName: "Race Customer" },
    });

    const devUuid = `dev_race_appr_${Date.now()}`;
    const dev = await registerDevice(db, { tenantId, userId: ownerUserId, deviceName: "Race iPad", platform: "ios", deviceUuid: devUuid });
    await approveDevice(db, tenantId, dev.id);
    const login = await loginMobile(db, { email: ownerEmail, password: "pass123", deviceUuid: devUuid, deviceName: "Race iPad", platform: "ios" });
    const auth = await validateMobileToken(db, login.accessToken);
    if (!auth.valid) throw new Error("Auth failed");

    const challenge = await issueApprovalChallenge(db, {
      tenantId,
      requestId: req.id,
      approverUserId: ownerUserId,
      deviceId: auth.context.deviceId,
      sessionId: auth.context.sessionId,
    });

    // Two simultaneous decision attempts on separate connections
    const [d1, d2] = await Promise.allSettled([
      decideApproval(db1, {
        tenantId,
        requestId: req.id,
        challengeId: challenge.challengeId,
        challengeToken: challenge.challengeToken,
        approverUserId: ownerUserId,
        deviceId: auth.context.deviceId,
        sessionId: auth.context.sessionId,
        decision: "approved",
        idempotencyKey: `race_dec_1_${Date.now()}`,
      }),
      decideApproval(db2, {
        tenantId,
        requestId: req.id,
        challengeId: challenge.challengeId,
        challengeToken: challenge.challengeToken,
        approverUserId: ownerUserId,
        deviceId: auth.context.deviceId,
        sessionId: auth.context.sessionId,
        decision: "approved",
        idempotencyKey: `race_dec_2_${Date.now()}`,
      }),
    ]);

    const successes = [d1, d2].filter((r) => r.status === "fulfilled");
    const rejections = [d1, d2].filter((r) => r.status === "rejected");

    // Exactly one decision executed; the other encountered challenge consumed or request already decided
    expect(successes.length).toBe(1);
    expect(rejections.length).toBe(1);
  });

  it("handles duplicate webhook deliveries concurrently with idempotent deduplication", async () => {
    const intentRes = await createDeliveryUpiIntent(db, {
      tenantId,
      deliveryOrderId,
      actorUserId: staffUserId,
    });

    const eventId = `evt_race_${Date.now()}`;
    const rawWebhook = JSON.stringify({
      event: "payment.captured",
      event_id: eventId,
      payload: {
        payment: {
          entity: {
            id: `pay_conc_${Date.now()}`,
            amount: 80000,
            currency: "INR",
            status: "captured",
            notes: { provider_order_ref: intentRes.intent.providerOrderRef, tenant_id: tenantId },
          },
        },
      },
    });
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || "mediflow_rzp_webhook_secret_test";
    const sig = crypto.createHmac("sha256", secret).update(rawWebhook).digest("hex");

    // Deliver identical webhook twice concurrently
    const [w1, w2] = await Promise.all([
      ingestRazorpayWebhook(db1, { tenantId, rawBody: rawWebhook, signature: sig }),
      ingestRazorpayWebhook(db2, { tenantId, rawBody: rawWebhook, signature: sig }),
    ]);

    expect(w1.received).toBe(true);
    expect(w2.received).toBe(true);

    const countRes = await db.execute(sql`
      SELECT count(*)::int as cnt FROM delivery_payment_webhooks
      WHERE provider = 'razorpay' AND provider_event_id = ${eventId}
    `);
    expect((countRes.rows[0] as Record<string, unknown>).cnt).toBe(1);
  });

  it("serializes 3-way parallel refresh race: exactly one succeeds and losers detect replay", async () => {
    const devUuid = `dev_conc_3way_${Date.now()}`;
    const dev = await registerDevice(db, { tenantId, userId: ownerUserId, deviceName: "3Way Device", platform: "ios", deviceUuid: devUuid });
    await approveDevice(db, tenantId, dev.id);

    const loginRes = await loginMobile(db, {
      email: ownerEmail,
      password: "pass123",
      deviceUuid: devUuid,
      deviceName: "3Way Device",
      platform: "ios",
    });

    const token = loginRes.refreshToken;

    const [r1, r2, r3] = await Promise.allSettled([
      refreshMobileSession(db1, { refreshToken: token }),
      refreshMobileSession(db2, { refreshToken: token }),
      refreshMobileSession(db, { refreshToken: token }),
    ]);

    const successes = [r1, r2, r3].filter((r) => r.status === "fulfilled");
    const rejections = [r1, r2, r3].filter((r) => r.status === "rejected");

    expect(successes.length).toBe(1);
    expect(rejections.length).toBe(2);
  });
});
