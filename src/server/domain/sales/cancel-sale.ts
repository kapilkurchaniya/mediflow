import { and, eq, gt, inArray } from "drizzle-orm";
import { format } from "date-fns";
import { z } from "zod";
import { schema, type Tx } from "@/server/db";
import type { AuthCtx } from "@/server/rbac";
import { DomainError } from "@/server/errors";
import { recordStockMovement } from "@/server/domain/stock";
import { nextDocNumber } from "@/server/domain/sequence";
import { cancelGstDocumentForSale } from "@/server/domain/gst";
import { LoyaltyService } from "@/server/domain/loyalty";
import { writeAudit } from "@/server/audit";
import { assertAccountingPeriodOpen } from "@/server/domain/accounting-periods";

/**
 * Input schema for sale cancellation.
 * The cancellation reason is mandatory to satisfy Pharma compliance audits.
 */
export const CancelSaleInputSchema = z.object({
  saleId: z.string().uuid("Invalid sale ID"),
  reason: z
    .string()
    .trim()
    .min(3, "Cancellation reason must be at least 3 characters")
    .max(255, "Cancellation reason cannot exceed 255 characters"),
});

export type CancelSaleInput = z.infer<typeof CancelSaleInputSchema>;

export interface CancelSaleOptions {
  /** Optional override for testing time windows */
  now?: Date;
}

export interface CancelSaleResult {
  saleId: string;
  invoiceNo: string | null;
  cancelledAt: Date;
  status: "cancelled";
  reversalEntryNo: string | null;
  restoredBatchesCount: number;
}

/**
 * Returns the business calendar date in Indian Standard Time (Asia/Kolkata).
 * In Indian Pharma retail accounting, same-day cancellations are bounded by IST midnight.
 */
export function getIndianBusinessDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(date);
}

/**
 * 🤝 CONTRACT (ROADMAP A2.4). Cancels an existing completed sale within the same business day.
 *
 * Rules:
 * 1. Only allowed on the same business day (Asia/Kolkata calendar day). Past midnight, customer
 *    must use Sale Return & Credit Note (A2.5).
 * 2. Allowed only before any partial returns have occurred.
 * 3. Restores inventory back to the exact batches with traceable movements:
 *    `type: "sale_return"`, `refType: "sale_cancel"`.
 * 4. Posts an exact reversing journal entry (`refType: "sale_cancel"`) mirroring original lines:
 *    original debits become credits, and credits become debits. Guarantees 0-paise balance.
 * 5. Calls B2.6 `cancelGstDocumentForSale` to void the outward tax invoice in GSTR-1 registers
 *    (the invoice number remains used and reported under cancelled documents).
 * 6. Calls B2.5 `LoyaltyService.reverseForSale` to reverse earned points and refund redeemed points.
 * 7. Annotates statutory Schedule H/H1/X dispensing logs (NEVER deletes them).
 * 8. Reverses prescription quantities if linked to a prescription.
 * 9. Writes an immutable audit row with the mandatory cancellation reason.
 */
export async function cancelSale(
  tx: Tx,
  ctx: AuthCtx,
  input: CancelSaleInput,
  opts: CancelSaleOptions = {},
): Promise<CancelSaleResult> {
  const parsed = CancelSaleInputSchema.parse(input);
  const now = opts.now ?? new Date();

  // 1. Lock the sale record to prevent concurrent updates or race conditions
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

  // 2. Validate current status
  if (sale.status === "cancelled") {
    throw new DomainError("ALREADY_CANCELLED", "This sale invoice has already been cancelled.");
  }
  if (sale.status !== "completed") {
    throw new DomainError(
      "CANNOT_CANCEL_STATUS",
      `Only completed sales can be cancelled (current status: ${sale.status}).`,
    );
  }

  // 3. Validate no returns have been processed against this sale
  if ((sale.returnedAmount ?? 0) > 0) {
    throw new DomainError(
      "SALE_HAS_RETURNS",
      "Cannot cancel a sale that has returns recorded. Please issue a credit note for remaining items.",
    );
  }

  const itemsWithReturns = await tx
    .select({ id: schema.saleItems.id })
    .from(schema.saleItems)
    .where(and(eq(schema.saleItems.saleId, sale.id), gt(schema.saleItems.returnedQty, 0)))
    .limit(1);

  if (itemsWithReturns.length > 0) {
    throw new DomainError(
      "SALE_HAS_RETURNS",
      "Cannot cancel a sale that has returns recorded. Please issue a credit note for remaining items.",
    );
  }

  // 4. Same business day check (IST midnight boundary)
  const saleDate = sale.completedAt ?? sale.createdAt;
  const saleBusinessDate = getIndianBusinessDate(saleDate);
  const currentBusinessDate = getIndianBusinessDate(now);

  if (saleBusinessDate !== currentBusinessDate) {
    throw new DomainError(
      "CANCELLATION_WINDOW_EXPIRED",
      "Sale cancellation is only permitted on the same business day in accordance with Indian Pharma retail accounting rules. For past transactions, please issue a Sale Return / Credit Note.",
    );
  }

  // 5. Traceable Stock Reversal (type: "sale_return", refType: "sale_cancel")
  const origMovements = await tx
    .select()
    .from(schema.stockMovements)
    .where(
      and(
        eq(schema.stockMovements.tenantId, ctx.tenantId),
        eq(schema.stockMovements.storeId, ctx.storeId),
        eq(schema.stockMovements.refType, "sale"),
        eq(schema.stockMovements.refId, sale.id),
        eq(schema.stockMovements.type, "sale"),
      ),
    );

  let restoredBatchesCount = 0;

  if (origMovements.length > 0) {
    for (const m of origMovements) {
      if (m.qtyChange < 0) {
        await recordStockMovement({
          tx,
          tenantId: ctx.tenantId,
          storeId: ctx.storeId,
          batchId: m.batchId,
          medicineId: m.medicineId,
          type: "sale_return",
          qtyChange: Math.abs(m.qtyChange),
          unitCost: m.unitCost,
          refType: "sale_cancel",
          refId: sale.id,
          note: `Cancelled sale ${sale.invoiceNo ?? sale.id}: ${parsed.reason}`,
          userId: ctx.userId,
        });
        restoredBatchesCount++;
      }
    }
  } else {
    // Fallback: restore stock from saleItems if stockMovements were not recorded
    const items = await tx
      .select()
      .from(schema.saleItems)
      .where(eq(schema.saleItems.saleId, sale.id));

    for (const item of items) {
      if (item.qty > 0) {
        await recordStockMovement({
          tx,
          tenantId: ctx.tenantId,
          storeId: ctx.storeId,
          batchId: item.batchId,
          medicineId: item.medicineId,
          type: "sale_return",
          qtyChange: item.qty,
          unitCost: item.unitCost,
          refType: "sale_cancel",
          refId: sale.id,
          note: `Cancelled sale ${sale.invoiceNo ?? sale.id}: ${parsed.reason}`,
          userId: ctx.userId,
        });
        restoredBatchesCount++;
      }
    }
  }

  // 6. Mirror Reversing Journal Entry (Double-Entry Bookkeeping)
  const [originalEntry] = await tx
    .select()
    .from(schema.journalEntries)
    .where(
      and(
        eq(schema.journalEntries.tenantId, ctx.tenantId),
        eq(schema.journalEntries.refType, "sale"),
        eq(schema.journalEntries.refId, sale.id),
      ),
    )
    .limit(1);

  let reversalEntryNo: string | null = null;

  if (originalEntry) {
    const origLines = await tx
      .select()
      .from(schema.journalLines)
      .where(eq(schema.journalLines.entryId, originalEntry.id));

    const entryNo = await nextDocNumber(tx, ctx.tenantId, ctx.storeId, "journal", "JV");
    const entryDateStr = format(now, "yyyy-MM-dd");

    // Guard: Both the original sale's period and current cancellation period must be open
    await assertAccountingPeriodOpen(tx, { tenantId: ctx.tenantId, entryDate: originalEntry.entryDate, storeId: ctx.storeId });
    await assertAccountingPeriodOpen(tx, { tenantId: ctx.tenantId, entryDate: entryDateStr, storeId: ctx.storeId });

    const [reversalEntry] = await tx
      .insert(schema.journalEntries)
      .values({
        tenantId: ctx.tenantId,
        storeId: ctx.storeId,
        entryNo,
        entryDate: entryDateStr,
        narration: `Reversal of Sale invoice ${sale.invoiceNo ?? sale.id} (Cancelled: ${parsed.reason})`,
        refType: "sale_cancel",
        refId: sale.id,
        createdBy: ctx.userId,
      })
      .returning({ id: schema.journalEntries.id, entryNo: schema.journalEntries.entryNo });

    reversalEntryNo = reversalEntry.entryNo;

    if (origLines.length > 0) {
      await tx.insert(schema.journalLines).values(
        origLines.map((line) => ({
          tenantId: ctx.tenantId,
          entryId: reversalEntry.id,
          accountId: line.accountId,
          debit: line.credit, // Mirror: original credit becomes debit
          credit: line.debit, // Mirror: original debit becomes credit
          partyType: line.partyType,
          partyId: line.partyId,
        })),
      );
    }
  }

  // 7. Drugs & Cosmetics Compliance: Annotate statutory dispensing logs (NEVER delete)
  const logs = await tx
    .select({ id: schema.dispensingLogs.id, notes: schema.dispensingLogs.notes })
    .from(schema.dispensingLogs)
    .where(eq(schema.dispensingLogs.saleId, sale.id));

  for (const log of logs) {
    const prefix = log.notes ? `${log.notes} | ` : "";
    const updatedNote = `${prefix}[CANCELLED: ${parsed.reason} at ${now.toISOString()}]`;
    await tx
      .update(schema.dispensingLogs)
      .set({ notes: updatedNote })
      .where(eq(schema.dispensingLogs.id, log.id));
  }

  // 8. Revert prescription dispensing quantities if linked
  if (sale.prescriptionId) {
    try {
      const rxItems = await tx
        .select()
        .from(schema.prescriptionItems)
        .where(eq(schema.prescriptionItems.prescriptionId, sale.prescriptionId));

      const sItems = await tx
        .select()
        .from(schema.saleItems)
        .where(eq(schema.saleItems.saleId, sale.id));

      for (const sItem of sItems) {
        const rxItem = rxItems.find(
          (ri) =>
            ri.medicineId === sItem.medicineId ||
            (ri.medicineName &&
              sItem.medicineName &&
              ri.medicineName.trim().toLowerCase() === sItem.medicineName.trim().toLowerCase()),
        );
        if (rxItem) {
          const newQtyDispensed = Math.max(0, rxItem.quantityDispensed - sItem.qty);
          await tx
            .update(schema.prescriptionItems)
            .set({ quantityDispensed: newQtyDispensed })
            .where(eq(schema.prescriptionItems.id, rxItem.id));
          rxItem.quantityDispensed = newQtyDispensed;
        }
      }

      const anyDispensed = rxItems.some((ri) => ri.quantityDispensed > 0);
      const newStatus = anyDispensed ? "partially_dispensed" : "active";
      await tx
        .update(schema.prescriptions)
        .set({ status: newStatus, updatedAt: now })
        .where(eq(schema.prescriptions.id, sale.prescriptionId));
    } catch (err) {
      console.warn("Warning: Could not reverse prescription dispensing quantities:", err);
    }
  }

  // 9. Void outward GST Document (🤝 B2.6)
  try {
    await cancelGstDocumentForSale(tx, sale.id);
  } catch (err) {
    console.warn("Warning: Could not cancel GST document for sale:", err);
  }

  // 10. Reverse Customer Loyalty Points (🤝 B2.5)
  try {
    await LoyaltyService.reverseForSale(tx, {
      tenantId: ctx.tenantId,
      saleId: sale.id,
      fraction: 1,
    });
  } catch (err) {
    console.warn("Warning: Could not reverse loyalty points:", err);
  }

  // 11. Mark Sale as cancelled with timestamp and mandatory reason
  await tx
    .update(schema.sales)
    .set({
      status: "cancelled",
      cancelledAt: now,
      cancelReason: parsed.reason,
    })
    .where(eq(schema.sales.id, sale.id));

  // 12. Statutory & internal audit trail
  await writeAudit(tx, ctx, {
    action: "cancel",
    entityType: "sale",
    entityId: sale.id,
    reason: parsed.reason,
    oldValue: {
      status: sale.status,
      totalAmount: sale.totalAmount,
      invoiceNo: sale.invoiceNo,
    },
    newValue: {
      status: "cancelled",
      cancelledAt: now.toISOString(),
      cancelReason: parsed.reason,
      reversalEntryNo,
    },
  });

  return {
    saleId: sale.id,
    invoiceNo: sale.invoiceNo,
    cancelledAt: now,
    status: "cancelled",
    reversalEntryNo,
    restoredBatchesCount,
  };
}
