import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { schema, type DbOrTx, type Tx } from "@/server/db";
import type { AuthCtx } from "@/server/rbac";
import { DomainError } from "@/server/errors";
import { computeSaleLine } from "@/lib/money";
import { recordStockMovement } from "@/server/domain/stock";
import { nextDocNumber } from "@/server/domain/sequence";
import { postSaleReturnJournalEntry } from "@/server/domain/accounting";
import { createGstDocumentFromReturn } from "@/server/domain/gst";
import { LoyaltyService } from "@/server/domain/loyalty";
import { writeAudit } from "@/server/audit";

/**
 * Line item input for a customer sale return.
 * Supports pack quantity, loose quantity, or direct base units.
 */
export const ReturnLineItemInputSchema = z.object({
  saleItemId: z.string().uuid("Invalid sale item ID"),
  packQty: z.number().int().min(0).optional().default(0),
  looseQty: z.number().int().min(0).optional().default(0),
  qty: z.number().int().min(0).optional(),
});

export type ReturnLineItemInput = z.input<typeof ReturnLineItemInputSchema>;

/**
 * Input schema for creating a sale return and credit note.
 */
export const ReturnSaleInputSchema = z.object({
  saleId: z.string().uuid("Invalid sale ID"),
  items: z.array(ReturnLineItemInputSchema).min(1, "At least one item must be returned"),
  refundMethod: z.enum(["cash", "upi", "card", "credit_note", "bank"]),
  reason: z
    .string()
    .trim()
    .min(3, "Return reason must be at least 3 characters")
    .max(255, "Return reason cannot exceed 255 characters"),
});

export type ReturnSaleInput = z.input<typeof ReturnSaleInputSchema>;

export interface ReturnSaleOptions {
  /** Optional override for testing timestamps and fiscal periods */
  now?: Date;
}

export interface ReturnSaleResult {
  returnId: string;
  returnNo: string;
  saleId: string;
  invoiceNo: string;
  totalAmount: number; // in paise
  taxableAmount: number; // in paise
  taxAmount: number; // in paise
  refundMethod: string;
  journalEntryId: string;
  restoredBatchesCount: number;
  quarantinedBatchesCount: number;
}

export interface ReturnableLineItem {
  id: string;
  saleId: string;
  medicineId: string;
  medicineName: string;
  batchId: string;
  batchNo: string;
  expiryDate: string;
  unitsPerPack: number;
  packUnit: string;
  looseUnit: string;
  soldBaseQty: number;
  soldPackQty: number;
  soldLooseQty: number;
  returnedQty: number;
  availableBaseQty: number;
  availablePackQty: number;
  availableLooseQty: number;
  rate: number;
  mrp: number;
  discountBp: number;
  gstRateBp: number;
  totalAmount: number;
  isBatchExpired: boolean;
}

export interface ReturnableSaleDetails {
  sale: typeof schema.sales.$inferSelect;
  items: ReturnableLineItem[];
  customer: typeof schema.customers.$inferSelect | null;
  previousReturns: (typeof schema.saleReturns.$inferSelect)[];
}

/**
 * Fetches sale details and calculates remaining returnable quantities per item.
 */
export async function getReturnableSaleDetails(
  dbOrTx: DbOrTx,
  ctx: AuthCtx,
  saleId: string,
  now: Date = new Date(),
): Promise<ReturnableSaleDetails> {
  const [sale] = await dbOrTx
    .select()
    .from(schema.sales)
    .where(
      and(
        eq(schema.sales.id, saleId),
        eq(schema.sales.tenantId, ctx.tenantId),
        eq(schema.sales.storeId, ctx.storeId),
      ),
    )
    .limit(1);

  if (!sale) {
    throw new DomainError("NOT_FOUND", "Sale invoice not found.");
  }

  const items = await dbOrTx
    .select()
    .from(schema.saleItems)
    .where(eq(schema.saleItems.saleId, sale.id));

  const [customer] = sale.customerId
    ? await dbOrTx
        .select()
        .from(schema.customers)
        .where(eq(schema.customers.id, sale.customerId))
        .limit(1)
    : [null];

  const previousReturns = await dbOrTx
    .select()
    .from(schema.saleReturns)
    .where(eq(schema.saleReturns.saleId, sale.id))
    .orderBy(schema.saleReturns.createdAt);

  const returnableItems: ReturnableLineItem[] = items.map((item) => {
    const upp = Math.max(1, item.unitsPerPack || 1);
    const returned = item.returnedQty ?? 0;
    const availableBase = Math.max(0, item.qty - returned);
    const availablePack = Math.floor(availableBase / upp);
    const availableLoose = availableBase % upp;
    const isExpired = item.expiryDate ? new Date(item.expiryDate) < now : false;

    return {
      id: item.id,
      saleId: item.saleId,
      medicineId: item.medicineId,
      medicineName: item.medicineName,
      batchId: item.batchId,
      batchNo: item.batchNo,
      expiryDate: item.expiryDate,
      unitsPerPack: upp,
      packUnit: item.packUnit || "strip",
      looseUnit: item.looseUnit || "tablet",
      soldBaseQty: item.qty,
      soldPackQty: item.packQty,
      soldLooseQty: item.looseQty,
      returnedQty: returned,
      availableBaseQty: availableBase,
      availablePackQty: availablePack,
      availableLooseQty: availableLoose,
      rate: item.rate ?? 0,
      mrp: item.mrp ?? 0,
      discountBp: item.discountBp ?? 0,
      gstRateBp: item.gstRateBp,
      totalAmount: item.totalAmount ?? 0,
      isBatchExpired: isExpired,
    };
  });

  return {
    sale,
    items: returnableItems,
    customer: customer ?? null,
    previousReturns,
  };
}

/**
 * 🤝 CONTRACT (ROADMAP A2.5). Creates a sale return and issues a GST Credit Note.
 *
 * Rules:
 * 1. Sale status validation: returns are only permitted on completed sales (cannot return cancelled sales).
 * 2. Quantity cap: returnable quantity is strictly capped at (sold_qty - previous_returned_qty).
 * 3. Proportional recalculation: line amounts, discounts, and GST components are recomputed using
 *    the original rate, discount_bp, and gst_rate_bp snapshots via `computeSaleLine`.
 * 4. Document sequencing: generates a permanent Credit Note number via `nextDocNumber(..., "sale_return", "CN")`
 *    adhering to Rule 46 (<= 16 characters).
 * 5. Batch inventory restoration & expiry quarantine: stock is restored to the exact original batch.
 *    If the batch has expired between the sale and return date, its status is set to 'hold' so it cannot be re-sold.
 * 6. Double-entry accounting: posts a balanced Credit Note journal entry (refType: "sale_return") debiting
 *    Sales Account and Output GST, and crediting the refund method account (Cash, Bank, or Customer Receivables).
 * 7. GST compliance: triggers B2.6 `createGstDocumentFromReturn` in a savepoint to record the credit note in GSTR-1.
 * 8. Loyalty reversal: triggers B2.5 `LoyaltyService.reverseForSale` in a savepoint with proportional return fraction.
 * 9. Audit trail: records immutable audit event (`sale_return.create`).
 */
export async function returnSale(
  tx: Tx,
  ctx: AuthCtx,
  input: ReturnSaleInput,
  opts: ReturnSaleOptions = {},
): Promise<ReturnSaleResult> {
  const parsed = ReturnSaleInputSchema.parse(input);
  const now = opts.now ?? new Date();

  // 1. Lock the sale record to prevent concurrent modifications
  const [sale] = await tx
    .select()
    .from(schema.sales)
    .where(
      and(
        eq(schema.sales.id, parsed.saleId),
        eq(schema.sales.tenantId, ctx.tenantId),
        eq(schema.sales.storeId, ctx.storeId),
      ),
    )
    .for("update");

  if (!sale) {
    throw new DomainError("NOT_FOUND", "Sale invoice not found.");
  }

  if (sale.status === "cancelled") {
    throw new DomainError("SALE_CANCELLED", "Cannot return items from a cancelled sale.");
  }

  if (sale.status !== "completed") {
    throw new DomainError(
      "CANNOT_RETURN_STATUS",
      `Only completed sales can be returned. Current status is '${sale.status}'.`,
    );
  }

  // 2. Lock sale items
  const saleItems = await tx
    .select()
    .from(schema.saleItems)
    .where(eq(schema.saleItems.saleId, sale.id))
    .for("update");

  const saleItemMap = new Map(saleItems.map((item) => [item.id, item]));

  // 3. Validate line item return quantities
  interface ReturningLine {
    saleItem: typeof schema.saleItems.$inferSelect;
    returnBaseQty: number;
    returnPackQty: number;
    returnLooseQty: number;
    taxable: number;
    cgst: number;
    sgst: number;
    igst: number;
    tax: number;
    total: number;
  }

  const returningLines: ReturningLine[] = [];

  for (const itemInput of parsed.items) {
    const saleItem = saleItemMap.get(itemInput.saleItemId);
    if (!saleItem) {
      throw new DomainError("INVALID_ITEM", `Sale item ${itemInput.saleItemId} does not belong to this sale.`);
    }

    const upp = Math.max(1, saleItem.unitsPerPack || 1);
    let returnBaseQty = 0;
    let returnPackQty = itemInput.packQty ?? 0;
    let returnLooseQty = itemInput.looseQty ?? 0;

    if (itemInput.qty !== undefined && itemInput.qty > 0) {
      returnBaseQty = itemInput.qty;
      returnPackQty = Math.floor(returnBaseQty / upp);
      returnLooseQty = returnBaseQty % upp;
    } else {
      if (returnLooseQty >= upp) {
        returnPackQty += Math.floor(returnLooseQty / upp);
        returnLooseQty = returnLooseQty % upp;
      }
      returnBaseQty = returnPackQty * upp + returnLooseQty;
    }

    // Skip lines with 0 quantity
    if (returnBaseQty <= 0) continue;

    const currentReturned = saleItem.returnedQty ?? 0;
    const availableBaseQty = saleItem.qty - currentReturned;

    if (returnBaseQty > availableBaseQty) {
      throw new DomainError(
        "RETURN_QTY_EXCEEDED",
        `Cannot return ${returnBaseQty} base units of ${saleItem.medicineName}. Only ${availableBaseQty} available to return.`,
      );
    }

    // Recompute line amounts using original snapshots
    const lineCalc = computeSaleLine(
      {
        qty: returnBaseQty,
        rate: saleItem.rate ?? 0,
        discountBp: saleItem.discountBp ?? 0,
        gstRateBp: saleItem.gstRateBp,
        unitsPerPack: upp,
      },
      sale.isInterState,
    );

    returningLines.push({
      saleItem,
      returnBaseQty,
      returnPackQty,
      returnLooseQty,
      taxable: lineCalc.taxable,
      cgst: lineCalc.cgst,
      sgst: lineCalc.sgst,
      igst: lineCalc.igst,
      tax: lineCalc.cgst + lineCalc.sgst + lineCalc.igst,
      total: lineCalc.total,
    });
  }

  if (returningLines.length === 0) {
    throw new DomainError("NO_ITEMS_RETURNED", "At least one item must have a return quantity greater than 0.");
  }

  // 4. Calculate total return amounts
  const totalTaxable = returningLines.reduce((sum, line) => sum + line.taxable, 0);
  const totalCgst = returningLines.reduce((sum, line) => sum + line.cgst, 0);
  const totalSgst = returningLines.reduce((sum, line) => sum + line.sgst, 0);
  const totalIgst = returningLines.reduce((sum, line) => sum + line.igst, 0);
  const totalTax = totalCgst + totalSgst + totalIgst;
  const totalAmount = returningLines.reduce((sum, line) => sum + line.total, 0);

  // 5. Generate permanent Credit Note sequence number (CN/YY-YY/000000)
  const returnNo = await nextDocNumber(tx, ctx.tenantId, ctx.storeId, "sale_return", "CN", now);

  // 6. Insert sale_returns record
  const [saleReturn] = await tx
    .insert(schema.saleReturns)
    .values({
      tenantId: ctx.tenantId,
      storeId: ctx.storeId,
      saleId: sale.id,
      returnNo,
      taxableAmount: totalTaxable,
      taxAmount: totalTax,
      totalAmount,
      refundMethod: parsed.refundMethod,
      reason: parsed.reason,
      createdBy: ctx.userId,
      createdAt: now,
    })
    .returning();

  // 7. Insert sale_return_items records
  for (const line of returningLines) {
    await tx.insert(schema.saleReturnItems).values({
      tenantId: ctx.tenantId,
      returnId: saleReturn.id,
      saleItemId: line.saleItem.id,
      qty: line.returnBaseQty,
      taxableAmount: line.taxable,
      taxAmount: line.tax,
      totalAmount: line.total,
    });
  }

  // 8. Update sale_items.returned_qty and sales.returned_amount
  for (const line of returningLines) {
    await tx
      .update(schema.saleItems)
      .set({
        returnedQty: sql`${schema.saleItems.returnedQty} + ${line.returnBaseQty}`,
      })
      .where(eq(schema.saleItems.id, line.saleItem.id));
  }

  await tx
    .update(schema.sales)
    .set({
      returnedAmount: sql`COALESCE(${schema.sales.returnedAmount}, 0) + ${totalAmount}`,
    })
    .where(eq(schema.sales.id, sale.id));

  // 9. Exact batch inventory restoration & expiry quarantine
  let restoredBatchesCount = 0;
  let quarantinedBatchesCount = 0;

  for (const line of returningLines) {
    const [batch] = await tx
      .select()
      .from(schema.batches)
      .where(eq(schema.batches.id, line.saleItem.batchId))
      .for("update");

    if (batch) {
      const isExpired = batch.expiryDate ? new Date(batch.expiryDate) < now : false;

      // If batch expired between sale and return, quarantine it immediately
      if (isExpired && batch.status !== "hold") {
        await tx
          .update(schema.batches)
          .set({ status: "hold" })
          .where(eq(schema.batches.id, batch.id));
        quarantinedBatchesCount++;
      }

      // Record traceable stock movement (which increments batches.qtyOnHand atomically)
      await recordStockMovement({
        tx,
        tenantId: ctx.tenantId,
        storeId: ctx.storeId,
        batchId: batch.id,
        medicineId: line.saleItem.medicineId,
        type: "sale_return",
        qtyChange: line.returnBaseQty,
        unitCost: line.saleItem.unitCost ?? batch.purchaseRate,
        refType: "sale_return",
        refId: saleReturn.id,
        userId: ctx.userId,
      });

      restoredBatchesCount++;
    }
  }

  // 10. Post balanced double-entry General Ledger Credit Note entry
  const journalEntryId = await postSaleReturnJournalEntry({
    tx,
    tenantId: ctx.tenantId,
    storeId: ctx.storeId,
    userId: ctx.userId,
    returnId: saleReturn.id,
    returnNo,
    returnDate: now,
    saleId: sale.id,
    invoiceNo: sale.invoiceNo || "N/A",
    customerId: sale.customerId,
    customerName: sale.customerName,
    refundMethod: parsed.refundMethod,
    taxableAmount: totalTaxable,
    cgst: totalCgst,
    sgst: totalSgst,
    igst: totalIgst,
    totalAmount,
  });

  // 11. Savepoint: Auto-generate GST Credit Note document for GSTR-1 (🤝 Lane B Hook)
  try {
    await tx.transaction(async (sp) => {
      await createGstDocumentFromReturn(sp, { returnId: saleReturn.id });
    });
  } catch (err: unknown) {
    console.error("GST credit note document creation failed; return kept", err);
  }

  // 12. Savepoint: Proportional Loyalty points reversal (🤝 Lane B Hook)
  if (sale.totalAmount && sale.totalAmount > 0) {
    const fraction = totalAmount / sale.totalAmount;
    try {
      await tx.transaction(async (sp) => {
        await LoyaltyService.reverseForSale(sp, {
          tenantId: ctx.tenantId,
          saleId: sale.id,
          fraction,
        });
      });
    } catch (err: unknown) {
      console.error("Loyalty points reversal failed; return kept", err);
    }
  }

  // 13. Immutable audit trail
  await writeAudit(
    tx,
    { tenantId: ctx.tenantId, storeId: ctx.storeId, userId: ctx.userId },
    {
      action: "create",
      entityType: "sale_return",
      entityId: saleReturn.id,
      reason: parsed.reason,
      newValue: {
        returnNo,
        saleId: sale.id,
        invoiceNo: sale.invoiceNo,
        refundMethod: parsed.refundMethod,
        reason: parsed.reason,
        totalAmount,
        taxableAmount: totalTaxable,
        taxAmount: totalTax,
        itemsCount: returningLines.length,
        quarantinedBatchesCount,
      },
    },
  );

  return {
    returnId: saleReturn.id,
    returnNo,
    saleId: sale.id,
    invoiceNo: sale.invoiceNo || "N/A",
    totalAmount,
    taxableAmount: totalTaxable,
    taxAmount: totalTax,
    refundMethod: parsed.refundMethod,
    journalEntryId,
    restoredBatchesCount,
    quarantinedBatchesCount,
  };
}
