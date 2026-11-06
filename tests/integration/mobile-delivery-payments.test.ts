/** Integration Tests for Delivery Operations, UPI Settlement & Dashboard (Lane A: A5.7.9) */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { db } from "../../src/server/db";
import {
  assignDeliveryOrder,
  listAssignedDeliveries,
  transitionDeliveryOrder,
  initiateProofUpload,
  completeProofUpload,
} from "../../src/server/domain/mobile/delivery";
import {
  createDeliveryUpiIntent,
  ingestRazorpayWebhook,
  collectCashForDelivery,
} from "../../src/server/domain/mobile/payments";
import { getMobileDashboardMetrics } from "../../src/server/domain/mobile/dashboard";

describe("Mobile Delivery, Settlement & Dashboard Suite", () => {
  let tenantId: string;
  let storeId: string;
  let ownerUserId: string;
  let staffUserId: string;
  let customerId: string;
  let saleId: string;
  let deliveryOrderId: string;
  let ownerEmail: string;
  let staffEmail: string;

  beforeAll(async () => {
    tenantId = crypto.randomUUID();
    storeId = crypto.randomUUID();
    ownerUserId = crypto.randomUUID();
    staffUserId = crypto.randomUUID();
    customerId = crypto.randomUUID();
    saleId = crypto.randomUUID();
    deliveryOrderId = crypto.randomUUID();
    ownerEmail = `deliv_owner_${tenantId.slice(0, 8)}@test.com`;
    staffEmail = `deliv_staff_${tenantId.slice(0, 8)}@test.com`;

    const pwHash = await bcrypt.hash("pass123", 4);

    await db.execute(sql`INSERT INTO tenants (id, name, legal_name) VALUES (${tenantId}::uuid, 'Deliv Tenant', 'Deliv Legal')`);
    await db.execute(sql`INSERT INTO stores (id, tenant_id, name, code, state_code) VALUES (${storeId}::uuid, ${tenantId}::uuid, 'Deliv Store', 'DEL1', 'MH')`);
    await db.execute(sql`INSERT INTO users (id, name, email, password_hash) VALUES (${ownerUserId}::uuid, 'Owner User', ${ownerEmail}, ${pwHash})`);
    await db.execute(sql`INSERT INTO users (id, name, email, password_hash) VALUES (${staffUserId}::uuid, 'Staff User', ${staffEmail}, ${pwHash})`);

    await db.execute(sql`INSERT INTO customers (id, tenant_id, name, phone) VALUES (${customerId}::uuid, ${tenantId}::uuid, 'Test Cust', '9876543210')`);

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
      INSERT INTO sales (id, tenant_id, store_id, invoice_no, status, total_amount, paid_amount, cost_amount, credit_amount, customer_id, created_by, completed_at)
      VALUES (${saleId}::uuid, ${tenantId}::uuid, ${storeId}::uuid, 'INV-DEL-1', 'completed', 100000, 0, 60000, 100000, ${customerId}::uuid, ${ownerUserId}::uuid, now())
    `);

    await db.execute(sql`
      INSERT INTO delivery_orders (id, tenant_id, store_id, sale_id, delivery_status, payment_status, delivery_address, recipient_name, recipient_phone)
      VALUES (${deliveryOrderId}::uuid, ${tenantId}::uuid, ${storeId}::uuid, ${saleId}::uuid, 'assigned', 'pending', '789 Road', 'Cust', '9876543210')
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
    await db.execute(sql`DELETE FROM sales WHERE tenant_id = ${tenantId}::uuid`);
    await db.execute(sql`DELETE FROM customers WHERE tenant_id = ${tenantId}::uuid`);
    await db.execute(sql`DELETE FROM memberships WHERE tenant_id = ${tenantId}::uuid`);
    await db.execute(sql`DELETE FROM roles WHERE tenant_id = ${tenantId}::uuid`);
    await db.execute(sql`DELETE FROM stores WHERE tenant_id = ${tenantId}::uuid`);
    await db.execute(sql`DELETE FROM users WHERE id IN (${ownerUserId}::uuid, ${staffUserId}::uuid)`);
    await db.execute(sql`DELETE FROM tenants WHERE id = ${tenantId}::uuid`);
    await db.execute(sql`SET session_replication_role = 'origin'`);
  });

  it("assigns order and enforces delivery staff isolation", async () => {
    await assignDeliveryOrder(db, {
      tenantId,
      deliveryOrderId,
      targetStaffUserId: staffUserId,
      actorUserId: ownerUserId,
    });

    const deliveries = await listAssignedDeliveries(db, {
      tenantId,
      storeId,
      deliveryStaffUserId: staffUserId,
      isManager: false,
    });
    expect(deliveries.length).toBe(1);
    expect(deliveries[0].id).toBe(deliveryOrderId);
  });

  it("enforces state machine and requires completed proof for delivered status", async () => {
    await expect(
      transitionDeliveryOrder(db, { tenantId, deliveryOrderId, toStatus: "delivered", actorUserId: staffUserId }),
    ).rejects.toThrow("ILLEGAL_DELIVERY_TRANSITION");

    await transitionDeliveryOrder(db, { tenantId, deliveryOrderId, toStatus: "in_transit", actorUserId: staffUserId });

    await expect(
      transitionDeliveryOrder(db, { tenantId, deliveryOrderId, toStatus: "delivered", actorUserId: staffUserId }),
    ).rejects.toThrow("PROOF_REQUIRED");

    const init = await initiateProofUpload(db, {
      tenantId,
      deliveryOrderId,
      proofType: "delivery_photo",
      fileType: "image/jpeg",
      uploadedBy: staffUserId,
      idempotencyKey: `proof_${Date.now()}`,
    });

    const validJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    await completeProofUpload(db, {
      tenantId,
      proofId: init.proof.id,
      fileBuffer: validJpeg,
      fileSizeBytes: validJpeg.length,
      fileType: "image/jpeg",
      actorUserId: staffUserId,
    });

    const delivRes = await transitionDeliveryOrder(db, { tenantId, deliveryOrderId, toStatus: "delivered", actorUserId: staffUserId });
    expect(delivRes.toStatus).toBe("delivered");
  });

  it("creates dynamic UPI QR intent and settles payment via Razorpay webhook", async () => {
    const intentRes = await createDeliveryUpiIntent(db, {
      tenantId,
      deliveryOrderId,
      actorUserId: staffUserId,
    });
    expect(intentRes.qrPayload).toContain("upi://pay");
    expect(intentRes.amountPaise).toBe(100000);

    const rawWebhook = JSON.stringify({
      event: "payment.captured",
      event_id: `evt_${Date.now()}`,
      payload: {
        payment: {
          entity: {
            id: `pay_${Date.now()}`,
            amount: 100000,
            currency: "INR",
            status: "captured",
            notes: { provider_order_ref: intentRes.intent.providerOrderRef, tenant_id: tenantId },
          },
        },
      },
    });
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || "mediflow_rzp_webhook_secret_test";
    const sig = crypto.createHmac("sha256", secret).update(rawWebhook).digest("hex");

    const webhookRes = await ingestRazorpayWebhook(db, {
      tenantId,
      rawBody: rawWebhook,
      signature: sig,
    });
    expect(webhookRes.received).toBe(true);

    const orderCheck = await db.execute(sql`SELECT payment_status FROM delivery_orders WHERE id = ${deliveryOrderId}::uuid`);
    expect((orderCheck.rows[0] as Record<string, unknown>).payment_status).toBe("verified");
  });

  it("calculates dashboard metrics separating gross sales, margin, and credit receivables", async () => {
    // 1. Check settled sale metrics
    const metrics1 = await getMobileDashboardMetrics(db, { tenantId, storeId });
    expect(metrics1.sales.grossSalesPaise).toBe(100000);
    expect(metrics1.sales.landedCostPaise).toBe(60000);
    expect(metrics1.sales.grossMarginPaise).toBe(40000);
    expect(metrics1.collections.digitalCollectionsPaise).toBe(100000);
    expect(metrics1.receivables.periodCreditSalesPaise).toBe(0);
    expect(metrics1.receivables.cumulativeOutstandingArPaise).toBe(0);

    // 2. Insert an unpaid credit sale to verify credit & AR calculations
    const creditSaleId = crypto.randomUUID();
    await db.execute(sql`
      INSERT INTO sales (id, tenant_id, store_id, invoice_no, status, total_amount, paid_amount, cost_amount, credit_amount, customer_id, created_by, completed_at)
      VALUES (${creditSaleId}::uuid, ${tenantId}::uuid, ${storeId}::uuid, 'INV-CRED-1', 'completed', 50000, 0, 30000, 50000, ${customerId}::uuid, ${ownerUserId}::uuid, now())
    `);

    const metrics2 = await getMobileDashboardMetrics(db, { tenantId, storeId });
    expect(metrics2.sales.grossSalesPaise).toBe(150000);
    expect(metrics2.receivables.periodCreditSalesPaise).toBe(50000);
    expect(metrics2.receivables.cumulativeOutstandingArPaise).toBe(50000);
  });

  it("rejects proof upload completion when file magic bytes do not match declared MIME", async () => {
    const proofInit = await initiateProofUpload(db, {
      tenantId,
      deliveryOrderId,
      proofType: "delivery_photo",
      fileType: "image/jpeg",
      uploadedBy: staffUserId,
      idempotencyKey: `bad_magic_${Date.now()}`,
    });

    // Plain text buffer purporting to be JPEG
    const invalidBuffer = Buffer.from("<html><body>Malicious HTML File</body></html>");

    await expect(
      completeProofUpload(db, {
        tenantId,
        proofId: proofInit.proof.id,
        fileBuffer: invalidBuffer,
        fileSizeBytes: invalidBuffer.length,
        fileType: "image/jpeg",
        actorUserId: staffUserId,
      }),
    ).rejects.toThrow("MIME_MAGIC_MISMATCH");
  });

  it("records doorstep cash collection via postPayment and updates payment status", async () => {
    const cashSaleId = crypto.randomUUID();
    const cashDeliveryId = crypto.randomUUID();

    await db.execute(sql`
      INSERT INTO sales (id, tenant_id, store_id, invoice_no, status, total_amount, paid_amount, cost_amount, credit_amount, customer_id, created_by, completed_at)
      VALUES (${cashSaleId}::uuid, ${tenantId}::uuid, ${storeId}::uuid, 'INV-CASH-1', 'completed', 35000, 0, 20000, 35000, ${customerId}::uuid, ${ownerUserId}::uuid, now())
    `);
    await db.execute(sql`
      INSERT INTO delivery_orders (id, tenant_id, store_id, sale_id, delivery_status, payment_status, delivery_address, recipient_name, recipient_phone)
      VALUES (${cashDeliveryId}::uuid, ${tenantId}::uuid, ${storeId}::uuid, ${cashSaleId}::uuid, 'in_transit', 'pending', '12 Cash Lane', 'Cash Buyer', '9876543210')
    `);

    const cashRes = await collectCashForDelivery(db, {
      tenantId,
      deliveryOrderId: cashDeliveryId,
      amountPaise: 35000,
      actorUserId: staffUserId,
    });
    expect(cashRes.success).toBe(true);
    expect(cashRes.paymentStatus).toBe("collected");

    const orderRow = await db.execute(sql`SELECT payment_status FROM delivery_orders WHERE id = ${cashDeliveryId}::uuid`);
    expect((orderRow.rows[0] as Record<string, unknown>).payment_status).toBe("collected");

    const payRow = await db.execute(sql`SELECT amount, method FROM payments WHERE tenant_id = ${tenantId}::uuid AND method = 'cash' ORDER BY created_at DESC LIMIT 1`);
    expect(Number((payRow.rows[0] as Record<string, unknown>).amount)).toBe(35000);
  });

  it("strictly prohibits illegal backward transitions in delivery state machine", async () => {
    // Attempting to move delivered order back to in_transit
    await expect(
      transitionDeliveryOrder(db, {
        tenantId,
        deliveryOrderId,
        toStatus: "in_transit",
        actorUserId: staffUserId,
      }),
    ).rejects.toThrow("ILLEGAL_DELIVERY_TRANSITION");
  });
});
