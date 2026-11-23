 /**
 * src/server/domain/purchases.ts
 *
 * Core domain service for managing purchases (Goods Receipt Notes / GRNs).
 * Computes all financial amounts, landed costs, and GST on the server to prevent client tampering.
 * Enforces landed cost per unit (taxable / (qty + freeQty)), GST rate validation, and inter-state IGST.
 */

import { z } from "zod";
import { schema, type Tx } from "@/server/db";
import { and, eq, inArray } from "drizzle-orm";
import { computePurchaseTotals } from "@/lib/money";
import { isValidGstRateBp, GST_RATES_BP } from "@/lib/regulatory";
import { extractStateCodeFromGstin } from "@/server/domain/gst";
import { nextDocNumber } from "@/server/domain/sequence";
import { recordStockMovement } from "@/server/domain/stock";
import { postPurchaseJournalEntry } from "@/server/domain/accounting";
import { createGstDocumentFromPurchase } from "@/server/domain/gst";
import { enqueue } from "@/server/jobs/outbox";
import { DomainError } from "@/server/errors";
import {
  PENDING_SUPPLIER_PLACEHOLDER_NAME,
  type PendingSupplierMeta,
} from "@/lib/pending-supplier";

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
  tradeDiscountBp: z.number().int().min(0).max(10000, "Trade discount cannot exceed 100%").optional(),
  cashDiscountBp: z.number().int().min(0).max(10000, "Cash discount cannot exceed 100%").optional(),
  schemeType: z.string().optional(),
  unitsPerPack: z.number().int().min(1).optional(),
  packUnit: z.string().optional(),
  looseUnit: z.string().optional(),
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
  tradeDiscountBp?: number;
  cashDiscountBp?: number;
  schemeType?: string;
  unitsPerPack?: number;
  packUnit?: string;
  looseUnit?: string;
  gstRateBp: number; // basis points (must be in GST_RATES_BP)
}

export const PendingSupplierMetaSchema = z.object({
  name: z.string().trim().min(1, "Pending supplier name is required"),
  gstin: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  drugLicenseNo: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
});

export const CreatePurchaseSchema = z
  .object({
    supplierId: z.string().optional().default(""),
    supplierInvoiceNo: z.string().min(1, "Supplier invoice number is required"),
    invoiceDate: z.string().min(1, "Invoice date is required"),
    items: z.array(PurchaseItemInputSchema).min(1, "At least one item is required"),
    purchaseOrderId: z.string().uuid().optional(),
    notes: z.string().optional(),
    pendingSupplierMeta: PendingSupplierMetaSchema.nullable().optional(),
  })
  .refine(
    (data) => Boolean(data.supplierId?.trim() || data.pendingSupplierMeta?.name?.trim()),
    { message: "Supplier is required", path: ["supplierId"] }
  );

export interface CreatePurchaseInput {
  supplierId?: string;
  supplierInvoiceNo: string;
  invoiceDate: string; // YYYY-MM-DD
  items: CreatePurchaseItemInput[];
  purchaseOrderId?: string;
  notes?: string;
  pendingSupplierMeta?: PendingSupplierMeta | null;
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

  const hasSupplierId = Boolean(input.supplierId?.trim());
  const cleanPendingMeta: PendingSupplierMeta | null =
    !hasSupplierId && input.pendingSupplierMeta?.name?.trim()
      ? {
          name: input.pendingSupplierMeta.name.trim(),
          gstin: input.pendingSupplierMeta.gstin?.trim().toUpperCase() || null,
          phone: input.pendingSupplierMeta.phone?.trim() || null,
          drugLicenseNo: input.pendingSupplierMeta.drugLicenseNo?.trim().toUpperCase() || null,
          address: input.pendingSupplierMeta.address?.trim() || null,
        }
      : null;

  if (!hasSupplierId && !cleanPendingMeta) {
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

  // 2. Fetch Supplier (or resolve internal pending-supplier placeholder) & Store to determine Inter-State status
  let supplier: { id: string; name: string; gstin: string | null; stateCode: string | null } | undefined;

  if (hasSupplierId) {
    const [found] = await tx
      .select({
        id: schema.suppliers.id,
        name: schema.suppliers.name,
        gstin: schema.suppliers.gstin,
        stateCode: schema.suppliers.stateCode,
      })
      .from(schema.suppliers)
      .where(
        and(
          eq(schema.suppliers.id, input.supplierId!.trim()),
          eq(schema.suppliers.tenantId, ctx.tenantId)
        )
      )
      .limit(1);
    supplier = found;
  } else if (cleanPendingMeta) {
    const [existingPlaceholder] = await tx
      .select({
        id: schema.suppliers.id,
        name: schema.suppliers.name,
        gstin: schema.suppliers.gstin,
        stateCode: schema.suppliers.stateCode,
      })
      .from(schema.suppliers)
      .where(
        and(
          eq(schema.suppliers.tenantId, ctx.tenantId),
          eq(schema.suppliers.name, PENDING_SUPPLIER_PLACEHOLDER_NAME)
        )
      )
      .limit(1);

    if (existingPlaceholder) {
      supplier = existingPlaceholder;
    } else {
      const [createdPlaceholder] = await tx
        .insert(schema.suppliers)
        .values({
          tenantId: ctx.tenantId,
          name: PENDING_SUPPLIER_PLACEHOLDER_NAME,
          isActive: false,
        })
        .returning({
          id: schema.suppliers.id,
          name: schema.suppliers.name,
          gstin: schema.suppliers.gstin,
          stateCode: schema.suppliers.stateCode,
        });
      supplier = createdPlaceholder;
    }
  }

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
  const supplierStateCode = (
    supplier.stateCode ||
    extractStateCodeFromGstin(supplier.gstin ?? cleanPendingMeta?.gstin) ||
    storeStateCode
  ).padStart(2, "0");
  const isInterState = supplierStateCode !== storeStateCode;

  // 2b. Fetch Medicines for packaging conversion & metadata snapshots
  const medIds = input.items.map((i) => i.medicineId);
  const dbMedicines = await tx
    .select()
    .from(schema.medicines)
    .where(and(eq(schema.medicines.tenantId, ctx.tenantId), inArray(schema.medicines.id, medIds)));

  // 3. Compute Totals on Server
  const normalizedLines = input.items.map((item) => {
    const med = dbMedicines.find((m) => m.id === item.medicineId);
    const upp = Math.max(1, item.unitsPerPack ?? med?.unitsPerPack ?? 1);
    const tradeDiscountBp = item.tradeDiscountBp ?? item.discountBp ?? 0;
    const cashDiscountBp = item.cashDiscountBp ?? 0;
    return {
      qty: item.qty,
      freeQty: item.freeQty ?? 0,
      rate: item.rate,
      discountBp: tradeDiscountBp,
      tradeDiscountBp,
      cashDiscountBp,
      unitsPerPack: upp,
      gstRateBp: item.gstRateBp,
    };
  });

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

      purchaseOrderId: input.purchaseOrderId ?? null,
      supplierInvoiceNo: cleanInvoiceNo,
      invoiceDate: input.invoiceDate,
      isInterState,
      grossAmount: totals.gross,
      discountAmount: totals.discount,
      tradeDiscountAmount: totals.tradeDiscount,
      cashDiscountAmount: totals.cashDiscount,
      taxableAmount: totals.taxable,
      cgst: totals.cgst,
      sgst: totals.sgst,
      igst: totals.igst,
      roundOff: totals.roundOff,
      totalAmount: totals.total,
      status: "posted",
      pendingSupplierMeta: cleanPendingMeta,
      notes: input.notes ?? null,
      createdBy: ctx.userId,
    })
    .returning();

  // 6. Process Items, Batches and Landed Unit Costs
  const insertedItems = [];

  for (let i = 0; i < input.items.length; i++) {
    const item = input.items[i];
    const lineRes = totals.lines[i];
    const med = dbMedicines.find((m) => m.id === item.medicineId);
    const upp = Math.max(1, item.unitsPerPack ?? med?.unitsPerPack ?? 1);
    const packUnit = item.packUnit ?? med?.packUnit ?? "strip";
    const looseUnit = item.looseUnit ?? med?.looseUnit ?? "tablet";
    const tradeDiscountBp = item.tradeDiscountBp ?? item.discountBp ?? 0;
    const cashDiscountBp = item.cashDiscountBp ?? 0;

    const landedCost = lineRes.landedUnitCost; // taxable / totalBaseUnits
    const cleanBatchNo = item.batchNo.trim().toUpperCase();

    // Check if batch already exists in this store
    let batchId = "";
    const [existingBatch] = await tx
      .select({
        id: schema.batches.id,
        supplierId: schema.batches.supplierId,
      })
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
      // Update batch purchaseRate to current landed cost and backfill supplier if missing
      await tx
        .update(schema.batches)
        .set({
          purchaseRate: landedCost,
          mrp: item.mrp,
          saleRate: item.saleRate,
          expiryDate: item.expiryDate,
          ...(!existingBatch.supplierId ? { supplierId: supplier.id } : {}),
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

    // Record stock movement (canonical base units: (qty + freeQty) * unitsPerPack)
    const totalPacksReceived = item.qty + (item.freeQty ?? 0);
    const totalBaseUnitsReceived = totalPacksReceived * upp;
    await recordStockMovement({
      tx: tx as unknown as Tx,
      tenantId: ctx.tenantId,
      storeId: ctx.storeId,
      batchId,
      medicineId: item.medicineId,
      type: "purchase",
      qtyChange: totalBaseUnitsReceived,
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
        unitsPerPack: upp,
        packUnit,
        looseUnit,
        schemeType: item.schemeType ?? (item.freeQty ? `${item.qty}+${item.freeQty}` : null),
        qty: item.qty,
        freeQty: item.freeQty ?? 0,
        rate: item.rate,
        mrp: item.mrp,
        saleRate: item.saleRate,
        discountBp: tradeDiscountBp,
        tradeDiscountBp,
        cashDiscountBp,
        discountAmount: lineRes.tradeDiscount,
        cashDiscountAmount: lineRes.cashDiscount,
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

  // 6b. If received against a Purchase Order, update PO received quantities & status
  if (input.purchaseOrderId) {
    const poItems = await tx
      .select()
      .from(schema.purchaseOrderItems)
      .where(eq(schema.purchaseOrderItems.purchaseOrderId, input.purchaseOrderId));

    for (const item of input.items) {
      const match = poItems.find((p) => p.medicineId === item.medicineId);
      if (match) {
        const totalReceived = (item.qty ?? 0) + (item.freeQty ?? 0);
        await tx
          .update(schema.purchaseOrderItems)
          .set({
            receivedQty: match.receivedQty + totalReceived,
          })
          .where(eq(schema.purchaseOrderItems.id, match.id));
      }
    }

    const updatedPoItems = await tx
      .select({ qty: schema.purchaseOrderItems.qty, receivedQty: schema.purchaseOrderItems.receivedQty })
      .from(schema.purchaseOrderItems)
      .where(eq(schema.purchaseOrderItems.purchaseOrderId, input.purchaseOrderId));

    const isFullyReceived = updatedPoItems.length > 0 && updatedPoItems.every((i) => i.receivedQty >= i.qty);
    await tx
      .update(schema.purchaseOrders)
      .set({
        status: isFullyReceived ? "received" : "partially_received",
      })
      .where(eq(schema.purchaseOrders.id, input.purchaseOrderId));
  }

  // 6c. Auto-fulfill Promise Orders for received medicines
  const receivedMedIds = input.items.map((i) => i.medicineId);
  if (receivedMedIds.length > 0) {
    const pendingPromiseOrders = await tx
      .select()
      .from(schema.promiseOrders)
      .where(
        and(
          eq(schema.promiseOrders.tenantId, ctx.tenantId),
          eq(schema.promiseOrders.storeId, ctx.storeId),
          inArray(schema.promiseOrders.medicineId, receivedMedIds),
          inArray(schema.promiseOrders.status, ["pending", "ordered"])
        )
      );

    if (pendingPromiseOrders.length > 0) {
      await tx
        .update(schema.promiseOrders)
        .set({ status: "fulfilled" })
        .where(
          inArray(
            schema.promiseOrders.id,
            pendingPromiseOrders.map((p) => p.id)
          )
        );

      for (const pOrder of pendingPromiseOrders) {
        if (pOrder.customerPhone) {
          await enqueue(tx, ctx.tenantId, "sms.send", {
            phone: pOrder.customerPhone,
            message: `Hello ${pOrder.customerName}, your requested medicine (${pOrder.medicineName}) is now in stock at MediFlow. Please visit the store to collect it.`,
          });
        }
      }
    }
  }

  // 7. Post Double-Entry Journal Entry
  await postPurchaseJournalEntry({
    tx: tx as unknown as Tx,
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
    cashDiscountAmount: totals.cashDiscount,
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

/**
 * Links an existing or newly created supplier to a purchase GRN that was posted
 * before the supplier was registered in the store directory.
 */
export async function resolvePendingPurchaseSupplier(
  tx: Tx,
  ctx: { tenantId: string },
  params: {
    purchaseId: string;
    supplierId: string;
  }
) {
  const [purchase] = await tx
    .select({
      id: schema.purchases.id,
      storeId: schema.purchases.storeId,
      supplierId: schema.purchases.supplierId,
      pendingSupplierMeta: schema.purchases.pendingSupplierMeta,
    })
    .from(schema.purchases)
    .where(
      and(
        eq(schema.purchases.id, params.purchaseId),
        eq(schema.purchases.tenantId, ctx.tenantId)
      )
    )
    .limit(1);

  if (!purchase) {
    throw new DomainError("PURCHASE_NOT_FOUND", "Purchase invoice not found.");
  }

  const [targetSupplier] = await tx
    .select({
      id: schema.suppliers.id,
      name: schema.suppliers.name,
      gstin: schema.suppliers.gstin,
      stateCode: schema.suppliers.stateCode,
    })
    .from(schema.suppliers)
    .where(
      and(
        eq(schema.suppliers.id, params.supplierId),
        eq(schema.suppliers.tenantId, ctx.tenantId)
      )
    )
    .limit(1);

  if (!targetSupplier) {
    throw new DomainError("SUPPLIER_NOT_FOUND", "Target supplier not found.");
  }

  const oldSupplierId = purchase.supplierId;

  await tx
    .update(schema.purchases)
    .set({
      supplierId: targetSupplier.id,
      pendingSupplierMeta: null,
    })
    .where(eq(schema.purchases.id, purchase.id));

  // Re-link batches created by this GRN if they still point to the placeholder
  const purchaseBatchRows = await tx
    .select({ batchId: schema.purchaseItems.batchId })
    .from(schema.purchaseItems)
    .where(eq(schema.purchaseItems.purchaseId, purchase.id));

  const batchIds = purchaseBatchRows.map((b) => b.batchId);
  if (batchIds.length > 0 && oldSupplierId !== targetSupplier.id) {
    await tx
      .update(schema.batches)
      .set({ supplierId: targetSupplier.id })
      .where(
        and(
          eq(schema.batches.tenantId, ctx.tenantId),
          eq(schema.batches.supplierId, oldSupplierId),
          inArray(schema.batches.id, batchIds)
        )
      );
  }

  // Re-link journal lines for this purchase
  if (oldSupplierId !== targetSupplier.id) {
    const entries = await tx
      .select({ id: schema.journalEntries.id })
      .from(schema.journalEntries)
      .where(
        and(
          eq(schema.journalEntries.tenantId, ctx.tenantId),
          eq(schema.journalEntries.refType, "purchase"),
          eq(schema.journalEntries.refId, purchase.id)
        )
      );

    const entryIds = entries.map((e) => e.id);
    if (entryIds.length > 0) {
      await tx
        .update(schema.journalLines)
        .set({ partyId: targetSupplier.id })
        .where(
          and(
            eq(schema.journalLines.tenantId, ctx.tenantId),
            eq(schema.journalLines.partyType, "supplier"),
            eq(schema.journalLines.partyId, oldSupplierId),
            inArray(schema.journalLines.entryId, entryIds)
          )
        );
    }
  }

  // Update inward GST document counterparty metadata
  const derivedStateCode =
    targetSupplier.stateCode || extractStateCodeFromGstin(targetSupplier.gstin) || null;
  await tx
    .update(schema.gstDocuments)
    .set({
      partyName: targetSupplier.name,
      partyGstin: targetSupplier.gstin || null,
      ...(derivedStateCode ? { partyStateCode: derivedStateCode.padStart(2, "0") } : {}),
    })
    .where(
      and(
        eq(schema.gstDocuments.tenantId, ctx.tenantId),
        eq(schema.gstDocuments.refType, "purchase"),
        eq(schema.gstDocuments.refId, purchase.id)
      )
    );

  return { purchaseId: purchase.id, supplierId: targetSupplier.id };
}
