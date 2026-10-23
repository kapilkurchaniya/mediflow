/**
 * src/server/domain/purchases.ts
 *
 * Core domain service for managing purchases (Goods Receipt Notes / GRNs).
 * Computes all financial amounts, landed costs, and GST on the server to prevent client tampering.
 * Enforces landed cost per unit (taxable / (qty + freeQty)), GST rate validation, and inter-state IGST.
 */

import { z } from "zod";
import { schema, type Tx } from "@/server/db";
import { and, eq } from "drizzle-orm";
import { computePurchaseTotals } from "@/lib/money";
import { isValidGstRateBp, GST_RATES_BP } from "@/lib/regulatory";
import { extractStateCodeFromGstin } from "@/server/domain/gst";
import { nextDocNumber } from "@/server/domain/sequence";
import { recordStockMovement } from "@/server/domain/stock";
import { postPurchaseJournalEntry } from "@/server/domain/accounting";
import { createGstDocumentFromPurchase } from "@/server/domain/gst";
import { DomainError } from "@/server/errors";

export const PurchaseItemInputSchema = z.object({
  medicineId: z.string().min(1, "Medicine is required"),
  batchNo: z.string().min(1, "Batch number is required"),
  expiryDate: z.string().min(1, "Expiry date is required"),
  qty: z.number().int().positive("Quantity must be greater than zero"),
  freeQty: z.number().int().min(0, "Free quantity cannot be negative").default(0),
  rate: z.number().int().min(0, "Rate cannot be negative"), // paise
  mrp: z.number().int().min(0, "MRP cannot be negative"), // paise
  saleRate: z.number().int().min(0, "Sale rate cannot be negative"), // paise
  discountBp: z.number().int().min(0).max(10000, "Discount cannot exceed 100%").default(0),
  gstRateBp: z.number().int().refine((bp) => isValidGstRateBp(bp), {
    message: "Invalid GST rate",
  }),
});

export type PurchaseItemInput = z.infer<typeof PurchaseItemInputSchema>;

export interface CreatePurchaseItemInput {
  medicineId: string;
  batchNo: string;
  expiryDate: string;
  qty: number;
  freeQty?: number;
  rate: number; // paise, GST-exclusive
  mrp: number; // paise
  saleRate: number; // paise
  discountBp?: number; // basis points, default 0
  gstRateBp: number; // basis points (must be in GST_RATES_BP)
}

export const CreatePurchaseSchema = z.object({
  supplierId: z.string().min(1, "Supplier is required"),
  supplierInvoiceNo: z.string().min(1, "Supplier invoice number is required"),
  invoiceDate: z.string().min(1, "Invoice date is required"),
  items: z.array(PurchaseItemInputSchema).min(1, "At least one item is required"),
  notes: z.string().optional(),
});

export interface CreatePurchaseInput {
  supplierId: string;
  supplierInvoiceNo: string;
  invoiceDate: string; // YYYY-MM-DD
  items: CreatePurchaseItemInput[];
  notes?: string;
}

export interface PurchaseContext {
  tenantId: string;
  storeId: string;
  userId: string;
}

/**
 * Validates input, recomputes all purchase figures server-side, updates batch inventory
 * with the landed cost, records stock movements and double-entry journals, and returns the created purchase.
 */
export async function createPurchase(
  tx: Tx,
  ctx: PurchaseContext,
  input: CreatePurchaseInput
) {
  if (!input.items || input.items.length === 0) {
    throw new DomainError("EMPTY_PURCHASE", "At least one purchase item is required.");
  }

  if (!input.supplierId?.trim()) {
    throw new DomainError("INVALID_SUPPLIER", "Supplier is required.");
  }

  const cleanInvoiceNo = input.supplierInvoiceNo?.trim();
  if (!cleanInvoiceNo) {
    throw new DomainError("INVALID_INVOICE_NO", "Supplier invoice number is required.");
  }

  // 1. Validate line items
  for (const item of input.items) {
    if (!item.medicineId?.trim()) {
      throw new DomainError("INVALID_MEDICINE", "Medicine is required for all items.");
    }
    if (!item.batchNo?.trim()) {
      throw new DomainError("INVALID_BATCH", "Batch number is required for all items.");
    }
    if (!item.expiryDate?.trim()) {
      throw new DomainError("INVALID_EXPIRY", "Expiry date is required for all items.");
    }
    if (!Number.isInteger(item.qty) || item.qty <= 0) {
      throw new DomainError("INVALID_QUANTITY", "Quantity must be an integer greater than zero.");
    }
    const free = item.freeQty ?? 0;
    if (!Number.isInteger(free) || free < 0) {
      throw new DomainError("INVALID_FREE_QUANTITY", "Free quantity must be a non-negative integer.");
    }
    if (!Number.isInteger(item.rate) || item.rate < 0) {
      throw new DomainError("INVALID_RATE", "Rate must be a non-negative integer in paise.");
    }
    if (!Number.isInteger(item.mrp) || item.mrp < 0) {
      throw new DomainError("INVALID_MRP", "MRP must be a non-negative integer in paise.");
    }
    if (!Number.isInteger(item.saleRate) || item.saleRate < 0) {
      throw new DomainError("INVALID_SALE_RATE", "Sale rate must be a non-negative integer in paise.");
    }
    const disc = item.discountBp ?? 0;
    if (!Number.isInteger(disc) || disc < 0 || disc > 10000) {
      throw new DomainError("INVALID_DISCOUNT", "Discount must be between 0% and 100% (0-10000 basis points).");
    }
    if (!isValidGstRateBp(item.gstRateBp)) {
      throw new DomainError(
        "INVALID_GST_RATE",
        `Invalid GST rate ${item.gstRateBp} bp. Allowed rates are: ${GST_RATES_BP.join(", ")}.`
      );
    }
  }

  // 2. Fetch Supplier & Store to determine Inter-State status
  const [supplier] = await tx
    .select({
      id: schema.suppliers.id,
      name: schema.suppliers.name,
      gstin: schema.suppliers.gstin,
      stateCode: schema.suppliers.stateCode,
    })
    .from(schema.suppliers)
    .where(
      and(
        eq(schema.suppliers.id, input.supplierId.trim()),
        eq(schema.suppliers.tenantId, ctx.tenantId)
      )
    )
    .limit(1);

  if (!supplier) {
    throw new DomainError("SUPPLIER_NOT_FOUND", "Supplier not found or does not belong to this tenant.");
  }

  const [store] = await tx
    .select({
      id: schema.stores.id,
      stateCode: schema.stores.stateCode,
      gstin: schema.stores.gstin,
    })
    .from(schema.stores)
    .where(
      and(
        eq(schema.stores.id, ctx.storeId),
        eq(schema.stores.tenantId, ctx.tenantId)
      )
    )
    .limit(1);

  const storeStateCode = (store?.stateCode || extractStateCodeFromGstin(store?.gstin) || "27").padStart(2, "0");
  const supplierStateCode = (supplier.stateCode || extractStateCodeFromGstin(supplier.gstin) || storeStateCode).padStart(2, "0");
  const isInterState = supplierStateCode !== storeStateCode;

  // 3. Compute Totals on Server
  const normalizedLines = input.items.map((item) => ({
    qty: item.qty,
    freeQty: item.freeQty ?? 0,
    rate: item.rate,
    discountBp: item.discountBp ?? 0,
    gstRateBp: item.gstRateBp,
  }));

  const totals = computePurchaseTotals(normalizedLines, isInterState);

  // 4. Generate Internal Purchase Number (gap-free, row-locked)
  const purchaseNo = await nextDocNumber(tx, ctx.tenantId, ctx.storeId, "purchase", "PUR");

  // 5. Create Purchase Header
  const [purchase] = await tx
    .insert(schema.purchases)
    .values({
      tenantId: ctx.tenantId,
      storeId: ctx.storeId,
      purchaseNo,
      supplierId: supplier.id,
      supplierInvoiceNo: cleanInvoiceNo,
      invoiceDate: input.invoiceDate,
      isInterState,
      grossAmount: totals.gross,
      discountAmount: totals.discount,
      taxableAmount: totals.taxable,
      cgst: totals.cgst,
      sgst: totals.sgst,
      igst: totals.igst,
      roundOff: totals.roundOff,
      totalAmount: totals.total,
      status: "posted",
      notes: input.notes ?? null,
      createdBy: ctx.userId,
    })
    .returning();

  // 6. Process Items, Batches and Landed Unit Costs
  const insertedItems = [];

  for (let i = 0; i < input.items.length; i++) {
    const item = input.items[i];
    const lineRes = totals.lines[i];
    const landedCost = lineRes.landedUnitCost; // taxable / (qty + free)
    const cleanBatchNo = item.batchNo.trim().toUpperCase();

    // Check if batch already exists in this store
    let batchId = "";
    const [existingBatch] = await tx
      .select({ id: schema.batches.id })
      .from(schema.batches)
      .where(
        and(
          eq(schema.batches.storeId, ctx.storeId),
          eq(schema.batches.medicineId, item.medicineId),
          eq(schema.batches.batchNo, cleanBatchNo)
        )
      )
      .limit(1);

    if (existingBatch) {
      batchId = existingBatch.id;
      // Update batch purchaseRate to current landed cost
      await tx
        .update(schema.batches)
        .set({
          purchaseRate: landedCost,
          mrp: item.mrp,
          saleRate: item.saleRate,
          expiryDate: item.expiryDate,
        })
        .where(eq(schema.batches.id, batchId));
    } else {
      const [newBatch] = await tx
        .insert(schema.batches)
        .values({
          tenantId: ctx.tenantId,
          storeId: ctx.storeId,
          medicineId: item.medicineId,
          batchNo: cleanBatchNo,
          expiryDate: item.expiryDate,
          purchaseRate: landedCost, // landed unit cost
          mrp: item.mrp,
          saleRate: item.saleRate,
          supplierId: supplier.id,
          qtyOnHand: 0,
          status: "active",
        })
        .returning({ id: schema.batches.id });
      batchId = newBatch.id;
    }

    // Record stock movement (qty + freeQty)
    const totalQtyReceived = item.qty + (item.freeQty ?? 0);
    await recordStockMovement({
      tx: tx as any,
      tenantId: ctx.tenantId,
      storeId: ctx.storeId,
      batchId,
      medicineId: item.medicineId,
      type: "purchase",
      qtyChange: totalQtyReceived,
      unitCost: landedCost, // landed unit cost
      refType: "purchase",
      refId: purchase.id,
      userId: ctx.userId,
    });

    // Record Purchase Item
    const [insertedItem] = await tx
      .insert(schema.purchaseItems)
      .values({
        tenantId: ctx.tenantId,
        purchaseId: purchase.id,
        medicineId: item.medicineId,
        batchId,
        batchNo: cleanBatchNo,
        expiryDate: item.expiryDate,
        qty: item.qty,
        freeQty: item.freeQty ?? 0,
        rate: item.rate,
        mrp: item.mrp,
        saleRate: item.saleRate,
        discountBp: item.discountBp ?? 0,
        discountAmount: lineRes.discount,
        taxableAmount: lineRes.taxable,
        gstRateBp: item.gstRateBp,
        cgst: lineRes.cgst,
        sgst: lineRes.sgst,
        igst: lineRes.igst,
        totalAmount: lineRes.total,
        landedUnitCost: landedCost, // populated landed unit cost
      })
      .returning();

    insertedItems.push(insertedItem);
  }

  // 7. Post Double-Entry Journal Entry
  await postPurchaseJournalEntry({
    tx: tx as any,
    tenantId: ctx.tenantId,
    storeId: ctx.storeId,
    userId: ctx.userId,
    purchaseId: purchase.id,
    purchaseNo,
    supplierId: supplier.id,
    supplierInvoiceNo: cleanInvoiceNo,
    invoiceDate: input.invoiceDate,
    taxableAmount: totals.taxable,
    cgst: totals.cgst,
    sgst: totals.sgst,
    igst: totals.igst,
    roundOff: totals.roundOff,
    totalAmount: totals.total,
  });

  // 8. Record Inward GST Document (ITC claim)
  try {
    await createGstDocumentFromPurchase(tx, {
      purchaseId: purchase.id,
      tenantId: ctx.tenantId,
      storeId: ctx.storeId,
    });
  } catch (gstErr) {
    console.error("Warning: Purchase GST Document auto-creation error:", gstErr);
  }

  return { purchase, items: insertedItems, totals };
}
