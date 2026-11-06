/** Integration Tests for Webhook Failures, Recovery Transactions & AR Invariants (Lane A: A5.7.9) */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { db } from "../../src/server/db";
import {
  createDeliveryUpiIntent,
  ingestRazorpayWebhook,
  processRazorpayWebhook,
} from "../../src/server/domain/mobile/payments";
import { getMobileDashboardMetrics } from "../../src/server/domain/mobile/dashboard";

describe("Mobile Settlement Failures, Two-Transaction Recovery & Subledger Suite", () => {
  let tenantId: string;
  let storeId: string;
  let ownerUserId: string;
  let customerId: string;
  let saleId: string;
  let deliveryOrderId: string;

  beforeAll(async () => {
    tenantId = crypto.randomUUID();
    storeId = crypto.randomUUID();
    ownerUserId = crypto.randomUUID();
    customerId = crypto.randomUUID();
    saleId = crypto.randomUUID();
    deliveryOrderId = crypto.randomUUID();
    const ownerEmail = `fail_owner_${tenantId.slice(0, 8)}@test.com`;

    const pwHash = await bcrypt.hash("pass123", 4);

    await db.execute(sql`INSERT INTO tenants (id, name, legal_name) VALUES (${tenantId}::uuid, 'Fail Tenant', 'Fail Legal')`);
    await db.execute(sql`INSERT INTO stores (id, tenant_id, name, code, state_code) VALUES (${storeId}::uuid, ${tenantId}::uuid, 'Fail Store', 'FL1', 'MH')`);
    await db.execute(sql`INSERT INTO users (id, name, email, password_hash) VALUES (${ownerUserId}::uuid, 'Owner User', ${ownerEmail}, ${pwHash})`);
    await db.execute(sql`INSERT INTO customers (id, tenant_id, name, phone) VALUES (${customerId}::uuid, ${tenantId}::uuid, 'Fail Cust', '9999988888')`);

    await db.execute(sql`INSERT INTO roles (id, tenant_id, key, name, is_system) VALUES (gen_random_uuid(), ${tenantId}::uuid, 'owner', 'Owner', true) ON CONFLICT DO NOTHING`);
    await db.execute(sql`
      INSERT INTO memberships (id, tenant_id, user_id, role_id, status, all_stores, store_ids)
      SELECT gen_random_uuid(), ${tenantId}::uuid, ${ownerUserId}::uuid, id, 'active', true, ARRAY[${storeId}::uuid]
      FROM roles WHERE tenant_id = ${tenantId}::uuid AND key = 'owner'
    `);

    await db.execute(sql`
      INSERT INTO sales (id, tenant_id, store_id, invoice_no, status, total_amount, paid_amount, cost_amount, credit_amount, customer_id, created_by, completed_at)
      VALUES (${saleId}::uuid, ${tenantId}::uuid, ${storeId}::uuid, 'INV-FAIL-1', 'completed', 75000, 0, 45000, 75000, ${customerId}::uuid, ${ownerUserId}::uuid, now())
    `);

    await db.execute(sql`
      INSERT INTO delivery_orders (id, tenant_id, store_id, sale_id, delivery_status, payment_status, delivery_address, recipient_name, recipient_phone)
      VALUES (${deliveryOrderId}::uuid, ${tenantId}::uuid, ${storeId}::uuid, ${saleId}::uuid, 'in_transit', 'pending', '456 Fail St', 'Cust', '9999988888')
    `);
  });

  afterAll(async () => {
    await db.execute(sql`SET session_replication_role = 'replica'`);
    await db.execute(sql`DELETE FROM delivery_payment_webhooks WHERE tenant_id = ${tenantId}::uuid`);
    await db.execute(sql`DELETE FROM delivery_payment_intents WHERE tenant_id = ${tenantId}::uuid`);
    await db.execute(sql`DELETE FROM delivery_orders WHERE tenant_id = ${tenantId}::uuid`);
    await db.execute(sql`DELETE FROM payments WHERE tenant_id = ${tenantId}::uuid`);
    await db.execute(sql`DELETE FROM sales WHERE tenant_id = ${tenantId}::uuid`);
    await db.execute(sql`DELETE FROM customers WHERE tenant_id = ${tenantId}::uuid`);
    await db.execute(sql`DELETE FROM memberships WHERE tenant_id = ${tenantId}::uuid`);
    await db.execute(sql`DELETE FROM roles WHERE tenant_id = ${tenantId}::uuid`);
    await db.execute(sql`DELETE FROM stores WHERE tenant_id = ${tenantId}::uuid`);
    await db.execute(sql`DELETE FROM users WHERE id = ${ownerUserId}::uuid`);
    await db.execute(sql`DELETE FROM tenants WHERE id = ${tenantId}::uuid`);
    await db.execute(sql`SET session_replication_role = 'origin'`);
  });

  it("rejects webhook with invalid HMAC-SHA256 signature", async () => {
    const rawBody = JSON.stringify({ id: "evt_invalid", event: "payment.captured" });
    await expect(
      ingestRazorpayWebhook(db, {
        tenantId,
        rawBody,
        signature: "wrong_hex_signature_32984729384729384729384729384729",
      }),
    ).rejects.toThrow("INVALID_WEBHOOK_SIGNATURE");
  });

  it("executes two-transaction recovery when unsupported currency is received", async () => {
    const intentRes = await createDeliveryUpiIntent(db, { tenantId, deliveryOrderId, actorUserId: ownerUserId });
    const eventId = `evt_curr_${Date.now()}`;
    const rawWebhook = JSON.stringify({
      id: eventId,
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: `pay_curr_${Date.now()}`,
            amount: 75000,
            currency: "USD", // Illegal currency
            notes: { provider_order_ref: intentRes.intent.providerOrderRef, tenant_id: tenantId },
          },
        },
      },
    });

    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || "mediflow_rzp_webhook_secret_test";
    const sig = crypto.createHmac("sha256", secret).update(rawWebhook).digest("hex");

    await ingestRazorpayWebhook(db, { tenantId, rawBody: rawWebhook, signature: sig });

    // Assert TX 2 committed failure state
    const whRes = await db.execute(sql`
      SELECT status, error_message, retry_count, lease_expires_at
      FROM delivery_payment_webhooks
      WHERE provider = 'razorpay' AND provider_event_id = ${eventId}
    `);
    const wh = whRes.rows[0] as Record<string, unknown>;
    expect(wh.status).toBe("failed");
    expect(String(wh.error_message)).toContain("UNSUPPORTED_CURRENCY");
    expect(wh.retry_count).toBe(1);
    expect(wh.lease_expires_at).toBeNull();

    // Assert order payment_status remained unverified (TX 1 rolled back)
    const ordRes = await db.execute(sql`SELECT payment_status FROM delivery_orders WHERE id = ${deliveryOrderId}::uuid`);
    expect((ordRes.rows[0] as Record<string, unknown>).payment_status).toBe("intent_created");
  });

  it("recovers failed webhook when worker re-processes after lease expiration", async () => {
    const eventId = `evt_retry_${Date.now()}`;
    const orderRef = `MPAY-RETRY-${Date.now()}`;
    const rawWebhook = JSON.stringify({
      id: eventId,
      event: "payment.captured",
      payload: { payment: { entity: { id: `pay_retry_${Date.now()}`, amount: 75000, currency: "INR", notes: { provider_order_ref: orderRef, tenant_id: tenantId } } } },
    });
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || "mediflow_rzp_webhook_secret_test";
    const sig = crypto.createHmac("sha256", secret).update(rawWebhook).digest("hex");

    await ingestRazorpayWebhook(db, { tenantId, rawBody: rawWebhook, signature: sig });

    // Webhook failed because intent didn't exist yet
    const whRes1 = await db.execute(sql`SELECT id, status FROM delivery_payment_webhooks WHERE provider_event_id = ${eventId}`);
    const whId = (whRes1.rows[0] as Record<string, unknown>).id as string;
    expect((whRes1.rows[0] as Record<string, unknown>).status).toBe("failed");

    // Now insert the matching intent
    await db.execute(sql`
      INSERT INTO delivery_payment_intents (id, tenant_id, delivery_order_id, provider, provider_qr_id, provider_order_ref, amount_paise, qr_payload, status, expires_at)
      VALUES (gen_random_uuid(), ${tenantId}::uuid, ${deliveryOrderId}::uuid, 'razorpay', 'qr_retry', ${orderRef}, 75000, 'upi://pay?...', 'pending', now() + interval '30 minutes')
    `);

    // Worker reclaims lease and successfully processes
    const retryRes = await processRazorpayWebhook(db, { tenantId, webhookId: whId });
    expect(retryRes.processed).toBe(true);

    const whRes2 = await db.execute(sql`SELECT status FROM delivery_payment_webhooks WHERE id = ${whId}::uuid`);
    expect((whRes2.rows[0] as Record<string, unknown>).status).toBe("processed");
  });

  it("authoritatively computes historical customer AR vs period credit sales", async () => {
    // 1. Insert an old unpaid invoice completed 7 days ago
    const oldSaleId = crypto.randomUUID();
    await db.execute(sql`
      INSERT INTO sales (id, tenant_id, store_id, invoice_no, status, total_amount, paid_amount, cost_amount, credit_amount, customer_id, created_by, completed_at)
      VALUES (${oldSaleId}::uuid, ${tenantId}::uuid, ${storeId}::uuid, 'INV-HIST-1', 'completed', 120000, 20000, 70000, 100000, ${customerId}::uuid, ${ownerUserId}::uuid, now() - interval '7 days')
    `);

    // 2. Insert today's unpaid credit sale
    const todaySaleId = crypto.randomUUID();
    await db.execute(sql`
      INSERT INTO sales (id, tenant_id, store_id, invoice_no, status, total_amount, paid_amount, cost_amount, credit_amount, customer_id, created_by, completed_at)
      VALUES (${todaySaleId}::uuid, ${tenantId}::uuid, ${storeId}::uuid, 'INV-TODAY-1', 'completed', 50000, 0, 30000, 50000, ${customerId}::uuid, ${ownerUserId}::uuid, now())
    `);

    const metrics = await getMobileDashboardMetrics(db, { tenantId, storeId });

    // Cumulative historical AR includes both the old ₹1,000 balance and today's ₹500 balance
    expect(metrics.receivables.cumulativeOutstandingArPaise).toBe(150000);
    // Period Credit Sales only counts today's credit sale (₹500 = 50,000 paise)
    expect(metrics.receivables.periodCreditSalesPaise).toBe(50000);
  });

  it("fails settlement and records TX 2 error when payment amount does not match intent amount", async () => {
    const mismatchSaleId = crypto.randomUUID();
    const mismatchOrderId = crypto.randomUUID();
    await db.execute(sql`
      INSERT INTO sales (id, tenant_id, store_id, invoice_no, status, total_amount, paid_amount, cost_amount, credit_amount, customer_id, created_by, completed_at)
      VALUES (${mismatchSaleId}::uuid, ${tenantId}::uuid, ${storeId}::uuid, 'INV-MISMATCH-1', 'completed', 50000, 0, 30000, 50000, ${customerId}::uuid, ${ownerUserId}::uuid, now())
    `);
    await db.execute(sql`
      INSERT INTO delivery_orders (id, tenant_id, store_id, sale_id, delivery_status, payment_status, delivery_address, recipient_name, recipient_phone)
      VALUES (${mismatchOrderId}::uuid, ${tenantId}::uuid, ${storeId}::uuid, ${mismatchSaleId}::uuid, 'in_transit', 'pending', '789 Mismatch Ave', 'Cust', '9999988888')
    `);

    const intentRes = await createDeliveryUpiIntent(db, { tenantId, deliveryOrderId: mismatchOrderId, actorUserId: ownerUserId });
    const eventId = `evt_mismatch_${Date.now()}`;
    const rawWebhook = JSON.stringify({
      id: eventId,
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: `pay_mis_${Date.now()}`,
            amount: 25000, // Intent expected 50000, received 25000
            currency: "INR",
            notes: { provider_order_ref: intentRes.intent.providerOrderRef, tenant_id: tenantId },
          },
        },
      },
    });

    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || "mediflow_rzp_webhook_secret_test";
    const sig = crypto.createHmac("sha256", secret).update(rawWebhook).digest("hex");
    await ingestRazorpayWebhook(db, { tenantId, rawBody: rawWebhook, signature: sig });

    const whRes = await db.execute(sql`SELECT status, error_message FROM delivery_payment_webhooks WHERE provider_event_id = ${eventId}`);
    const wh = whRes.rows[0] as Record<string, unknown>;
    expect(wh.status).toBe("failed");
    expect(String(wh.error_message)).toContain("AMOUNT_MISMATCH");

    // Order status must remain unverified
    const ordRes = await db.execute(sql`SELECT payment_status FROM delivery_orders WHERE id = ${mismatchOrderId}::uuid`);
    expect((ordRes.rows[0] as Record<string, unknown>).payment_status).toBe("intent_created");
  });

  it("prevents duplicate payment posting on webhook replay", async () => {
    const replaySaleId = crypto.randomUUID();
    const replayOrderId = crypto.randomUUID();
    await db.execute(sql`
      INSERT INTO sales (id, tenant_id, store_id, invoice_no, status, total_amount, paid_amount, cost_amount, credit_amount, customer_id, created_by, completed_at)
      VALUES (${replaySaleId}::uuid, ${tenantId}::uuid, ${storeId}::uuid, 'INV-REPLAY-1', 'completed', 60000, 0, 40000, 60000, ${customerId}::uuid, ${ownerUserId}::uuid, now())
    `);
    await db.execute(sql`
      INSERT INTO delivery_orders (id, tenant_id, store_id, sale_id, delivery_status, payment_status, delivery_address, recipient_name, recipient_phone)
      VALUES (${replayOrderId}::uuid, ${tenantId}::uuid, ${storeId}::uuid, ${replaySaleId}::uuid, 'in_transit', 'pending', '321 Replay Rd', 'Cust', '9999988888')
    `);

    const intentRes = await createDeliveryUpiIntent(db, { tenantId, deliveryOrderId: replayOrderId, actorUserId: ownerUserId });
    const eventId = `evt_dedup_${Date.now()}`;
    const providerPaymentId = `pay_dedup_${Date.now()}`;
    const rawWebhook = JSON.stringify({
      id: eventId,
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: providerPaymentId,
            amount: 60000,
            currency: "INR",
            notes: { provider_order_ref: intentRes.intent.providerOrderRef, tenant_id: tenantId },
          },
        },
      },
    });

    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || "mediflow_rzp_webhook_secret_test";
    const sig = crypto.createHmac("sha256", secret).update(rawWebhook).digest("hex");

    // Ingest first time: should settle
    const res1 = await ingestRazorpayWebhook(db, { tenantId, rawBody: rawWebhook, signature: sig });
    expect(res1.received).toBe(true);

    // Ingest second time: duplicate delivery
    const res2 = await ingestRazorpayWebhook(db, { tenantId, rawBody: rawWebhook, signature: sig });
    expect(res2.received).toBe(true);

    // Payments ledger must contain exactly 1 payment record for this reference
    const payRows = await db.execute(sql`
      SELECT count(*)::int as cnt FROM payments
      WHERE tenant_id = ${tenantId}::uuid AND method = 'upi' AND reference = ${providerPaymentId}
    `);
    expect(Number((payRows.rows[0] as Record<string, unknown>).cnt)).toBe(1);
  });

  it("records durable failure when webhook payload has unknown provider_order_ref", async () => {
    const eventId = `evt_unknown_${Date.now()}`;
    const rawWebhook = JSON.stringify({
      id: eventId,
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: `pay_unk_${Date.now()}`,
            amount: 10000,
            currency: "INR",
            notes: { provider_order_ref: "NON_EXISTENT_REF_999", tenant_id: tenantId },
          },
        },
      },
    });

    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || "mediflow_rzp_webhook_secret_test";
    const sig = crypto.createHmac("sha256", secret).update(rawWebhook).digest("hex");
    await ingestRazorpayWebhook(db, { tenantId, rawBody: rawWebhook, signature: sig });

    const whRes = await db.execute(sql`SELECT status, error_message FROM delivery_payment_webhooks WHERE provider_event_id = ${eventId}`);
    const wh = whRes.rows[0] as Record<string, unknown>;
    expect(wh.status).toBe("failed");
    expect(String(wh.error_message)).toContain("INTENT_NOT_FOUND");
  });
});
