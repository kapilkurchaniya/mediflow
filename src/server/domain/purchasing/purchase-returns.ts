import { schema, type Tx, type DbOrTx } from "@/server/db";
import { eq, and, desc, sql, inArray, gt, lte } from "drizzle-orm";
import { PENDING_SUPPLIER_PLACEHOLDER_NAME } from "@/lib/pending-supplier";
import { DomainError } from "@/server/errors";
import { writeAudit } from "@/server/audit";
import { nextDocNumber } from "@/server/domain/sequence";
import { recordStockMovement } from "@/server/domain/stock";
import { postPurchaseReturnJournalEntry } from "@/server/domain/accounting";
import { createGstDocumentFromPurchaseReturn } from "@/server/domain/gst";
import type { AuthCtx } from "@/server/rbac";
import { z } from "zod";

export const PurchaseReturnItemInputSchema = z.object({
  purchaseItemId: z.string().uuid("Invalid purchase item ID"),
  batchId: z.string().uuid("Invalid batch ID"),
  qty: z.number().int().positive("Return quantity must be greater than zero"),
});

export const CreatePurchaseReturnSchema = z.object({
  purchaseId: z.string().uuid("Invalid purchase ID"),
  reason: z.string().min(2, "Reason for return is required"),
  notes: z.string().max(500).optional(),
  items: z.array(PurchaseReturnItemInputSchema).min(1, "At least one item must be returned"),
});

export type CreatePurchaseReturnInput = z.infer<typeof CreatePurchaseReturnSchema>;

export interface PurchaseReturnDetail {
  id: string;
  returnNo: string;
  purchaseId: string;
  purchaseNo: string;
  supplierInvoiceNo: string | null;
  supplierId: string;
  supplierName: string;
  supplierGstin: string | null;
  supplierPhone: string | null;
  supplierAddress: string | null;
  taxableAmount: number;
  taxAmount: number;
  totalAmount: number;
  reason: string;
  createdBy: string;
  createdByName?: string;
  createdAt: Date;
  items: {
    id: string;
    purchaseItemId: string;
    medicineId: string;
    medicineName: string;
    batchNo: string;
    expiryDate: string;
    qty: number;
    rate: number;
    taxableAmount: number;
    taxAmount: number;
    totalAmount: number;
  }[];
}

/**
 * Creates a Purchase Return and issues a Debit Note (B2.3).
 *
 * Rules:
 * - Return qty capped at what remains of the purchase item: qty - returnedQty
 * - Return qty capped at current batch qtyOnHand
 * - Deducts inventory via recordStockMovement (type: "purchase_return", qty: -qty)
 * - Generates debit note sequence: DN/YY-YY/000001
 * - Posts balanced double-entry journal (Dr Supplier Creditors, Cr Purchases, Cr Input GST)
 * - Records inward GST debit note document via createGstDocumentFromPurchaseReturn
 */
export async function createPurchaseReturn(
  tx: Tx,
  ctx: AuthCtx,
  input: CreatePurchaseReturnInput
) {
  // 1. Fetch original purchase
  const [purchase] = await tx
    .select({
      id: schema.purchases.id,
      purchaseNo: schema.purchases.purchaseNo,
      supplierId: schema.purchases.supplierId,
      isInterState: schema.purchases.isInterState,
      status: schema.purchases.status,
    })
    .from(schema.purchases)
    .where(
      and(
        eq(schema.purchases.id, input.purchaseId),
        eq(schema.purchases.tenantId, ctx.tenantId),
        eq(schema.purchases.storeId, ctx.storeId)
      )
    )
    .limit(1);

  if (!purchase) {
    throw new DomainError("PURCHASE_NOT_FOUND", "Purchase invoice not found");
  }

  // 2. Fetch all purchase items being returned
  const itemIds = input.items.map((i) => i.purchaseItemId);
  const pItems = await tx
    .select()
    .from(schema.purchaseItems)
    .where(
      and(
        eq(schema.purchaseItems.tenantId, ctx.tenantId),
        inArray(schema.purchaseItems.id, itemIds)
      )
    );

  const pItemMap = new Map(pItems.map((p) => [p.id, p]));

  // 3. Validate quantities and calculate lines
  let totalTaxable = 0;
  let totalTax = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;
  let grandTotal = 0;

  const returnLineComputations: Array<{
    purchaseItemId: string;
    batchId: string;
    medicineId: string;
    qty: number;
    unitCost: number;
    taxableAmount: number;
    taxAmount: number;
    cgst: number;
    sgst: number;
    igst: number;
    totalAmount: number;
  }> = [];

  for (const item of input.items) {
    const pItem = pItemMap.get(item.purchaseItemId);
    if (!pItem) {
      throw new DomainError("ITEM_NOT_FOUND", `Purchase item ${item.purchaseItemId} not found`);
    }

    if (pItem.purchaseId !== purchase.id) {
      throw new DomainError("INVALID_ITEM", `Item does not belong to purchase ${purchase.purchaseNo}`);
    }

    // Check remaining returnable quantity from original purchase item
    const remainingPurchased = pItem.qty - (pItem.returnedQty ?? 0);
    if (item.qty > remainingPurchased) {
      throw new DomainError(
        "RETURN_QTY_EXCEEDED",
        `Cannot return ${item.qty} units of batch ${pItem.batchNo}. Only ${remainingPurchased} units remaining from this purchase.`
      );
    }

    // Lock batch row and verify current stock on hand
    const [lockedBatch] = await tx
      .select({ id: schema.batches.id, qtyOnHand: schema.batches.qtyOnHand })
      .from(schema.batches)
      .where(eq(schema.batches.id, item.batchId))
      .for("update");

    if (!lockedBatch) {
      throw new DomainError("BATCH_NOT_FOUND", `Batch ${item.batchId} not found`);
    }

    if (item.qty > lockedBatch.qtyOnHand) {
      throw new DomainError(
        "INSUFFICIENT_STOCK",
        `Cannot return ${item.qty} units of batch ${pItem.batchNo}. Current stock on hand is only ${lockedBatch.qtyOnHand}.`
      );
    }

    // Server-side financial calculation for the return line
    const rate = pItem.rate ?? 0;
    const discountBp = pItem.discountBp ?? 0;
    const gstRateBp = pItem.gstRateBp ?? 0;

    const lineGross = rate * item.qty;
    const lineDiscount = Math.round((lineGross * discountBp) / 10000);
    const lineTaxable = lineGross - lineDiscount;

    let lineCgst = 0;
    let lineSgst = 0;
    let lineIgst = 0;

    if (purchase.isInterState) {
      lineIgst = Math.round((lineTaxable * gstRateBp) / 10000);
    } else {
      const halfRate = Math.floor(gstRateBp / 2);
      lineCgst = Math.round((lineTaxable * halfRate) / 10000);
      lineSgst = Math.round((lineTaxable * (gstRateBp - halfRate)) / 10000);
    }

    const lineTax = lineCgst + lineSgst + lineIgst;
    const lineTotal = lineTaxable + lineTax;

    totalTaxable += lineTaxable;
    totalTax += lineTax;
    totalCgst += lineCgst;
    totalSgst += lineSgst;
    totalIgst += lineIgst;
    grandTotal += lineTotal;

    returnLineComputations.push({
      purchaseItemId: pItem.id,
      batchId: item.batchId,
      medicineId: pItem.medicineId,
      qty: item.qty,
      unitCost: pItem.landedUnitCost ?? pItem.rate ?? 0,
      taxableAmount: lineTaxable,
      taxAmount: lineTax,
      cgst: lineCgst,
      sgst: lineSgst,
      igst: lineIgst,
      totalAmount: lineTotal,
    });
  }

  // 4. Generate sequential Debit Note number (DN/26-27/000001)
  const returnNo = await nextDocNumber(tx, ctx.tenantId, ctx.storeId, "purchase_return", "DN");

  // 5. Insert purchase return record
  const [returnRecord] = await tx
    .insert(schema.purchaseReturns)
    .values({
      tenantId: ctx.tenantId,
      storeId: ctx.storeId,
      returnNo,
      purchaseId: purchase.id,
      supplierId: purchase.supplierId,
      taxableAmount: totalTaxable,
      taxAmount: totalTax,
      totalAmount: grandTotal,
      reason: input.reason + (input.notes ? ` - ${input.notes}` : ""),
      createdBy: ctx.userId,
    })
    .returning();

  // 6. Insert items & process inventory deductions
  for (const comp of returnLineComputations) {
    await tx.insert(schema.purchaseReturnItems).values({
      tenantId: ctx.tenantId,
      returnId: returnRecord.id,
      purchaseItemId: comp.purchaseItemId,
      qty: comp.qty,
      taxableAmount: comp.taxableAmount,
      taxAmount: comp.taxAmount,
      totalAmount: comp.totalAmount,
    });

    // Deduct stock
    await recordStockMovement({
      tx,
      tenantId: ctx.tenantId,
      storeId: ctx.storeId,
      batchId: comp.batchId,
      medicineId: comp.medicineId,
      type: "purchase_return",
      qtyChange: -comp.qty,
      unitCost: comp.unitCost,
      refType: "purchase_return",
      refId: returnRecord.id,
      note: `Debit Note ${returnNo}: ${input.reason}`,
      userId: ctx.userId,
    });

    // Update purchase_items.returnedQty
    await tx
      .update(schema.purchaseItems)
      .set({
        returnedQty: sql`${schema.purchaseItems.returnedQty} + ${comp.qty}`,
      })
      .where(eq(schema.purchaseItems.id, comp.purchaseItemId));
  }

  // 7. Update purchases.returnedAmount
  await tx
    .update(schema.purchases)
    .set({
      returnedAmount: sql`${schema.purchases.returnedAmount} + ${grandTotal}`,
    })
    .where(eq(schema.purchases.id, purchase.id));

  // 8. Post double-entry journal (Dr Supplier Creditors, Cr Purchases, Cr Input GST)
  await postPurchaseReturnJournalEntry({
    tx,
    tenantId: ctx.tenantId,
    storeId: ctx.storeId,
    userId: ctx.userId,
    returnId: returnRecord.id,
    returnNo,
    supplierId: purchase.supplierId,
    returnDate: new Date().toISOString().split("T")[0]!,
    taxableAmount: totalTaxable,
    cgst: totalCgst,
    sgst: totalSgst,
    igst: totalIgst,
    totalAmount: grandTotal,
  });

  // 9. Generate GST Debit Note document
  await createGstDocumentFromPurchaseReturn(tx, {
    returnId: returnRecord.id,
    tenantId: ctx.tenantId,
    storeId: ctx.storeId,
    cgst: totalCgst,
    sgst: totalSgst,
    igst: totalIgst,
  });

  // 10. Write Audit log
  await writeAudit(tx, ctx, {
    action: "create",
    entityType: "purchase_return",
    entityId: returnRecord.id,
    reason: input.reason,
    newValue: {
      returnNo,
      purchaseId: purchase.id,
      grandTotal,
      itemCount: input.items.length,
    },
  });

  return returnRecord;
}

/**
 * Retrieves a detailed Purchase Return / Debit Note by ID.
 */
export async function getPurchaseReturnById(
  dbOrTx: DbOrTx,
  tenantId: string,
  storeId: string,
  returnId: string
): Promise<PurchaseReturnDetail | null> {
  const [returnRow] = await dbOrTx
    .select({
      ret: schema.purchaseReturns,
      pur: schema.purchases,
      sup: schema.suppliers,
      user: schema.users,
    })
    .from(schema.purchaseReturns)
    .innerJoin(schema.purchases, eq(schema.purchaseReturns.purchaseId, schema.purchases.id))
    .innerJoin(schema.suppliers, eq(schema.purchaseReturns.supplierId, schema.suppliers.id))
    .leftJoin(schema.users, eq(schema.purchaseReturns.createdBy, schema.users.id))
    .where(
      and(
        eq(schema.purchaseReturns.id, returnId),
        eq(schema.purchaseReturns.tenantId, tenantId),
        eq(schema.purchaseReturns.storeId, storeId)
      )
    )
    .limit(1);

  if (!returnRow) return null;

  const items = await dbOrTx
    .select({
      item: schema.purchaseReturnItems,
      pItem: schema.purchaseItems,
      med: schema.medicines,
    })
    .from(schema.purchaseReturnItems)
    .innerJoin(schema.purchaseItems, eq(schema.purchaseReturnItems.purchaseItemId, schema.purchaseItems.id))
    .innerJoin(schema.medicines, eq(schema.purchaseItems.medicineId, schema.medicines.id))
    .where(
      and(
        eq(schema.purchaseReturnItems.returnId, returnId),
        eq(schema.purchaseReturnItems.tenantId, tenantId)
      )
    );

  return {
    id: returnRow.ret.id,
    returnNo: returnRow.ret.returnNo,
    purchaseId: returnRow.pur.id,
    purchaseNo: returnRow.pur.purchaseNo,
    supplierInvoiceNo: returnRow.pur.supplierInvoiceNo,
    supplierId: returnRow.sup.id,
    supplierName: returnRow.sup.name,
    supplierGstin: returnRow.sup.gstin,
    supplierPhone: returnRow.sup.phone,
    supplierAddress: returnRow.sup.address,
    taxableAmount: returnRow.ret.taxableAmount ?? 0,
    taxAmount: returnRow.ret.taxAmount ?? 0,
    totalAmount: returnRow.ret.totalAmount ?? 0,
    reason: returnRow.ret.reason,
    createdBy: returnRow.ret.createdBy,
    createdByName: returnRow.user?.name ?? undefined,
    createdAt: returnRow.ret.createdAt,
    items: items.map((i) => ({
      id: i.item.id,
      purchaseItemId: i.item.purchaseItemId,
      medicineId: i.med.id,
      medicineName: i.med.name,
      batchNo: i.pItem.batchNo,
      expiryDate: i.pItem.expiryDate,
      qty: i.item.qty,
      rate: i.pItem.rate ?? 0,
      taxableAmount: i.item.taxableAmount ?? 0,
      taxAmount: i.item.taxAmount ?? 0,
      totalAmount: i.item.totalAmount ?? 0,
    })),
  };
}

/**
 * Lists Purchase Returns / Debit Notes with optional search and date filters.
 */
export async function listPurchaseReturns(
  dbOrTx: DbOrTx,
  tenantId: string,
  storeId: string,
  options?: {
    supplierId?: string;
    limit?: number;
    offset?: number;
  }
) {
  const conditions = [
    eq(schema.purchaseReturns.tenantId, tenantId),
    eq(schema.purchaseReturns.storeId, storeId),
  ];

  if (options?.supplierId) {
    conditions.push(eq(schema.purchaseReturns.supplierId, options.supplierId));
  }

  const rows = await dbOrTx
    .select({
      id: schema.purchaseReturns.id,
      returnNo: schema.purchaseReturns.returnNo,
      purchaseId: schema.purchaseReturns.purchaseId,
      purchaseNo: schema.purchases.purchaseNo,
      supplierInvoiceNo: schema.purchases.supplierInvoiceNo,
      supplierId: schema.purchaseReturns.supplierId,
      supplierName: schema.suppliers.name,
      taxableAmount: schema.purchaseReturns.taxableAmount,
      taxAmount: schema.purchaseReturns.taxAmount,
      totalAmount: schema.purchaseReturns.totalAmount,
      reason: schema.purchaseReturns.reason,
      createdAt: schema.purchaseReturns.createdAt,
    })
    .from(schema.purchaseReturns)
    .innerJoin(schema.purchases, eq(schema.purchaseReturns.purchaseId, schema.purchases.id))
    .innerJoin(schema.suppliers, eq(schema.purchaseReturns.supplierId, schema.suppliers.id))
    .where(and(...conditions))
    .orderBy(desc(schema.purchaseReturns.createdAt))
    .limit(options?.limit ?? 50)
    .offset(options?.offset ?? 0);

  return rows;
}

export interface ExpiryReturnCandidate {
  batchId: string;
  batchNo: string;
  expiryDate: string;
  qtyOnHand: number;
  purchaseRate: number;
  medicineId: string;
  medicineName: string;
  supplierId: string | null;
  supplierName: string | null;
  isPendingSupplier?: boolean;
  purchaseId: string | null;
  purchaseItemId: string | null;
  purchaseNo: string | null;
}

/**
 * Computes YYYY-MM-DD in Asia/Kolkata offset by `offsetDays`.
 */
function istDateOffsetStr(offsetDays: number): string {
  const istNow = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  const d = new Date(`${istNow}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().split("T")[0]!;
}

/**
 * Finds near-expiry and expired batches eligible for supplier return (B2.3).
 * Defaults to batches expiring within 60 days or already expired, with qtyOnHand > 0.
 */
export async function getBatchesForExpiryReturn(
  dbOrTx: DbOrTx,
  tenantId: string,
  storeId: string,
  daysAhead = 60
): Promise<ExpiryReturnCandidate[]> {
  const cutoffDate = istDateOffsetStr(daysAhead);

  const rows = await dbOrTx
    .select({
      batch: schema.batches,
      med: schema.medicines,
      sup: schema.suppliers,
      pItem: schema.purchaseItems,
      pur: schema.purchases,
    })
    .from(schema.batches)
    .innerJoin(schema.medicines, eq(schema.batches.medicineId, schema.medicines.id))
    .leftJoin(schema.suppliers, eq(schema.batches.supplierId, schema.suppliers.id))
    .leftJoin(schema.purchaseItems, eq(schema.purchaseItems.batchId, schema.batches.id))
    .leftJoin(schema.purchases, eq(schema.purchaseItems.purchaseId, schema.purchases.id))
    .where(
      and(
        eq(schema.batches.tenantId, tenantId),
        eq(schema.batches.storeId, storeId),
        gt(schema.batches.qtyOnHand, 0),
        lte(schema.batches.expiryDate, cutoffDate)
      )
    )
    .orderBy(schema.batches.expiryDate);

  // Deduplicate by batch ID (in case multiple purchaseItems reference same batch)
  const seen = new Set<string>();
  const candidates: ExpiryReturnCandidate[] = [];

  for (const r of rows) {
    if (seen.has(r.batch.id)) continue;
    seen.add(r.batch.id);

    const isPlaceholder = r.sup?.name === PENDING_SUPPLIER_PLACEHOLDER_NAME;
    const pendingName = r.pur?.pendingSupplierMeta?.name?.trim();
    const resolvedSupplierName = isPlaceholder
      ? pendingName
        ? `${pendingName} (Unregistered)`
        : "Unregistered Supplier"
      : r.sup?.name ?? (pendingName ? `${pendingName} (Unregistered)` : null);

    candidates.push({
      batchId: r.batch.id,
      batchNo: r.batch.batchNo,
      expiryDate: r.batch.expiryDate,
      qtyOnHand: r.batch.qtyOnHand,
      purchaseRate: r.batch.purchaseRate ?? 0,
      medicineId: r.med.id,
      medicineName: r.med.name,
      supplierId: isPlaceholder ? null : (r.sup?.id ?? r.pur?.supplierId ?? null),
      supplierName: resolvedSupplierName,
      isPendingSupplier: isPlaceholder || (!r.sup && Boolean(pendingName)),
      purchaseId: r.pur?.id ?? null,
      purchaseItemId: r.pItem?.id ?? null,
      purchaseNo: r.pur?.purchaseNo ?? null,
    });
  }

  return candidates;
}
