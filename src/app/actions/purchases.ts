"use server";

import { z } from "zod";
import { db, schema } from "@/server/db";
import { eq, and, desc, gte, lte } from "drizzle-orm";
import { requirePermission } from "@/server/rbac";
import { protectedAction } from "@/server/action";
import { revalidatePath } from "next/cache";
import { isUniqueViolation } from "@/server/db/errors";
import { DomainError } from "@/server/errors";
import {
  createPurchase,
  CreatePurchaseSchema,
  PurchaseItemInputSchema,
  type CreatePurchaseInput,
  type PurchaseItemInput,
} from "@/server/domain/purchases";

export type { PurchaseItemInput };

export async function getPurchases(dateFrom?: string | null, dateTo?: string | null) {
  const ctx = await requirePermission("purchase.view");

  const conditions = [
    eq(schema.purchases.tenantId, ctx.tenantId),
    eq(schema.purchases.storeId, ctx.storeId),
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

export async function getPurchaseById(purchaseId: string) {
  const ctx = await requirePermission("purchase.view");

  const [res] = await db
    .select({
      purchase: schema.purchases,
      supplier: schema.suppliers,
      store: schema.stores,
    })
    .from(schema.purchases)
    .innerJoin(schema.suppliers, eq(schema.purchases.supplierId, schema.suppliers.id))
    .innerJoin(schema.stores, eq(schema.purchases.storeId, schema.stores.id))
    .where(
      and(
        eq(schema.purchases.id, purchaseId),
        eq(schema.purchases.tenantId, ctx.tenantId),
        eq(schema.purchases.storeId, ctx.storeId)
      )
    )
    .limit(1);

  if (!res) return null;

  const items = await db
    .select({
      item: schema.purchaseItems,
      medicine: schema.medicines,
    })
    .from(schema.purchaseItems)
    .innerJoin(schema.medicines, eq(schema.purchaseItems.medicineId, schema.medicines.id))
    .where(eq(schema.purchaseItems.purchaseId, purchaseId));

  return {
    purchase: res.purchase,
    supplier: res.supplier,
    store: res.store,
    items,
  };
}

function revalidatePurchasePaths() {
  revalidatePath("/dashboard/purchases");
  revalidatePath("/dashboard/accounting");
  revalidatePath("/dashboard/gst");
  revalidatePath("/dashboard/inventory/batches");
}

/**
 * Safe action for purchase creation using next-safe-action.
 */
export const createPurchaseAction = protectedAction("purchase.create")
  .inputSchema(CreatePurchaseSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    try {
      const res = await db.transaction(async (tx) => {
        return await createPurchase(tx, ctx, input);
      });
      revalidatePurchasePaths();
      return { success: true, purchase: res.purchase, totals: res.totals };
    } catch (err: unknown) {
      if (isUniqueViolation(err, "purchases_supplier_invoice_uq")) {
        throw new DomainError("DUPLICATE_INVOICE", "This invoice number has already been entered for this supplier.");
      }
      throw err;
    }
  });

/**
 * Server action callable both with object payload or positional arguments for backwards compatibility.
 */
export async function createPurchaseInvoice(
  supplierIdOrInput: string | z.infer<typeof CreatePurchaseSchema>,
  supplierInvoiceNo?: string,
  invoiceDate?: string,
  items?: PurchaseItemInput[],
  notes?: string
): Promise<{ success?: boolean; purchaseId?: string; error?: string }> {
  const ctx = await requirePermission("purchase.create");

  let parsed: CreatePurchaseInput;
  try {
    if (typeof supplierIdOrInput === "object" && supplierIdOrInput !== null) {
      parsed = CreatePurchaseSchema.parse(supplierIdOrInput);
    } else {
      parsed = CreatePurchaseSchema.parse({
        supplierId: supplierIdOrInput,
        supplierInvoiceNo,
        invoiceDate,
        items,
        notes,
      });
    }
  } catch (validationErr) {
    if (validationErr instanceof z.ZodError) {
      return { error: validationErr.issues[0]?.message || "Validation failed" };
    }
    return { error: "Invalid purchase input" };
  }

  try {
    const res = await db.transaction(async (tx) => {
      return await createPurchase(tx, ctx, parsed);
    });

    revalidatePurchasePaths();
    return { success: true, purchaseId: res.purchase.id };
  } catch (err: unknown) {
    if (isUniqueViolation(err, "purchases_supplier_invoice_uq")) {
      return { error: "This invoice number has already been entered for this supplier." };
    }
    if (err instanceof DomainError) {
      return { error: err.message };
    }
    return { error: (err instanceof Error ? err.message : String(err)) || "Failed to create purchase invoice" };
  }
}
