"use server";

import { db, schema } from "@/server/db";
import { eq, and, desc, gt, gte, lte, ilike, or, sql, inArray } from "drizzle-orm";
import { checkPermission, requirePermission } from "@/server/rbac";
import { revalidatePath } from "next/cache";
import { format } from "date-fns";
import { createSale } from "@/server/domain/sales/create-sale";
import type { SaleInput, SalePayment } from "@/server/domain/sales/types";

export async function getSales(dateFrom?: string | null, dateTo?: string | null) {
  const ctx = await requirePermission("sale.view");

  const conditions = [
    eq(schema.sales.tenantId, ctx.tenantId),
    eq(schema.sales.storeId, ctx.storeId),
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
    .orderBy(schema.batches.expiryDate);

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
    .orderBy(schema.batches.expiryDate);

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
  batchId: string;
  qty: number;
  rate: number; // paise - ignored by server, but we keep the type signature for now
  discountBp: number; // basis points
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
  medicalRepId?: string
) {
  const auth = await checkPermission("sale.create");
  if (!auth.ok) return { error: auth.error };
  const ctx = auth.ctx;

  if (items.length === 0) return { error: "No items to bill" };

  // Never trust numbers from the browser: a negative discount would add to the bill, one above 100% would make it negative.
  for (const i of items) {
    if (!Number.isInteger(i.qty) || i.qty <= 0) return { error: "Quantity must be a whole number above zero." };
    if (!Number.isInteger(i.discountBp) || i.discountBp < 0 || i.discountBp > 10000) {
      return { error: "Discount must be between 0% and 100%." };
    }
  }
  if (!Number.isInteger(amountPaid) || amountPaid < 0) return { error: "Amount paid must be zero or more." };

  const input: SaleInput = {
    customerId: customerId?.trim() || undefined,
    lines: items.map((i) => ({ batchId: i.batchId, qty: i.qty, discountBp: i.discountBp })),
    billDiscountPaise: 0,
    payments: amountPaid > 0 ? [{ method: paymentMethod as SalePayment["method"], amount: amountPaid }] : [],
    redeemPoints: 0,
    compliance: {
      ...complianceDetails,
      doctorName: complianceDetails?.doctorName || doctorName || undefined,
    },
    medicalRepId: medicalRepId?.trim() || undefined,
  };

  try {
    const result = await db.transaction((tx) => createSale(tx, ctx, input, { source: "pos" }));

    revalidatePath("/dashboard/sales");
    revalidatePath("/dashboard/accounting");
    revalidatePath("/dashboard/gst");

    return { success: true, saleId: result.saleId };
  } catch (err: unknown) {
    return { error: (err instanceof Error ? err.message : String(err)) || "Failed to create sale invoice" };
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
  return { sale, items, customer, store, tenant, gstDoc: gstDoc || null };
}
