/**
 * Held (parked) bills domain service (ROADMAP Task A2.3).
 *
 * Allows cashiers to park an active cart when a customer steps away,
 * serving the next customer in queue immediately.
 *
 * Rules:
 * - A held bill does NOT allocate an invoice number (remains null).
 * - A held bill does NOT deduct stock or post to the general ledger.
 * - Stores complete cart payload: packaging conversion (A2.10), Auto-FEFO metadata (A2.11),
 *   customer, doctor, and prescription details.
 * - On resume, re-validates batch stock and expiry against current live inventory.
 * - Deletes the held row upon final sale completion (or marks cancelled if discarded).
 * - Warns if a bill has been parked for > 24 hours.
 */

import { eq, and, desc } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import type { Tx } from "@/server/db";
import type { AuthCtx } from "@/server/rbac";
import { DomainError } from "@/server/errors";
import { writeAudit } from "@/server/audit";
import { computeSaleTotals } from "@/lib/money";
import { format } from "date-fns";
import { canStoreParkBills } from "@/server/domain/stores/policies";
import {
  HeldSaleItemSchema,
  HoldSaleInputSchema,
  type HeldSaleItem,
  type HoldSaleInput,
  type HeldSalePayload,
  type RevalidatedHeldItem,
  type ResumeHeldSaleResult,
} from "./held-types";

export {
  HeldSaleItemSchema,
  HoldSaleInputSchema,
  type HeldSaleItem,
  type HoldSaleInput,
  type HeldSalePayload,
  type RevalidatedHeldItem,
  type ResumeHeldSaleResult,
};

/**
 * Parks the current POS cart as a held sale.
 */
export async function holdSale(tx: Tx, ctx: AuthCtx, input: HoldSaleInput) {
  // Validate store capabilities (warehouse cannot park retail counter bills)
  const [store] = await tx
    .select({ kind: schema.stores.kind, isActive: schema.stores.isActive })
    .from(schema.stores)
    .where(and(eq(schema.stores.id, ctx.storeId), eq(schema.stores.tenantId, ctx.tenantId)))
    .limit(1);

  if (!store || !canStoreParkBills(store)) {
    throw new DomainError(
      "WAREHOUSE_POS_NOT_ALLOWED",
      store?.kind === "warehouse"
        ? "Counter bills cannot be parked in a warehouse store."
        : "Counter bills cannot be parked in an inactive store.",
    );
  }

  const parsed = HoldSaleInputSchema.parse(input);

  // Compute bill totals from lines (without stock deduction)
  const lineInputs = parsed.items.map((i) => ({
    packQty: i.packQty,
    looseQty: i.looseQty,
    unitsPerPack: i.unitsPerPack,
    rate: i.rate,
    discountBp: i.discountBp,
    gstRateBp: i.gstRateBp,
  }));

  const totals = computeSaleTotals(lineInputs, false, 0);

  const payload: HeldSalePayload = {
    ...parsed,
    heldAt: new Date().toISOString(),
  };

  const [sale] = await tx
    .insert(schema.sales)
    .values({
      tenantId: ctx.tenantId,
      storeId: ctx.storeId,
      status: "held",
      invoiceNo: null,
      customerId: parsed.customerId || null,
      customerName: parsed.customerName || null,
      customerPhone: parsed.customerPhone || null,
      doctorName: parsed.doctorName || null,
      doctorRegNo: parsed.doctorRegNo || null,
      doctorAddress: parsed.doctorAddress || null,
      patientAge: parsed.patientAge ?? null,
      patientGender: parsed.patientGender || null,
      patientAddress: parsed.patientAddress || null,
      prescriptionRef: parsed.prescriptionRef || null,
      prescriptionId: parsed.prescriptionId || null,
      grossAmount: totals.gross,
      discountAmount: totals.discount,
      taxableAmount: totals.taxable,
      cgst: totals.cgst,
      sgst: totals.sgst,
      igst: totals.igst,
      roundOff: totals.roundOff,
      totalAmount: totals.total,
      heldPayload: payload,
      notes: parsed.notes || null,
      createdBy: ctx.userId,
    })
    .returning();

  await writeAudit(tx, ctx, {
    action: "create",
    entityType: "held_sale",
    entityId: sale.id,
    newValue: {
      itemCount: parsed.items.length,
      totalAmount: totals.total,
      notes: parsed.notes,
    },
    reason: parsed.notes || "Customer stepped away (F6 park)",
  });

  return {
    heldSaleId: sale.id,
    itemCount: parsed.items.length,
    totalAmount: totals.total,
  };
}

/**
 * Lists all active held sales for the store.
 */
export async function listHeldSales(tx: Tx, ctx: AuthCtx) {
  const rows = await tx
    .select({
      sale: schema.sales,
      cashier: schema.users,
    })
    .from(schema.sales)
    .leftJoin(schema.users, eq(schema.sales.createdBy, schema.users.id))
    .where(
      and(
        eq(schema.sales.tenantId, ctx.tenantId),
        eq(schema.sales.storeId, ctx.storeId),
        eq(schema.sales.status, "held")
      )
    )
    .orderBy(desc(schema.sales.createdAt));

  const now = Date.now();
  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

  return rows.map(({ sale, cashier }) => {
    const payload = (sale.heldPayload as HeldSalePayload) || { items: [] };
    const createdAtTime = new Date(sale.createdAt).getTime();
    const isOlderThan24h = now - createdAtTime > TWENTY_FOUR_HOURS_MS;

    return {
      id: sale.id,
      customerName: sale.customerName || "Walk-in Customer",
      customerPhone: sale.customerPhone || null,
      doctorName: sale.doctorName || null,
      itemCount: payload.items?.length || 0,
      totalAmount: sale.totalAmount || 0,
      notes: sale.notes || null,
      createdAt: sale.createdAt,
      cashierName: cashier?.name || "Cashier",
      isOlderThan24h,
    };
  });
}

/**
 * Resumes a parked cart, revalidating batch stock availability and expiry.
 */
export async function resumeHeldSale(tx: Tx, ctx: AuthCtx, heldSaleId: string): Promise<ResumeHeldSaleResult> {
  const [sale] = await tx
    .select()
    .from(schema.sales)
    .where(
      and(
        eq(schema.sales.id, heldSaleId),
        eq(schema.sales.tenantId, ctx.tenantId),
        eq(schema.sales.storeId, ctx.storeId),
        eq(schema.sales.status, "held")
      )
    )
    .limit(1);

  if (!sale) {
    throw new DomainError("NOT_FOUND", "Held bill not found or already resumed by another counter.");
  }

  const payload = sale.heldPayload as HeldSalePayload;
  if (!payload || !payload.items) {
    throw new DomainError("INVALID_PAYLOAD", "Invalid held bill payload.");
  }

  const todayStr = format(new Date(), "yyyy-MM-dd");
  let hasStockShortage = false;
  let hasExpiredBatches = false;

  const revalidatedItems: RevalidatedHeldItem[] = [];

  for (const item of payload.items) {
    const [batch] = await tx
      .select()
      .from(schema.batches)
      .where(
        and(
          eq(schema.batches.id, item.batchId),
          eq(schema.batches.tenantId, ctx.tenantId),
          eq(schema.batches.storeId, ctx.storeId)
        )
      )
      .limit(1);

    const neededBaseUnits = item.packQty * item.unitsPerPack + item.looseQty;
    const availableQty = batch?.qtyOnHand ?? 0;
    const isExpired = !batch || batch.expiryDate <= todayStr || batch.status !== "active";
    const isShortage = !isExpired && availableQty < neededBaseUnits;
    const priceChanged = Boolean(batch && batch.saleRate !== item.rate);

    if (isExpired) hasExpiredBatches = true;
    if (isShortage) hasStockShortage = true;

    revalidatedItems.push({
      ...item,
      availableQtyOnHand: availableQty,
      isAvailable: !isExpired && !isShortage,
      isExpired,
      isStockShortage: isShortage,
      priceChanged,
      currentRate: batch?.saleRate ?? item.rate,
    });
  }

  return {
    heldSaleId: sale.id,
    payload,
    revalidation: {
      hasIssues: hasStockShortage || hasExpiredBatches,
      hasStockShortage,
      hasExpiredBatches,
      items: revalidatedItems,
    },
  };
}

/**
 * Discards/cancels a held bill without completing it.
 */
export async function discardHeldSale(tx: Tx, ctx: AuthCtx, heldSaleId: string, reason?: string) {
  const [sale] = await tx
    .select()
    .from(schema.sales)
    .where(
      and(
        eq(schema.sales.id, heldSaleId),
        eq(schema.sales.tenantId, ctx.tenantId),
        eq(schema.sales.storeId, ctx.storeId),
        eq(schema.sales.status, "held")
      )
    )
    .limit(1);

  if (!sale) {
    throw new DomainError("NOT_FOUND", "Held bill not found or already resolved.");
  }

  await tx
    .update(schema.sales)
    .set({
      status: "cancelled",
      cancelledAt: new Date(),
      cancelReason: reason || "Discarded from parked queue",
    })
    .where(eq(schema.sales.id, heldSaleId));

  await writeAudit(tx, ctx, {
    action: "delete",
    entityType: "held_sale",
    entityId: heldSaleId,
    reason: reason || "Discarded from parked queue (F7)",
  });

  return { success: true };
}
