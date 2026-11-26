import { and, desc, eq, gte, lte } from "drizzle-orm";
import type { DbOrTx } from "@/server/db";
import { schema } from "@/server/db";

export interface PivotRow {
  groupKey: string;
  label: string;
  unitsSold: number;
  grossSalesPaise: number;
  cogsPaise: number;
  grossMarginPaise: number;
  marginPercent: number;
}

export interface RawBusinessLine {
  medicineName: string;
  categoryName: string | null;
  manufacturerName: string | null;
  qty: number;
  totalAmount: number;
  unitCost: number;
}

export function buildBusinessAnalysisPivot(
  rows: RawBusinessLine[],
  dimension: "category" | "manufacturer" | "medicine",
): PivotRow[] {
  const buckets = new Map<
    string,
    { label: string; unitsSold: number; grossSalesPaise: number; cogsPaise: number }
  >();

  for (const r of rows) {
    const label =
      dimension === "category"
        ? r.categoryName || "Uncategorized"
        : dimension === "manufacturer"
          ? r.manufacturerName || "Unspecified"
          : r.medicineName;
    const key = label.toLowerCase();
    const entry = buckets.get(key) ?? { label, unitsSold: 0, grossSalesPaise: 0, cogsPaise: 0 };
    entry.unitsSold += r.qty;
    entry.grossSalesPaise += r.totalAmount;
    entry.cogsPaise += r.qty * (r.unitCost || 0);
    buckets.set(key, entry);
  }

  return Array.from(buckets.entries())
    .map(([groupKey, b]) => {
      const grossMarginPaise = b.grossSalesPaise - b.cogsPaise;
      const marginPercent =
        b.grossSalesPaise > 0 ? Number(((grossMarginPaise / b.grossSalesPaise) * 100).toFixed(2)) : 0;
      return {
        groupKey,
        label: b.label,
        unitsSold: b.unitsSold,
        grossSalesPaise: b.grossSalesPaise,
        cogsPaise: b.cogsPaise,
        grossMarginPaise,
        marginPercent,
      };
    })
    .sort((a, b) => b.grossSalesPaise - a.grossSalesPaise);
}

export async function getBusinessAnalysisReport(
  db: DbOrTx,
  params: {
    tenantId: string;
    storeId: string;
    from: string;
    to: string;
    dimension: "category" | "manufacturer" | "medicine";
  },
): Promise<PivotRow[]> {
  const fromDate = new Date(`${params.from}T00:00:00.000Z`);
  const toDate = new Date(`${params.to}T23:59:59.999Z`);

  const rows = await db
    .select({
      medicineName: schema.saleItems.medicineName,
      categoryName: schema.categories.name,
      manufacturerName: schema.manufacturers.name,
      qty: schema.saleItems.qty,
      totalAmount: schema.saleItems.totalAmount,
      unitCost: schema.saleItems.unitCost,
    })
    .from(schema.saleItems)
    .innerJoin(schema.sales, eq(schema.saleItems.saleId, schema.sales.id))
    .innerJoin(schema.medicines, eq(schema.saleItems.medicineId, schema.medicines.id))
    .leftJoin(schema.categories, eq(schema.medicines.categoryId, schema.categories.id))
    .leftJoin(schema.manufacturers, eq(schema.medicines.manufacturerId, schema.manufacturers.id))
    .where(
      and(
        eq(schema.sales.tenantId, params.tenantId),
        eq(schema.sales.storeId, params.storeId),
        eq(schema.sales.status, "completed"),
        gte(schema.sales.completedAt, fromDate),
        lte(schema.sales.completedAt, toDate),
      ),
    )
    .orderBy(desc(schema.sales.completedAt));

  return buildBusinessAnalysisPivot(rows, params.dimension);
}
