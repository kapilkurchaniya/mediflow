import { db, schema, type Tx, type DbOrTx } from "@/server/db";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { DomainError } from "@/server/errors";
import { writeAudit } from "@/server/audit";
import { nextDocNumber } from "@/server/domain/sequence";
import type { AuthCtx } from "@/server/rbac";
import { z } from "zod";

export const PurchaseOrderItemInputSchema = z.object({
  medicineId: z.string().uuid("Invalid medicine ID"),
  qty: z.number().int().positive("Quantity must be positive"),
  freeQty: z.number().int().min(0, "Free quantity cannot be negative").default(0),
  rate: z.number().int().min(0, "Rate in paise cannot be negative"), // Expected purchase rate in paise
});

export const CreatePurchaseOrderSchema = z.object({
  supplierId: z.string().uuid("Invalid supplier ID"),
  expectedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected date must be YYYY-MM-DD").optional(),
  notes: z.string().max(500).optional(),
  items: z.array(PurchaseOrderItemInputSchema).min(1, "At least one item is required"),
});

export type CreatePurchaseOrderInput = z.infer<typeof CreatePurchaseOrderSchema>;

export interface PurchaseOrderDetail {
  id: string;
  poNo: string;
  supplierId: string;
  supplierName: string;
  supplierGstin: string | null;
  supplierPhone: string | null;
  supplierEmail: string | null;
  supplierAddress: string | null;
  status: "draft" | "approved" | "sent" | "partially_received" | "received" | "cancelled";
  expectedDate: string | null;
  notes: string | null;
  estimatedTotal: number;
  createdBy: string;
  createdByName?: string;
  approvedBy: string | null;
  approvedByName?: string;
  approvedAt: Date | null;
  createdAt: Date;
  items: {
    id: string;
    medicineId: string;
    medicineName: string;
    genericName: string | null;
    hsnCode: string | null;
    packSize: string | null;
    qty: number;
    freeQty: number;
    rate: number;
    receivedQty: number;
  }[];
}

/**
 * Creates a new Purchase Order in "draft" status.
 */
export async function createPurchaseOrder(
  tx: Tx,
  ctx: AuthCtx,
  rawInput: CreatePurchaseOrderInput
): Promise<{ id: string; poNo: string }> {
  const input = CreatePurchaseOrderSchema.parse(rawInput);

  // 1. Verify supplier belongs to this tenant
  const [supplier] = await tx
    .select({ id: schema.suppliers.id, name: schema.suppliers.name })
    .from(schema.suppliers)
    .where(and(eq(schema.suppliers.id, input.supplierId), eq(schema.suppliers.tenantId, ctx.tenantId)))
    .limit(1);

  if (!supplier) {
    throw new DomainError("SUPPLIER_NOT_FOUND", "Supplier does not exist or does not belong to this pharmacy");
  }

  // 2. Validate all medicines belong to tenant
  const medIds = input.items.map((i) => i.medicineId);
  const foundMeds = await tx
    .select({ id: schema.medicines.id })
    .from(schema.medicines)
    .where(and(eq(schema.medicines.tenantId, ctx.tenantId), inArray(schema.medicines.id, medIds)));

  if (foundMeds.length !== medIds.length) {
    throw new DomainError("INVALID_MEDICINES", "One or more medicines were not found");
  }

  // 3. Compute estimated total (paise)
  const estimatedTotal = input.items.reduce((sum, item) => sum + item.qty * item.rate, 0);

  // 4. Generate gap-free sequential PO number
  const poNo = await nextDocNumber(tx, ctx.tenantId, ctx.storeId, "purchase_order", "PO");

  // 5. Insert PO header
  const [po] = await tx
    .insert(schema.purchaseOrders)
    .values({
      tenantId: ctx.tenantId,
      storeId: ctx.storeId,
      poNo,
      supplierId: input.supplierId,
      status: "draft",
      expectedDate: input.expectedDate || null,
      notes: input.notes?.trim() || null,
      estimatedTotal,
      createdBy: ctx.userId,
    })
    .returning({ id: schema.purchaseOrders.id });

  // 6. Insert PO items
  await tx.insert(schema.purchaseOrderItems).values(
    input.items.map((item) => ({
      tenantId: ctx.tenantId,
      purchaseOrderId: po.id,
      medicineId: item.medicineId,
      qty: item.qty,
      freeQty: item.freeQty,
      rate: item.rate,
      receivedQty: 0,
    }))
  );

  // 7. Link any pending promise orders for these medicines to this PO
  await tx
    .update(schema.promiseOrders)
    .set({
      purchaseOrderId: po.id,
      status: "ordered",
    })
    .where(
      and(
        eq(schema.promiseOrders.tenantId, ctx.tenantId),
        eq(schema.promiseOrders.storeId, ctx.storeId),
        inArray(schema.promiseOrders.medicineId, medIds),
        eq(schema.promiseOrders.status, "pending")
      )
    );

  // 8. Write audit log
  await writeAudit(tx, ctx, {
    action: "create",
    entityType: "purchase_order",
    entityId: po.id,
    newValue: { poNo, supplierId: input.supplierId, estimatedTotal, itemsCount: input.items.length },
    reason: `Created purchase order ${poNo} for ${supplier.name}`,
  });

  return { id: po.id, poNo };
}

/**
 * Approves a draft Purchase Order.
 */
export async function approvePurchaseOrder(
  tx: Tx,
  ctx: AuthCtx,
  poId: string
): Promise<{ success: boolean; poNo: string }> {
  const [po] = await tx
    .select()
    .from(schema.purchaseOrders)
    .where(and(eq(schema.purchaseOrders.id, poId), eq(schema.purchaseOrders.tenantId, ctx.tenantId)))
    .limit(1);

  if (!po) throw new DomainError("PO_NOT_FOUND", "Purchase Order not found");
  if (po.status !== "draft") {
    throw new DomainError("INVALID_PO_STATUS", `Only draft purchase orders can be approved (current: ${po.status})`);
  }

  await tx
    .update(schema.purchaseOrders)
    .set({
      status: "approved",
      approvedBy: ctx.userId,
      approvedAt: new Date(),
    })
    .where(eq(schema.purchaseOrders.id, po.id));

  await writeAudit(tx, ctx, {
    action: "update",
    entityType: "purchase_order",
    entityId: po.id,
    oldValue: { status: "draft" },
    newValue: { status: "approved", approvedBy: ctx.userId },
    reason: `Approved purchase order ${po.poNo}`,
  });

  return { success: true, poNo: po.poNo };
}

/**
 * Marks an approved PO as sent to the supplier.
 */
export async function markPurchaseOrderSent(
  tx: Tx,
  ctx: AuthCtx,
  poId: string
): Promise<{ success: boolean; poNo: string }> {
  const [po] = await tx
    .select()
    .from(schema.purchaseOrders)
    .where(and(eq(schema.purchaseOrders.id, poId), eq(schema.purchaseOrders.tenantId, ctx.tenantId)))
    .limit(1);

  if (!po) throw new DomainError("PO_NOT_FOUND", "Purchase Order not found");
  if (po.status !== "approved" && po.status !== "draft") {
    throw new DomainError("INVALID_PO_STATUS", `Cannot mark PO as sent from status: ${po.status}`);
  }

  await tx
    .update(schema.purchaseOrders)
    .set({
      status: "sent",
    })
    .where(eq(schema.purchaseOrders.id, po.id));

  await writeAudit(tx, ctx, {
    action: "update",
    entityType: "purchase_order",
    entityId: po.id,
    oldValue: { status: po.status },
    newValue: { status: "sent" },
    reason: `Marked purchase order ${po.poNo} as sent`,
  });

  return { success: true, poNo: po.poNo };
}

/**
 * Cancels a Purchase Order.
 */
export async function cancelPurchaseOrder(
  tx: Tx,
  ctx: AuthCtx,
  poId: string,
  reason: string
): Promise<{ success: boolean; poNo: string }> {
  if (!reason?.trim()) {
    throw new DomainError("REASON_REQUIRED", "A reason is required to cancel a purchase order");
  }

  const [po] = await tx
    .select()
    .from(schema.purchaseOrders)
    .where(and(eq(schema.purchaseOrders.id, poId), eq(schema.purchaseOrders.tenantId, ctx.tenantId)))
    .limit(1);

  if (!po) throw new DomainError("PO_NOT_FOUND", "Purchase Order not found");
  if (po.status === "received" || po.status === "partially_received") {
    throw new DomainError("CANNOT_CANCEL_RECEIVED", "Cannot cancel a purchase order that has already been received");
  }
  if (po.status === "cancelled") {
    return { success: true, poNo: po.poNo };
  }

  await tx
    .update(schema.purchaseOrders)
    .set({
      status: "cancelled",
      notes: po.notes ? `${po.notes}\n[Cancelled]: ${reason}` : `[Cancelled]: ${reason}`,
    })
    .where(eq(schema.purchaseOrders.id, po.id));

  // If any promise orders were linked to this PO, reset them back to pending
  await tx
    .update(schema.promiseOrders)
    .set({
      purchaseOrderId: null,
      status: "pending",
    })
    .where(
      and(
        eq(schema.promiseOrders.tenantId, ctx.tenantId),
        eq(schema.promiseOrders.purchaseOrderId, po.id),
        eq(schema.promiseOrders.status, "ordered")
      )
    );

  await writeAudit(tx, ctx, {
    action: "cancel",
    entityType: "purchase_order",
    entityId: po.id,
    oldValue: { status: po.status },
    newValue: { status: "cancelled", cancelReason: reason },
    reason: `Cancelled purchase order ${po.poNo}: ${reason}`,
  });

  return { success: true, poNo: po.poNo };
}

/**
 * Retrieves a detailed Purchase Order with items and supplier info.
 */
export async function getPurchaseOrderById(
  dbOrTx: DbOrTx,
  tenantId: string,
  poId: string
): Promise<PurchaseOrderDetail | null> {
  const [po] = await dbOrTx
    .select({
      po: schema.purchaseOrders,
      supplier: schema.suppliers,
      creator: { id: schema.users.id, name: schema.users.name },
    })
    .from(schema.purchaseOrders)
    .innerJoin(schema.suppliers, eq(schema.purchaseOrders.supplierId, schema.suppliers.id))
    .innerJoin(schema.users, eq(schema.purchaseOrders.createdBy, schema.users.id))
    .where(and(eq(schema.purchaseOrders.id, poId), eq(schema.purchaseOrders.tenantId, tenantId)))
    .limit(1);

  if (!po) return null;

  let approverName: string | undefined;
  if (po.po.approvedBy) {
    const [approver] = await dbOrTx
      .select({ name: schema.users.name })
      .from(schema.users)
      .where(eq(schema.users.id, po.po.approvedBy))
      .limit(1);
    approverName = approver?.name;
  }

  const items = await dbOrTx
    .select({
      item: schema.purchaseOrderItems,
      med: schema.medicines,
    })
    .from(schema.purchaseOrderItems)
    .innerJoin(schema.medicines, eq(schema.purchaseOrderItems.medicineId, schema.medicines.id))
    .where(eq(schema.purchaseOrderItems.purchaseOrderId, po.po.id));

  return {
    id: po.po.id,
    poNo: po.po.poNo,
    supplierId: po.supplier.id,
    supplierName: po.supplier.name,
    supplierGstin: po.supplier.gstin,
    supplierPhone: po.supplier.phone,
    supplierEmail: po.supplier.email,
    supplierAddress: po.supplier.address,
    status: po.po.status as PurchaseOrderDetail["status"],
    expectedDate: po.po.expectedDate,
    notes: po.po.notes,
    estimatedTotal: po.po.estimatedTotal || 0,
    createdBy: po.po.createdBy,
    createdByName: po.creator.name,
    approvedBy: po.po.approvedBy,
    approvedByName: approverName,
    approvedAt: po.po.approvedAt,
    createdAt: po.po.createdAt,
    items: items.map((i) => ({
      id: i.item.id,
      medicineId: i.item.medicineId,
      medicineName: i.med.name,
      genericName: i.med.genericName,
      hsnCode: i.med.hsn,
      packSize: i.med.packSize,
      qty: i.item.qty,
      freeQty: i.item.freeQty,
      rate: i.item.rate || 0,
      receivedQty: i.item.receivedQty,
    })),
  };
}

/**
 * Lists purchase orders for a store with filtering.
 */
export async function listPurchaseOrders(
  dbOrTx: DbOrTx,
  tenantId: string,
  storeId?: string | null,
  filters?: {
    status?: string;
    supplierId?: string;
    limit?: number;
    offset?: number;
  }
) {
  const conditions = [eq(schema.purchaseOrders.tenantId, tenantId)];

  if (storeId) {
    conditions.push(eq(schema.purchaseOrders.storeId, storeId));
  }
  if (filters?.status && filters.status !== "all") {
    conditions.push(eq(schema.purchaseOrders.status, filters.status));
  }
  if (filters?.supplierId) {
    conditions.push(eq(schema.purchaseOrders.supplierId, filters.supplierId));
  }

  const rows = await dbOrTx
    .select({
      id: schema.purchaseOrders.id,
      poNo: schema.purchaseOrders.poNo,
      status: schema.purchaseOrders.status,
      expectedDate: schema.purchaseOrders.expectedDate,
      estimatedTotal: schema.purchaseOrders.estimatedTotal,
      createdAt: schema.purchaseOrders.createdAt,
      supplierName: schema.suppliers.name,
      supplierPhone: schema.suppliers.phone,
      itemsCount: sql<number>`count(${schema.purchaseOrderItems.id})::int`,
    })
    .from(schema.purchaseOrders)
    .innerJoin(schema.suppliers, eq(schema.purchaseOrders.supplierId, schema.suppliers.id))
    .leftJoin(schema.purchaseOrderItems, eq(schema.purchaseOrders.id, schema.purchaseOrderItems.purchaseOrderId))
    .where(and(...conditions))
    .groupBy(
      schema.purchaseOrders.id,
      schema.purchaseOrders.poNo,
      schema.purchaseOrders.status,
      schema.purchaseOrders.expectedDate,
      schema.purchaseOrders.estimatedTotal,
      schema.purchaseOrders.createdAt,
      schema.suppliers.name,
      schema.suppliers.phone
    )
    .orderBy(desc(schema.purchaseOrders.createdAt))
    .limit(filters?.limit || 50)
    .offset(filters?.offset || 0);

  return rows;
}

