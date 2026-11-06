/** Razorpay UPI QR Generation, Durable Webhook Ingestion & Two-Transaction Settlement (Lane A: A5.7.7) */
import crypto from "crypto";
import { format } from "date-fns";
import { sql, and, eq } from "drizzle-orm";
import { db as defaultDb } from "../../db";
import { deliveryOrders, deliveryPaymentIntents, deliveryPaymentWebhooks, deliveryEvents } from "../../db/schema/mobile";
import { postPayment } from "../payments";
import { sha256 } from "./auth";
import type { AuthCtx } from "../../rbac";
import { createRazorpayQrCode, verifyRazorpaySignature } from "./razorpay-client";

export { verifyRazorpaySignature };

const makePaymentAuthCtx = (tenantId: string, storeId: string, userId: string): AuthCtx => ({
  tenantId, storeId, userId,
  user: { id: userId, name: "Payment Worker", email: "payment@mediflow.internal", pharmacistRegNo: null },
  permissions: new Set(["accounting.post", "sale.create", "sale.view"] as const),
  allowedStoreIds: "all",
});

export async function createDeliveryUpiIntent(
  db: typeof defaultDb,
  input: {
    tenantId: string;
    deliveryOrderId: string;
    actorUserId: string;
  },
) {
  const orderRes = await db.execute(sql`
    SELECT d.id, d.tenant_id, d.store_id, d.sale_id, d.payment_status,
           s.invoice_no, s.total_amount, s.paid_amount, s.customer_id, s.customer_name
    FROM delivery_orders d
    JOIN sales s ON d.sale_id = s.id
    WHERE d.id = ${input.deliveryOrderId}::uuid AND d.tenant_id = ${input.tenantId}::uuid
  `);
  const order = orderRes.rows[0] as Record<string, unknown> | undefined;
  if (!order) throw new Error("DELIVERY_ORDER_NOT_FOUND");
  if (order.payment_status === "verified") throw new Error("PAYMENT_ALREADY_VERIFIED");

  const outstandingPaise = Math.max(0, Number(order.total_amount) - Number(order.paid_amount));
  if (outstandingPaise <= 0) throw new Error("NO_OUTSTANDING_BALANCE: Order is already fully paid");

  const orderIdStr = order.id as string;
  const orderRef = `MPAY-${orderIdStr.slice(0, 8)}-${Date.now()}`;
  const invoiceNo = (order.invoice_no as string) || orderIdStr.slice(0, 8);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
  const closeByEpoch = Math.floor(expiresAt.getTime() / 1000);

  // Invoke authentic Razorpay Payments QR Code API (POST /v1/payments/qr_codes)
  const qrRes = await createRazorpayQrCode({
    amountPaise: outstandingPaise,
    orderRef,
    description: `Order ${invoiceNo}`,
    closeByEpochSeconds: closeByEpoch,
    notes: { tenant_id: input.tenantId, delivery_order_id: orderIdStr, provider_order_ref: orderRef },
  });

  const [intent] = await db
    .insert(deliveryPaymentIntents)
    .values({
      tenantId: input.tenantId,
      deliveryOrderId: orderIdStr,
      provider: "razorpay",
      providerQrId: qrRes.id,
      providerOrderRef: qrRes.providerOrderRef,
      amountPaise: outstandingPaise,
      qrPayload: qrRes.qrPayload,
      status: "pending",
      expiresAt,
    })
    .returning();

  await db
    .update(deliveryOrders)
    .set({ paymentStatus: "intent_created" })
    .where(eq(deliveryOrders.id, orderIdStr));

  return { intent, qrPayload: qrRes.qrPayload, amountPaise: outstandingPaise, expiresAt };
}

export async function ingestRazorpayWebhook(
  db: typeof defaultDb,
  input: {
    tenantId: string;
    rawBody: string;
    signature: string;
  },
) {
  const isValid = verifyRazorpaySignature(input.rawBody, input.signature);
  if (!isValid) throw new Error("INVALID_WEBHOOK_SIGNATURE: HMAC-SHA256 signature mismatch");

  const payload = JSON.parse(input.rawBody);
  const eventId = String(payload.event_id || payload.id || crypto.randomUUID());
  const eventType = String(payload.event || "payment.captured");
  const payloadHash = sha256(input.rawBody);

  const paymentEntity = payload.payload?.payment?.entity || payload.payment?.entity;
  const providerPaymentId = paymentEntity?.id ? String(paymentEntity.id) : null;

  // Insert into durable inbox deduplicating on (provider, provider_event_id)
  const [ingested] = await db
    .insert(deliveryPaymentWebhooks)
    .values({
      tenantId: input.tenantId,
      provider: "razorpay",
      providerEventId: eventId,
      providerPaymentId,
      eventType,
      payloadSha256: payloadHash,
      payload,
      status: "pending",
    })
    .onConflictDoNothing()
    .returning();

  const webhookId = ingested ? ingested.id : (await db.query.deliveryPaymentWebhooks.findFirst({
    where: and(eq(deliveryPaymentWebhooks.provider, "razorpay"), eq(deliveryPaymentWebhooks.providerEventId, eventId)),
  }))?.id;

  if (webhookId) {
    await processRazorpayWebhook(db, { tenantId: input.tenantId, webhookId });
  }

  return { received: true, eventId };
}

export async function processRazorpayWebhook(
  db: typeof defaultDb,
  input: { tenantId: string; webhookId: string },
) {
  // Claim lease
  const claimRes = await db.execute(sql`
    UPDATE delivery_payment_webhooks
    SET status = 'processing',
        lease_expires_at = now() + interval '60 seconds'
    WHERE id = ${input.webhookId}::uuid
      AND status IN ('pending', 'failed')
      AND (lease_expires_at IS NULL OR lease_expires_at < now())
    RETURNING *
  `);
  const webhook = claimRes.rows[0] as Record<string, unknown> | undefined;
  if (!webhook) return { processed: false, reason: "ALREADY_PROCESSED_OR_LEASED" };

  let settlementSuccess = false;
  let settlementError: string | null = null;

  try {
    // SETTLEMENT TRANSACTION (TX 1)
    await db.transaction(async (tx) => {
      const raw = (webhook.payload || {}) as Record<string, unknown>;
      const nested = (raw.payload || raw) as Record<string, Record<string, unknown>>;
      const paymentEntity = (nested.payment?.entity || {}) as Record<string, unknown>;
      const qrEnt = (nested.qr_code?.entity || {}) as Record<string, unknown>;
      const pNotes = (paymentEntity.notes || {}) as Record<string, unknown>;
      const qrNotes = (qrEnt.notes || {}) as Record<string, unknown>;
      const orderRef = (pNotes.provider_order_ref || qrNotes.provider_order_ref) as string;
      const providerQrId = (qrEnt.id || paymentEntity.qr_code_id) as string;
      const providerPaymentId = (paymentEntity.id || webhook.provider_payment_id || `pay_${crypto.randomUUID()}`) as string;

      const intentRes = await tx.execute(sql`
        SELECT i.id, i.tenant_id, i.delivery_order_id, i.amount_paise, i.status,
               d.store_id, d.sale_id,
               s.customer_id, s.total_amount, s.paid_amount
        FROM delivery_payment_intents i
        JOIN delivery_orders d ON i.delivery_order_id = d.id
        JOIN sales s ON d.sale_id = s.id
        WHERE (i.provider_order_ref = ${orderRef || ""} OR i.provider_qr_id = ${providerQrId || ""})
          AND i.tenant_id = ${input.tenantId}::uuid
        FOR UPDATE OF i
      `);
      const intent = intentRes.rows[0] as Record<string, unknown> | undefined;
      if (!intent) throw new Error("INTENT_NOT_FOUND");
      if (intent.status === "verified") return; // already settled

      const paidPaise = Number(paymentEntity.amount || intent.amount_paise);
      if (paymentEntity.currency && paymentEntity.currency !== "INR") {
        throw new Error(`UNSUPPORTED_CURRENCY: Expected INR, got ${paymentEntity.currency}`);
      }
      if (paymentEntity.amount && Number(paymentEntity.amount) !== Number(intent.amount_paise)) {
        throw new Error(`AMOUNT_MISMATCH: Expected ${intent.amount_paise}, got ${paymentEntity.amount}`);
      }

      await postPayment(
        tx as unknown as Parameters<typeof postPayment>[0],
        makePaymentAuthCtx(intent.tenant_id as string, intent.store_id as string, (intent.customer_id as string) || (intent.tenant_id as string)),
        {
          direction: "in",
          partyType: "customer",
          partyId: intent.customer_id as string,
          amount: paidPaise,
          method: "upi",
          paymentDate: format(new Date(), "yyyy-MM-dd"),
          reference: providerPaymentId.slice(0, 64),
          note: `Doorstep delivery UPI payment via Razorpay (${providerPaymentId})`,
          allocations: [{ refType: "sale", refId: intent.sale_id as string, amount: paidPaise }],
        },
      );

      // Atomically update intent, order, and webhook status in TX 1
      await tx.execute(sql`
        UPDATE delivery_payment_intents
        SET status = 'verified', verified_at = now(), provider_payment_id = ${providerPaymentId}
        WHERE id = ${intent.id}::uuid
      `);
      await tx.execute(sql`
        UPDATE delivery_orders
        SET payment_status = 'verified'
        WHERE id = ${intent.delivery_order_id}::uuid
      `);
      await tx.execute(sql`
        UPDATE delivery_payment_webhooks
        SET status = 'processed', processed_at = now(), lease_expires_at = NULL
        WHERE id = ${webhook.id}::uuid
      `);

      settlementSuccess = true;
    });
  } catch (err: unknown) {
    settlementError = (err as Error)?.message || "Settlement failed";
  }

  // ERROR RECOVERY TRANSACTION (TX 2) - Executed only if TX 1 rolled back
  if (!settlementSuccess && settlementError) {
    await db.execute(sql`
      UPDATE delivery_payment_webhooks
      SET status = 'failed',
          error_message = ${settlementError},
          retry_count = retry_count + 1,
          lease_expires_at = NULL
      WHERE id = ${webhook.id}::uuid
    `);
    return { processed: false, error: settlementError };
  }

  return { processed: true };
}

export async function collectCashForDelivery(
  db: typeof defaultDb,
  input: {
    tenantId: string;
    deliveryOrderId: string;
    amountPaise: number;
    actorUserId: string;
  },
) {
  return await db.transaction(async (tx) => {
    const orderRes = await tx.execute(sql`
      SELECT d.id, d.tenant_id, d.store_id, d.sale_id, d.payment_status,
             s.customer_id, s.total_amount, s.paid_amount
      FROM delivery_orders d
      JOIN sales s ON d.sale_id = s.id
      WHERE d.id = ${input.deliveryOrderId}::uuid AND d.tenant_id = ${input.tenantId}::uuid
      FOR UPDATE
    `);
    const order = orderRes.rows[0] as Record<string, unknown> | undefined;
    if (!order) throw new Error("DELIVERY_ORDER_NOT_FOUND");

    // Post cash payment via postPayment
    await postPayment(
      tx as unknown as Parameters<typeof postPayment>[0],
      makePaymentAuthCtx(order.tenant_id as string, order.store_id as string, input.actorUserId),
      {
        direction: "in",
        partyType: "customer",
        partyId: order.customer_id as string,
        amount: input.amountPaise,
        method: "cash",
        paymentDate: format(new Date(), "yyyy-MM-dd"),
        note: `Doorstep cash collection by staff: ${input.actorUserId}`,
        allocations: [{ refType: "sale", refId: order.sale_id as string, amount: input.amountPaise }],
      },
    );

    await tx.execute(sql`
      UPDATE delivery_orders
      SET payment_status = 'collected'
      WHERE id = ${order.id as string}::uuid
    `);

    await tx.insert(deliveryEvents).values({
      tenantId: input.tenantId,
      deliveryOrderId: order.id as string,
      eventType: "proof_uploaded",
      actorUserId: input.actorUserId,
      fromStatus: "in_transit",
      toStatus: "in_transit",
      metadata: { cashCollectedPaise: input.amountPaise },
    });

    return { success: true, paymentStatus: "collected", collectedPaise: input.amountPaise };
  });
}
