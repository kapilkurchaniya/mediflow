/** Doorstep Delivery State Machine, Assignment Isolation & Proof Lifecycle (Lane A: A5.7.6) */
import crypto from "crypto";
import { sql, and, eq } from "drizzle-orm";
import { db as defaultDb } from "../../db";
import { deliveryOrders, deliveryEvents, deliveryProofs } from "../../db/schema/mobile";
import { memberships, roles } from "../../db/schema/platform";
import { sha256 } from "./auth";

const MAGIC_BYTES = {
  jpeg: [0xff, 0xd8, 0xff],
  png: [0x89, 0x50, 0x4e, 0x47],
  pdf: [0x25, 0x50, 0x44, 0x46],
};

function validateMagicBytes(buf: Buffer, mime: string): boolean {
  if (mime === "image/jpeg") {
    return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  }
  if (mime === "image/png") {
    return buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  }
  if (mime === "application/pdf") {
    return buf.length >= 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;
  }
  return false;
}

export async function assignDeliveryOrder(
  db: typeof defaultDb,
  input: {
    tenantId: string;
    deliveryOrderId: string;
    targetStaffUserId: string;
    actorUserId: string;
  },
) {
  return await db.transaction(async (tx) => {
    const orderRes = await tx.execute(sql`
      SELECT id, tenant_id, store_id, delivery_status, delivery_staff_user_id
      FROM delivery_orders
      WHERE id = ${input.deliveryOrderId}::uuid AND tenant_id = ${input.tenantId}::uuid
      FOR UPDATE
    `);
    const order = orderRes.rows[0] as Record<string, unknown> | undefined;
    if (!order) throw new Error("DELIVERY_ORDER_NOT_FOUND");
    if (order.delivery_status === "delivered") throw new Error("CANNOT_REASSIGN_DELIVERED_ORDER");

    // Validate target staff active membership and store access
    const staffRes = await tx.execute(sql`
      SELECT m.id, m.status, m.all_stores, m.store_ids, r.key as role_key
      FROM memberships m
      JOIN roles r ON m.role_id = r.id
      WHERE m.tenant_id = ${input.tenantId}::uuid AND m.user_id = ${input.targetStaffUserId}::uuid
    `);
    const staff = staffRes.rows[0] as Record<string, unknown> | undefined;
    if (!staff) throw new Error("STAFF_MEMBERSHIP_NOT_FOUND");
    if (staff.status !== "active") throw new Error("STAFF_MEMBERSHIP_SUSPENDED");
    const staffStoreIds = Array.isArray(staff.store_ids) ? (staff.store_ids as string[]) : [];
    if (!staff.all_stores && !staffStoreIds.includes(order.store_id as string)) {
      throw new Error("STAFF_STORE_ACCESS_DENIED");
    }

    const prevAssignee = (order.delivery_staff_user_id as string) || null;
    await tx.execute(sql`
      UPDATE delivery_orders
      SET delivery_staff_user_id = ${input.targetStaffUserId}::uuid,
          delivery_status = 'assigned'
      WHERE id = ${order.id as string}::uuid
    `);

    // Insert append-only event
    await tx.insert(deliveryEvents).values({
      tenantId: input.tenantId,
      deliveryOrderId: order.id as string,
      eventType: prevAssignee ? "reassigned" : "assigned",
      actorUserId: input.actorUserId,
      prevAssigneeId: prevAssignee,
      newAssigneeId: input.targetStaffUserId,
      fromStatus: order.delivery_status as string,
      toStatus: "assigned",
      metadata: { targetStaff: input.targetStaffUserId },
    });

    return { success: true, orderId: order.id as string, assignee: input.targetStaffUserId };
  });
}

export async function listAssignedDeliveries(
  db: typeof defaultDb,
  input: {
    tenantId: string;
    storeId?: string;
    deliveryStaffUserId: string;
    isManager: boolean;
  },
) {
  const staffFilter = input.isManager
    ? sql``
    : sql`AND d.delivery_staff_user_id = ${input.deliveryStaffUserId}::uuid`;
  const storeFilter = input.storeId ? sql`AND d.store_id = ${input.storeId}::uuid` : sql``;

  const res = await db.execute(sql`
    SELECT d.id, d.tenant_id, d.store_id, d.sale_id, d.delivery_staff_user_id,
           d.delivery_status, d.payment_status, d.delivery_address, d.recipient_name,
           d.recipient_phone, d.delivered_at, d.created_at,
           s.invoice_no, s.total_amount, s.paid_amount,
           u.name as staff_name
    FROM delivery_orders d
    JOIN sales s ON d.sale_id = s.id
    LEFT JOIN users u ON d.delivery_staff_user_id = u.id
    WHERE d.tenant_id = ${input.tenantId}::uuid
      ${staffFilter}
      ${storeFilter}
    ORDER BY d.created_at DESC
  `);
  return res.rows;
}

export async function transitionDeliveryOrder(
  db: typeof defaultDb,
  input: {
    tenantId: string;
    deliveryOrderId: string;
    toStatus: "in_transit" | "delivered" | "failed";
    actorUserId: string;
    notes?: string;
  },
) {
  return await db.transaction(async (tx) => {
    const orderRes = await tx.execute(sql`
      SELECT id, tenant_id, store_id, delivery_status, delivery_staff_user_id, payment_status
      FROM delivery_orders
      WHERE id = ${input.deliveryOrderId}::uuid AND tenant_id = ${input.tenantId}::uuid
      FOR UPDATE
    `);
    const order = orderRes.rows[0] as Record<string, unknown> | undefined;
    if (!order) throw new Error("DELIVERY_ORDER_NOT_FOUND");

    // Validate legal transition
    const curr = order.delivery_status as string;
    const next = input.toStatus;
    const isLegal =
      (curr === "assigned" && (next === "in_transit" || next === "failed")) ||
      (curr === "in_transit" && (next === "delivered" || next === "failed"));

    if (!isLegal) {
      throw new Error(`ILLEGAL_DELIVERY_TRANSITION: Cannot transition from '${curr}' to '${next}'`);
    }

    // If delivered, enforce completed proof existence
    if (next === "delivered") {
      const proofRes = await tx.execute(sql`
        SELECT id FROM delivery_proofs
        WHERE delivery_order_id = ${order.id}::uuid AND tenant_id = ${input.tenantId}::uuid
          AND upload_status = 'completed'
        LIMIT 1
      `);
      if (proofRes.rows.length === 0) {
        throw new Error("PROOF_REQUIRED: Transition to 'delivered' requires at least one completed delivery proof");
      }
    }

    const deliveredAt = next === "delivered" ? new Date() : null;

    if (deliveredAt) {
      await tx.execute(sql`
        UPDATE delivery_orders
        SET delivery_status = ${next},
            delivered_at = ${deliveredAt.toISOString()}::timestamptz
        WHERE id = ${order.id}::uuid
      `);
    } else {
      await tx.execute(sql`
        UPDATE delivery_orders
        SET delivery_status = ${next}
        WHERE id = ${order.id}::uuid
      `);
    }

    // Insert append-only event
    await tx.insert(deliveryEvents).values({
      tenantId: input.tenantId,
      deliveryOrderId: order.id as string,
      eventType: next,
      actorUserId: input.actorUserId,
      prevAssigneeId: (order.delivery_staff_user_id as string) || null,
      newAssigneeId: (order.delivery_staff_user_id as string) || null,
      fromStatus: curr,
      toStatus: next,
      metadata: { notes: input.notes || null },
    });

    return { success: true, orderId: order.id as string, fromStatus: curr, toStatus: next };
  });
}

export async function initiateProofUpload(
  db: typeof defaultDb,
  input: {
    tenantId: string;
    deliveryOrderId: string;
    proofType: "delivery_photo" | "recipient_signature";
    fileType: "image/jpeg" | "image/png" | "application/pdf";
    uploadedBy: string;
    idempotencyKey: string;
  },
) {
  const existing = await db
    .select()
    .from(deliveryProofs)
    .where(and(eq(deliveryProofs.tenantId, input.tenantId), eq(deliveryProofs.idempotencyKey, input.idempotencyKey)))
    .limit(1);

  if (existing[0]) return { proof: existing[0], replayed: true };

  const ext = input.fileType === "image/jpeg" ? "jpg" : input.fileType === "image/png" ? "png" : "pdf";
  const fileKey = `proofs/${input.tenantId}/${input.deliveryOrderId}/${crypto.randomUUID()}.${ext}`;

  const [proof] = await db
    .insert(deliveryProofs)
    .values({
      tenantId: input.tenantId,
      deliveryOrderId: input.deliveryOrderId,
      proofType: input.proofType,
      fileKey,
      fileType: input.fileType,
      fileSizeBytes: 1, // placeholder until completed
      checksumSha256: "pending",
      uploadStatus: "pending",
      idempotencyKey: input.idempotencyKey,
      uploadedBy: input.uploadedBy,
    })
    .returning();

  return { proof, replayed: false };
}

export async function completeProofUpload(
  db: typeof defaultDb,
  input: {
    tenantId: string;
    proofId: string;
    fileBuffer: Buffer;
    fileSizeBytes: number;
    fileType: "image/jpeg" | "image/png" | "application/pdf";
    actorUserId: string;
  },
) {
  if (input.fileSizeBytes <= 0 || input.fileSizeBytes > 10 * 1024 * 1024) {
    throw new Error("INVALID_FILE_SIZE: Proof file size must be between 1 byte and 10MB");
  }

  // Validate magic bytes against MIME type
  const isValidMagic = validateMagicBytes(input.fileBuffer, input.fileType);
  if (!isValidMagic) {
    throw new Error(`MIME_MAGIC_MISMATCH: File content magic bytes do not match declared MIME ${input.fileType}`);
  }

  const computedChecksum = crypto.createHash("sha256").update(input.fileBuffer).digest("hex");

  const [updated] = await db
    .update(deliveryProofs)
    .set({
      fileSizeBytes: input.fileSizeBytes,
      checksumSha256: computedChecksum,
      uploadStatus: "completed",
    })
    .where(and(eq(deliveryProofs.tenantId, input.tenantId), eq(deliveryProofs.id, input.proofId)))
    .returning();

  if (!updated) throw new Error("PROOF_NOT_FOUND");

  // Record proof_uploaded event
  await db.insert(deliveryEvents).values({
    tenantId: input.tenantId,
    deliveryOrderId: updated.deliveryOrderId,
    eventType: "proof_uploaded",
    actorUserId: input.actorUserId,
    fromStatus: "in_transit",
    toStatus: "in_transit",
    metadata: { proofId: updated.id, proofType: updated.proofType, checksum: computedChecksum },
  });

  return updated;
}
