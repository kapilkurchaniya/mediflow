"use server";

import { db, schema } from "@/server/db";
import { eq, and, desc, gte, lte } from "drizzle-orm";
import { getCurrentSession, requireAuth } from "@/server/auth";
import { recordStockMovement } from "@/server/domain/stock";
import { nextDocNumber } from "@/server/domain/sequence";
import { revalidatePath } from "next/cache";

export async function getPurchases(dateFrom?: string | null, dateTo?: string | null) {
  const { session, user } = await requireAuth();

  const conditions = [
    eq(schema.purchases.tenantId, session.tenantId),
    eq(schema.purchases.storeId, session.storeId),
  ];

  if (dateFrom) {
    conditions.push(gte(schema.purchases.invoiceDate, dateFrom));
  }
  if (dateTo) {
    conditions.push(lte(schema.purchases.invoiceDate, dateTo));
  }

  return db
    .select({
      purchase: schema.purchases,
      supplier: schema.suppliers,
    })
    .from(schema.purchases)
    .innerJoin(schema.suppliers, eq(schema.purchases.supplierId, schema.suppliers.id))
    .where(and(...conditions))
    .orderBy(desc(schema.purchases.invoiceDate));
}

export type PurchaseItemInput = {
  medicineId: string;
  batchNo: string;
  expiryDate: string;
  qty: number;
  freeQty: number;
  rate: number; // paise
  mrp: number; // paise
  saleRate: number; // paise
  discountBp: number; // basis points
  gstRateBp: number; // basis points
};

export async function createPurchaseInvoice(
  supplierId: string,
  supplierInvoiceNo: string,
  invoiceDate: string,
  items: PurchaseItemInput[]
) {
  const { session, user } = await requireAuth();

  if (items.length === 0) return { error: "No items added" };

  try {
    await db.transaction(async (tx) => {
      // 1. Calculate Totals
      let grossAmount = 0;
      let totalTaxAmount = 0;
      let totalDiscountAmount = 0;

      const processedItems = items.map(item => {
        const itemGross = item.qty * item.rate;
        const discountAmount = Math.round((itemGross * item.discountBp) / 10000);
        const taxableAmount = itemGross - discountAmount;
        const taxAmount = Math.round((taxableAmount * item.gstRateBp) / 10000);
        const totalAmount = taxableAmount + taxAmount;

        grossAmount += itemGross;
        totalDiscountAmount += discountAmount;
        totalTaxAmount += taxAmount;

        return { ...item, discountAmount, taxableAmount, taxAmount, totalAmount };
      });

      const totalInvoiceAmount = grossAmount - totalDiscountAmount + totalTaxAmount;

      // 2. Generate Internal Purchase Number (gap-free, row-locked)
      const purchaseNo = await nextDocNumber(tx, session.tenantId, session.storeId, "purchase", "PUR");

      // 3. Create Purchase Header
      const [purchase] = await tx.insert(schema.purchases).values({
        tenantId: session.tenantId,
        storeId: session.storeId,
        purchaseNo,
        supplierId,
        supplierInvoiceNo,
        invoiceDate,
        grossAmount,
        discountAmount: totalDiscountAmount,
        taxableAmount: grossAmount - totalDiscountAmount,
        cgst: totalTaxAmount / 2,
        sgst: totalTaxAmount / 2,
        igst: 0,
        totalAmount: totalInvoiceAmount,
        status: "posted",
        createdBy: user.id,
      }).returning({ id: schema.purchases.id });

      // 4. Process Items & Batches
      for (const item of processedItems) {
        // Find or create batch
        let batchId = "";
        const [existingBatch] = await tx
          .select()
          .from(schema.batches)
          .where(
            and(
              eq(schema.batches.storeId, session.storeId),
              eq(schema.batches.medicineId, item.medicineId),
              eq(schema.batches.batchNo, item.batchNo)
            )
          )
          .limit(1);

        if (existingBatch) {
          batchId = existingBatch.id;
        } else {
          const [newBatch] = await tx.insert(schema.batches).values({
            tenantId: session.tenantId,
            storeId: session.storeId,
            medicineId: item.medicineId,
            batchNo: item.batchNo,
            expiryDate: item.expiryDate,
            purchaseRate: item.rate,
            mrp: item.mrp,
            saleRate: item.saleRate,
            supplierId: supplierId,
            qtyOnHand: 0,
            status: "active",
          }).returning({ id: schema.batches.id });
          batchId = newBatch.id;
        }

        // Add to inventory ledger (including free qty)
        const totalQtyReceived = item.qty + item.freeQty;
        await recordStockMovement({
          tx,
          tenantId: session.tenantId,
          storeId: session.storeId,
          batchId,
          medicineId: item.medicineId,
          type: "purchase",
          qtyChange: totalQtyReceived,
          unitCost: item.rate,
          refType: "purchase",
          refId: purchase.id,
          userId: user.id,
        });

        // Record Purchase Item
        await tx.insert(schema.purchaseItems).values({
          tenantId: session.tenantId,
          purchaseId: purchase.id,
          medicineId: item.medicineId,
          batchId,
          batchNo: item.batchNo,
          expiryDate: item.expiryDate,
          qty: item.qty,
          freeQty: item.freeQty,
          rate: item.rate,
          mrp: item.mrp,
          saleRate: item.saleRate,
          discountBp: item.discountBp,
          discountAmount: item.discountAmount,
          taxableAmount: item.taxableAmount,
          gstRateBp: item.gstRateBp,
          cgst: item.taxAmount / 2,
          sgst: item.taxAmount / 2,
          igst: 0,
          totalAmount: item.totalAmount,
        });
      }

      // (Optional) Here we would insert into journal_entries to debit Inventory/Purchases and credit Accounts Payable (Supplier)
      // Since accounts might not be fully seeded yet, we can skip strict double-entry insert for this MVP step and rely on the purchase record.
    });

    revalidatePath("/dashboard/purchases");
    return { success: true };
  } catch (err: unknown) {
    if ((err instanceof Error ? err.message : String(err))?.includes("purchases_supplier_invoice_uq")) {
      return { error: "This invoice number has already been entered for this supplier." };
    }
    return { error: (err instanceof Error ? err.message : String(err)) || "Failed to create purchase invoice" };
  }
}
