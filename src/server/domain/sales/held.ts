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

import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import type { Tx } from "@/server/db";
import type { AuthCtx } from "@/server/rbac";
import { DomainError } from "@/server/errors";
import { writeAudit } from "@/server/audit";
import { computeSaleTotals } from "@/lib/money";
import { format } from "date-fns";

export const HeldSaleItemSchema = z.object({
  medicineId: z.string().uuid(),
  medicineName: z.string().min(1),
  genericName: z.string().optional(),
  batchId: z.string().uuid(),
  batchNo: z.string().min(1),
  expiryDate: z.string().min(1),
  packQty: z.number().int().min(0).default(0),
  looseQty: z.number().int().min(0).default(0),
  unitsPerPack: z.number().int().min(1).default(1),
  packUnit: z.string().default("strip"),
  looseUnit: z.string().default("tablet"),
  rate: z.number().int().min(0), // paise
  mrp: z.number().int().min(0), // paise
  discountBp: z.number().int().min(0).max(10000).default(0),
  gstRateBp: z.number().int().default(500),
  isAutoFefo: z.boolean().optional(),
});
export type HeldSaleItem = z.infer<typeof HeldSaleItemSchema>;

export const HoldSaleInputSchema = z.object({
  customerId: z.string().uuid().optional().nullable(),
  customerName: z.string().trim().max(100).optional().nullable(),
  customerPhone: z.string().trim().max(20).optional().nullable(),
  doctorName: z.string().trim().max(100).optional().nullable(),
  doctorRegNo: z.string().trim().max(50).optional().nullable(),
  doctorAddress: z.string().trim().max(255).optional().nullable(),
  patientAge: z.number().int().min(0).max(130).optional().nullable(),
  patientGender: z.string().trim().max(20).optional().nullable(),
  patientAddress: z.string().trim().max(255).optional().nullable(),
  prescriptionRef: z.string().trim().max(50).optional().nullable(),
  prescriptionId: z.string().uuid().optional().nullable(),
  notes: z.string().trim().max(255).optional().nullable(),
  items: z.array(HeldSaleItemSchema).min(1, "Cannot hold an empty bill"),
});
export type HoldSaleInput = z.input<typeof HoldSaleInputSchema>;

export interface HeldSalePayload extends z.output<typeof HoldSaleInputSchema> {
  heldAt: string;
}

export interface RevalidatedHeldItem extends HeldSaleItem {
  availableQtyOnHand: number;
  isAvailable: boolean;
  isExpired: boolean;
  isStockShortage: boolean;
  priceChanged: boolean;
  currentRate: number;
}

export interface ResumeHeldSaleResult {
  heldSaleId: string;
  payload: HeldSalePayload;
  revalidation: {
    hasIssues: boolean;
    hasStockShortage: boolean;
    hasExpiredBatches: boolean;
    items: RevalidatedHeldItem[];
  };
}

/**
 * Parks the current POS cart as a held sale.
 */
export async function holdSale(tx: Tx, ctx: AuthCtx, input: HoldSaleInput) {
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
