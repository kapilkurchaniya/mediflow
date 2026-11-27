import { and, desc, eq, gte, isNull, lte, ne, or } from "drizzle-orm";
import { schema, type DbOrTx } from "@/server/db";

export interface SupplierPurchaseHistoryRow {
  purchaseId: string;
  purchaseNo: string;
  supplierInvoiceNo: string;
  invoiceDate: string;
  supplierId: string;
  supplierName: string;
  contactPerson: string | null;
  phone: string | null;
  qty: number;
  freeQty: number;
  schemeType: string | null;
  discountBp: number;
  ratePaise: number;
  landedUnitCostPaise: number;
  mrpPaise: number;
}

export interface ActiveSchemeOffer {
  id: string;
  name: string;
  buyQty: number;
  freeQty: number;
  discountBp: number;
}

export interface SupplierComparisonSummary {
  bestRatePaise: number | null;
  bestSupplierId: string | null;
  bestSupplierName: string | null;
  latestRatePaise: number | null;
  latestSupplierName: string | null;
  supplierCount: number;
}

export function summarizeSupplierHistory(rows: SupplierPurchaseHistoryRow[]): SupplierComparisonSummary {
  if (rows.length === 0) {
    return {
      bestRatePaise: null,
      bestSupplierId: null,
      bestSupplierName: null,
      latestRatePaise: null,
      latestSupplierName: null,
      supplierCount: 0,
    };
  }

  let bestRow: SupplierPurchaseHistoryRow | null = null;
  const suppliers = new Set<string>();

  for (const r of rows) {
    suppliers.add(r.supplierId);
    const effectiveCost = r.landedUnitCostPaise > 0 ? r.landedUnitCostPaise : r.ratePaise;
    if (effectiveCost <= 0) continue;
    if (!bestRow) {
      bestRow = r;
    } else {
      const bestCost = bestRow.landedUnitCostPaise > 0 ? bestRow.landedUnitCostPaise : bestRow.ratePaise;
      if (effectiveCost < bestCost) {
        bestRow = r;
      }
    }
  }

  return {
    bestRatePaise: bestRow
      ? bestRow.landedUnitCostPaise > 0
        ? bestRow.landedUnitCostPaise
        : bestRow.ratePaise
      : null,
    bestSupplierId: bestRow?.supplierId ?? null,
    bestSupplierName: bestRow?.supplierName ?? null,
    latestRatePaise: rows[0]?.ratePaise ?? null,
    latestSupplierName: rows[0]?.supplierName ?? null,
    supplierCount: suppliers.size,
  };
}

export async function getMedicineSupplierHistory(
  db: DbOrTx,
  tenantId: string,
  medicineId: string,
  limit = 15,
) {
  const today = new Date().toISOString().slice(0, 10);

  const [rawRows, medRows] = await Promise.all([
    db
      .select({
        purchaseId: schema.purchases.id,
        purchaseNo: schema.purchases.purchaseNo,
        supplierInvoiceNo: schema.purchases.supplierInvoiceNo,
        invoiceDate: schema.purchases.invoiceDate,
        supplierId: schema.suppliers.id,
        supplierName: schema.suppliers.name,
        contactPerson: schema.suppliers.contactPerson,
        phone: schema.suppliers.phone,
        qty: schema.purchaseItems.qty,
        freeQty: schema.purchaseItems.freeQty,
        schemeType: schema.purchaseItems.schemeType,
        discountBp: schema.purchaseItems.discountBp,
        ratePaise: schema.purchaseItems.rate,
        landedUnitCostPaise: schema.purchaseItems.landedUnitCost,
        mrpPaise: schema.purchaseItems.mrp,
      })
      .from(schema.purchaseItems)
      .innerJoin(schema.purchases, eq(schema.purchaseItems.purchaseId, schema.purchases.id))
      .innerJoin(schema.suppliers, eq(schema.purchases.supplierId, schema.suppliers.id))
      .where(
        and(
          eq(schema.purchaseItems.tenantId, tenantId),
          eq(schema.purchaseItems.medicineId, medicineId),
          ne(schema.purchases.status, "cancelled"),
        ),
      )
      .orderBy(desc(schema.purchases.invoiceDate), desc(schema.purchases.createdAt))
      .limit(limit),
    db
      .select({ id: schema.medicines.id, name: schema.medicines.name, categoryId: schema.medicines.categoryId })
      .from(schema.medicines)
      .where(and(eq(schema.medicines.id, medicineId), eq(schema.medicines.tenantId, tenantId)))
      .limit(1),
  ]);

  const med = medRows[0] ?? null;
  const activeSchemesRaw = med
    ? await db
        .select({
          id: schema.schemes.id,
          name: schema.schemes.name,
          buyQty: schema.schemes.buyQty,
          freeQty: schema.schemes.freeQty,
          discountBp: schema.schemes.discountBp,
        })
        .from(schema.schemes)
        .where(
          and(
            eq(schema.schemes.tenantId, tenantId),
            eq(schema.schemes.isActive, true),
            or(
              eq(schema.schemes.medicineId, med.id),
              med.categoryId ? eq(schema.schemes.categoryId, med.categoryId) : isNull(schema.schemes.medicineId),
            ),
            or(isNull(schema.schemes.validFrom), lte(schema.schemes.validFrom, today)),
            or(isNull(schema.schemes.validTo), gte(schema.schemes.validTo, today)),
          ),
        )
        .limit(5)
    : [];

  const rows: SupplierPurchaseHistoryRow[] = rawRows.map((r) => ({
    purchaseId: r.purchaseId,
    purchaseNo: r.purchaseNo,
    supplierInvoiceNo: r.supplierInvoiceNo,
    invoiceDate: r.invoiceDate,
    supplierId: r.supplierId,
    supplierName: r.supplierName,
    contactPerson: r.contactPerson,
    phone: r.phone,
    qty: Number(r.qty ?? 0),
    freeQty: Number(r.freeQty ?? 0),
    schemeType: r.schemeType,
    discountBp: Number(r.discountBp ?? 0),
    ratePaise: Number(r.ratePaise ?? 0),
    landedUnitCostPaise: Number(r.landedUnitCostPaise ?? 0),
    mrpPaise: Number(r.mrpPaise ?? 0),
  }));

  return {
    medicineName: med?.name ?? "",
    rows,
    summary: summarizeSupplierHistory(rows),
    activeSchemes: activeSchemesRaw,
  };
}
