"use server";

import { db, schema } from "@/server/db";
import { eq, and, asc, desc, gt, gte, lte, ilike, or, sql, inArray, ne } from "drizzle-orm";
import { checkPermission, requirePermission } from "@/server/rbac";
import { revalidatePath } from "next/cache";
import { format } from "date-fns";
import { createSale } from "@/server/domain/sales/create-sale";
import type { SaleInput, SalePayment } from "@/server/domain/sales/types";
import {
  holdSale,
  listHeldSales,
  resumeHeldSale,
  discardHeldSale,
  type HoldSaleInput,
} from "@/server/domain/sales/held";
import { cancelSale } from "@/server/domain/sales/cancel-sale";
import {
  returnSale,
  getReturnableSaleDetails,
  type ReturnSaleInput,
} from "@/server/domain/sales/return-sale";

export async function getSales(dateFrom?: string | null, dateTo?: string | null) {
  const ctx = await requirePermission("sale.view");

  const conditions = [
    eq(schema.sales.tenantId, ctx.tenantId),
    eq(schema.sales.storeId, ctx.storeId),
    ne(schema.sales.status, "held"),
  ];

  // Apply date filters if provided
  if (dateFrom) {
    conditions.push(gte(schema.sales.createdAt, new Date(dateFrom + "T00:00:00")));
  }
  if (dateTo) {
    conditions.push(lte(schema.sales.createdAt, new Date(dateTo + "T23:59:59.999")));
  }

  return db
    .select({
      sale: schema.sales,
      customer: schema.customers,
    })
    .from(schema.sales)
    .leftJoin(schema.customers, eq(schema.sales.customerId, schema.customers.id))
    .where(and(...conditions))
    .orderBy(desc(schema.sales.createdAt));
}

// POS Search: Returns medicines with their nearest expiry batches that have stock
export async function searchPosItems(query: string) {
  const ctx = await requirePermission("sale.create");
  
  if (!query || query.length < 2) return [];

  const lowerQuery = query.toLowerCase();
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  // Find medicines matching query (by name, barcode, or generic composition)
  const medicines = await db
    .select({
      medicine: schema.medicines,
      rackCode: schema.racks.code,
      rackName: schema.racks.name,
    })
    .from(schema.medicines)
    .leftJoin(schema.racks, eq(schema.medicines.rackId, schema.racks.id))
    .where(
      and(
        eq(schema.medicines.tenantId, ctx.tenantId),
        eq(schema.medicines.isActive, true),
        or(
          ilike(schema.medicines.name, `%${lowerQuery}%`),
          ilike(schema.medicines.barcode, `%${lowerQuery}%`),
          ilike(schema.medicines.genericName, `%${lowerQuery}%`)
        )
      )
    )
    .limit(25);

  if (medicines.length === 0) return [];

  const medicineIds = medicines.map((m) => m.medicine.id);

  // Get active batches for these medicines, ordered by expiry (nearest first)
  // Ensure we don't sell expired stock
  const batches = await db
    .select()
    .from(schema.batches)
    .where(
      and(
        eq(schema.batches.storeId, ctx.storeId),
        gt(schema.batches.qtyOnHand, 0),
        gt(schema.batches.expiryDate, todayStr),
        inArray(schema.batches.medicineId, medicineIds)
      )
    )
    .orderBy(asc(schema.batches.expiryDate), asc(schema.batches.createdAt), asc(schema.batches.id));

  // Group batches by medicine
  const results = medicines.map(({ medicine, rackCode, rackName }) => {
    const medBatches = batches.filter((b) => b.medicineId === medicine.id);
    return {
      medicine: {
        ...medicine,
        rackCode,
        rackName,
      },
      batches: medBatches,
    };
  }); // Keep all so cashiers can see if an item is out of stock and find substitutes

  return results;
}

// Find substitutes with identical generic composition in stock
export async function findSubstitutes(genericName: string, excludeMedicineId?: string) {
  const ctx = await requirePermission("sale.create");
  if (!genericName || genericName.trim().length < 2) return [];

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const cleanGeneric = genericName.trim().toLowerCase();

  const conditions = [
    eq(schema.medicines.tenantId, ctx.tenantId),
    eq(schema.medicines.isActive, true),
    ilike(schema.medicines.genericName, `%${cleanGeneric}%`),
  ];
  if (excludeMedicineId) {
    conditions.push(sql`${schema.medicines.id} != ${excludeMedicineId}`);
  }

  const medicines = await db
    .select()
    .from(schema.medicines)
    .where(and(...conditions))
    .limit(10);

  if (medicines.length === 0) return [];
  const medicineIds = medicines.map((m) => m.id);

  const batches = await db
    .select()
    .from(schema.batches)
    .where(
      and(
        eq(schema.batches.storeId, ctx.storeId),
        gt(schema.batches.qtyOnHand, 0),
        gt(schema.batches.expiryDate, todayStr),
        inArray(schema.batches.medicineId, medicineIds)
      )
    )
    .orderBy(asc(schema.batches.expiryDate), asc(schema.batches.createdAt), asc(schema.batches.id));

  return medicines
    .map((med) => {
      const medBatches = batches.filter((b) => b.medicineId === med.id);
      return {
        medicine: med,
        batches: medBatches,
        totalStock: medBatches.reduce((acc, b) => acc + b.qtyOnHand, 0),
      };
    })
    .filter((res) => res.batches.length > 0);
}

export type PosItemInput = {
  medicineId: string;
  batchId?: string;
  qty?: number;
  packQty?: number;
  looseQty?: number;
  rate: number; // paise - ignored by server, but we keep the type signature for now
  discountBp: number; // basis points
  autoFefo?: boolean;
  overrideBatch?: boolean;
  overrideReason?: string;
};

export type ComplianceDetailsInput = {
  doctorName?: string;
  doctorRegNo?: string;
  doctorAddress?: string;
  patientName?: string;
  patientAge?: number;
  patientGender?: string;
  patientAddress?: string;
  patientPhone?: string;
  prescriptionRef?: string;
  prescriptionDate?: string;
  prescriptionId?: string;
};

/**
 * POS entry point. A thin adapter: validates who may bill, maps the counter's arguments to a `SaleInput`
 * and runs the sale domain service (`createSale`) in one transaction. The POS screen keeps this signature
 * until its refactor (A2.7).
 */
export async function createSaleInvoice(
  customerId: string | undefined,
  doctorName: string,
  items: PosItemInput[],
  paymentMethod: string,
  amountPaid: number, // paise
  complianceDetails?: ComplianceDetailsInput,
  medicalRepId?: string,
  paymentsInput?: SalePayment[],
  heldSaleId?: string,
  redeemPoints = 0
) {
  const auth = await checkPermission("sale.create");
  if (!auth.ok) return { error: auth.error };
  const ctx = auth.ctx;

  if (items.length === 0) return { error: "No items to bill" };

  // Never trust numbers from the browser: a negative discount would add to the bill, one above 100% would make it negative.
  for (const i of items) {
    const hasPackOrLoose = i.packQty !== undefined || i.looseQty !== undefined;
    if (hasPackOrLoose) {
      if (
        (i.packQty !== undefined && (!Number.isInteger(i.packQty) || i.packQty < 0)) ||
        (i.looseQty !== undefined && (!Number.isInteger(i.looseQty) || i.looseQty < 0))
      ) {
        return { error: "Quantities must be whole numbers zero or greater." };
      }
      if ((i.packQty ?? 0) <= 0 && (i.looseQty ?? 0) <= 0) {
        return { error: "Total quantity must be greater than zero." };
      }
    } else {
      if (!Number.isInteger(i.qty) || (i.qty ?? 0) <= 0) {
        return { error: "Quantity must be a whole number above zero." };
      }
    }
    if (!Number.isInteger(i.discountBp) || i.discountBp < 0 || i.discountBp > 10000) {
      return { error: "Discount must be between 0% and 100%." };
    }
  }

  let payments: SalePayment[] = [];
  if (paymentsInput && paymentsInput.length > 0) {
    for (const p of paymentsInput) {
      if (!Number.isInteger(p.amount) || p.amount < 0) {
        return { error: "Payment amounts must be whole numbers of paise zero or greater." };
      }
    }
    payments = paymentsInput;
  } else {
    if (!Number.isInteger(amountPaid) || amountPaid < 0) return { error: "Amount paid must be zero or more." };
    if (amountPaid > 0) {
      payments = [{ method: paymentMethod as SalePayment["method"], amount: amountPaid }];
    }
  }

  const input: SaleInput = {
    customerId: customerId?.trim() || undefined,
    lines: items.map((i) => ({
      batchId: i.batchId,
      medicineId: i.medicineId,
      qty: i.qty,
      packQty: i.packQty,
      looseQty: i.looseQty,
      discountBp: i.discountBp,
      autoFefo: i.autoFefo,
      overrideBatch: i.overrideBatch,
      overrideReason: i.overrideReason,
    })),
    billDiscountPaise: 0,
    payments,
    redeemPoints: Math.max(0, redeemPoints || 0),
    compliance: {
      ...complianceDetails,
      doctorName: complianceDetails?.doctorName || doctorName || undefined,
    },
    medicalRepId: medicalRepId?.trim() || undefined,
    heldSaleId: heldSaleId?.trim() || undefined,
  };

  try {
    const result = await db.transaction((tx) => createSale(tx, ctx, input, { source: "pos" }));

    revalidatePath("/dashboard/sales");
    revalidatePath("/dashboard/accounting");
    revalidatePath("/dashboard/gst");
    revalidatePath("/dashboard/sales/pos");

    return {
      success: true,
      saleId: result.saleId,
      invoiceNo: result.invoiceNo,
      total: result.total,
      changeDue: result.changeDue,
    };
  } catch (err: unknown) {
    return { error: (err instanceof Error ? err.message : String(err)) || "Failed to create sale invoice" };
  }
}

export async function holdSaleAction(input: HoldSaleInput) {
  const auth = await checkPermission("sale.create");
  if (!auth.ok) return { success: false as const, error: auth.error };
  const ctx = auth.ctx;

  try {
    const res = await db.transaction((tx) => holdSale(tx, ctx, input));
    revalidatePath("/dashboard/sales/pos");
    return { success: true as const, ...res };
  } catch (err: unknown) {
    return { success: false as const, error: (err instanceof Error ? err.message : String(err)) || "Failed to hold bill" };
  }
}

export async function listHeldSalesAction() {
  const auth = await checkPermission("sale.create");
  if (!auth.ok) return { success: false as const, error: auth.error, data: [] };
  const ctx = auth.ctx;

  try {
    const res = await db.transaction((tx) => listHeldSales(tx, ctx));
    return { success: true as const, data: res };
  } catch (err: unknown) {
    return { success: false as const, error: (err instanceof Error ? err.message : String(err)) || "Failed to list held bills", data: [] };
  }
}

export async function resumeHeldSaleAction(heldSaleId: string) {
  const auth = await checkPermission("sale.create");
  if (!auth.ok) return { success: false as const, error: auth.error };
  const ctx = auth.ctx;

  try {
    const res = await db.transaction((tx) => resumeHeldSale(tx, ctx, heldSaleId));
    return { success: true as const, ...res };
  } catch (err: unknown) {
    return { success: false as const, error: (err instanceof Error ? err.message : String(err)) || "Failed to resume held bill" };
  }
}

export async function discardHeldSaleAction(heldSaleId: string, reason?: string) {
  const auth = await checkPermission("sale.create");
  if (!auth.ok) return { success: false as const, error: auth.error };
  const ctx = auth.ctx;

  try {
    await db.transaction((tx) => discardHeldSale(tx, ctx, heldSaleId, reason));
    revalidatePath("/dashboard/sales/pos");
    return { success: true as const };
  } catch (err: unknown) {
    return { success: false as const, error: (err instanceof Error ? err.message : String(err)) || "Failed to discard held bill" };
  }
}

export async function cancelSaleAction(saleId: string, reason: string) {
  const auth = await checkPermission("sale.cancel");
  if (!auth.ok) return { success: false as const, error: auth.error };
  const ctx = auth.ctx;

  try {
    const res = await db.transaction((tx) => cancelSale(tx, ctx, { saleId, reason }));
    revalidatePath("/dashboard/sales");
    revalidatePath(`/dashboard/sales/${saleId}`);
    revalidatePath("/dashboard/accounting");
    revalidatePath("/dashboard/gst");
    return { success: true as const, ...res };
  } catch (err: unknown) {
    return {
      success: false as const,
      error: (err instanceof Error ? err.message : String(err)) || "Failed to cancel sale invoice",
    };
  }
}

export async function getSaleById(id: string) {
  const ctx = await requirePermission("sale.view");
  const [sale] = await db.select().from(schema.sales).where(and(eq(schema.sales.id, id), eq(schema.sales.tenantId, ctx.tenantId)));
  if (!sale) return null;
  const items = await db.select().from(schema.saleItems).where(eq(schema.saleItems.saleId, id));
  const [customer] = sale.customerId ? await db.select().from(schema.customers).where(eq(schema.customers.id, sale.customerId)) : [null];
  const [store] = await db.select().from(schema.stores).where(eq(schema.stores.id, sale.storeId));
  const [tenant] = await db.select().from(schema.tenants).where(eq(schema.tenants.id, sale.tenantId));
  const [gstDoc] = await db
    .select()
    .from(schema.gstDocuments)
    .where(and(eq(schema.gstDocuments.refType, "sale"), eq(schema.gstDocuments.refId, id), eq(schema.gstDocuments.tenantId, ctx.tenantId)))
    .limit(1);
  const returns = await db
    .select()
    .from(schema.saleReturns)
    .where(eq(schema.saleReturns.saleId, id))
    .orderBy(desc(schema.saleReturns.createdAt));
  const payments = await db
    .select()
    .from(schema.salePayments)
    .where(eq(schema.salePayments.saleId, id));
  return { sale, items, customer, store, tenant, gstDoc: gstDoc || null, returns, payments };
}

export async function createSaleReturnAction(input: ReturnSaleInput) {
  const auth = await checkPermission("sale.return");
  if (!auth.ok) return { success: false as const, error: auth.error };
  const ctx = auth.ctx;

  try {
    const res = await db.transaction((tx) => returnSale(tx, ctx, input));
    revalidatePath("/dashboard/sales");
    revalidatePath(`/dashboard/sales/${input.saleId}`);
    revalidatePath(`/dashboard/sales/${input.saleId}/return`);
    revalidatePath("/dashboard/sales/returns");
    revalidatePath("/dashboard/accounting");
    revalidatePath("/dashboard/gst");
    return { success: true as const, ...res };
  } catch (err: unknown) {
    return {
      success: false as const,
      error: (err instanceof Error ? err.message : String(err)) || "Failed to process sale return",
    };
  }
}

export async function getReturnableSaleAction(saleId: string) {
  const ctx = await requirePermission("sale.view");
  try {
    const details = await getReturnableSaleDetails(db, ctx, saleId);
    return { success: true as const, data: details };
  } catch (err: unknown) {
    return {
      success: false as const,
      error: (err instanceof Error ? err.message : String(err)) || "Failed to load sale return details",
    };
  }
}

export async function getSaleReturnsList(dateFrom?: string | null, dateTo?: string | null) {
  const ctx = await requirePermission("sale.view");

  const conditions = [
    eq(schema.saleReturns.tenantId, ctx.tenantId),
    eq(schema.saleReturns.storeId, ctx.storeId),
  ];

  if (dateFrom) {
    conditions.push(gte(schema.saleReturns.createdAt, new Date(dateFrom + "T00:00:00")));
  }
  if (dateTo) {
    conditions.push(lte(schema.saleReturns.createdAt, new Date(dateTo + "T23:59:59.999")));
  }

  const returns = await db
    .select({
      saleReturn: schema.saleReturns,
      sale: schema.sales,
      user: schema.users,
    })
    .from(schema.saleReturns)
    .innerJoin(schema.sales, eq(schema.saleReturns.saleId, schema.sales.id))
    .leftJoin(schema.users, eq(schema.saleReturns.createdBy, schema.users.id))
    .where(and(...conditions))
    .orderBy(desc(schema.saleReturns.createdAt));

  return returns;
}

export async function getSaleReturnById(id: string) {
  const ctx = await requirePermission("sale.view");

  const [returnRow] = await db
    .select({
      saleReturn: schema.saleReturns,
      sale: schema.sales,
      user: schema.users,
    })
    .from(schema.saleReturns)
    .innerJoin(schema.sales, eq(schema.saleReturns.saleId, schema.sales.id))
    .leftJoin(schema.users, eq(schema.saleReturns.createdBy, schema.users.id))
    .where(and(eq(schema.saleReturns.id, id), eq(schema.saleReturns.tenantId, ctx.tenantId)))
    .limit(1);

  if (!returnRow) return null;

  const items = await db
    .select({
      returnItem: schema.saleReturnItems,
      saleItem: schema.saleItems,
    })
    .from(schema.saleReturnItems)
    .innerJoin(schema.saleItems, eq(schema.saleReturnItems.saleItemId, schema.saleItems.id))
    .where(eq(schema.saleReturnItems.returnId, id));

  const [customer] = returnRow.sale.customerId
    ? await db
        .select()
        .from(schema.customers)
        .where(eq(schema.customers.id, returnRow.sale.customerId))
        .limit(1)
    : [null];

  const [store] = await db
    .select()
    .from(schema.stores)
    .where(eq(schema.stores.id, returnRow.saleReturn.storeId))
    .limit(1);

  const [tenant] = await db
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.id, returnRow.saleReturn.tenantId))
    .limit(1);

  const [gstDoc] = await db
    .select()
    .from(schema.gstDocuments)
    .where(
      and(
        eq(schema.gstDocuments.refType, "return"),
        eq(schema.gstDocuments.refId, id),
        eq(schema.gstDocuments.tenantId, ctx.tenantId),
      ),
    )
    .limit(1);

  return {
    saleReturn: returnRow.saleReturn,
    sale: returnRow.sale,
    user: returnRow.user,
    items,
    customer,
    store,
    tenant,
    gstDoc: gstDoc || null,
  };
}
