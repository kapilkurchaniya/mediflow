import { db, schema } from "@/server/db";
import { and, desc, eq, gte, gt, inArray, sql } from "drizzle-orm";
import { format, subDays } from "date-fns";

export interface ReorderItemSuggestion {
  medicineId: string;
  medicineName: string;
  genericName: string | null;
  packUnit: string;
  looseUnit: string;
  unitsPerPack: number;
  onHand: number;
  onOrder: number;
  inTransit: number;
  avgDailySales: number;
  reorderLevel: number;
  maxStock: number | null;
  leadTimeDays: number;
  suggestedQty: number; // in base units
  suggestedPacks: number; // in packs
  lastPurchaseRatePaise: number;
  estimatedCostPaise: number;
  preferredSupplierId: string | null;
  preferredSupplierName: string | null;
}

export interface SupplierReorderGroup {
  supplierId: string | "unassigned";
  supplierName: string;
  leadTimeDays: number;
  phone: string | null;
  items: ReorderItemSuggestion[];
  totalSuggestedItems: number;
  totalEstimatedCostPaise: number;
}

export interface ReorderSuggestionsReport {
  storeId: string;
  storeName: string;
  totalMedicinesEvaluated: number;
  totalSuggestionsCount: number;
  totalEstimatedCostPaise: number;
  suppliers: SupplierReorderGroup[];
}

/**
 * Pure reorder formula:
 * safetyStock = ceil(avgDailySales * (leadTimeDays + 7))
 * targetStock = safetyStock + reorderLevel
 * deficit = targetStock - onHand - onOrder - inTransit
 * Rounds up to full packs.
 */
export function calculateReorderQuantity(params: {
  onHand: number;
  onOrder: number;
  inTransit?: number;
  avgDailySales: number;
  leadTimeDays?: number;
  reorderLevel?: number;
  maxStock?: number | null;
  unitsPerPack?: number;
}): { suggestedQty: number; suggestedPacks: number } {
  const inTransit = params.inTransit || 0;
  const leadTime = params.leadTimeDays && params.leadTimeDays > 0 ? params.leadTimeDays : 2;
  const reorderLevel = params.reorderLevel !== undefined && params.reorderLevel !== null ? params.reorderLevel : 10;
  const upp = params.unitsPerPack && params.unitsPerPack > 0 ? params.unitsPerPack : 1;

  const bufferDays = leadTime + 7;
  const safetyStock = Math.ceil(params.avgDailySales * bufferDays);
  const targetStock = safetyStock + reorderLevel;

  const currentPipeline = params.onHand + params.onOrder + inTransit;
  let rawDeficit = targetStock - currentPipeline;

  if (rawDeficit <= 0) {
    return { suggestedQty: 0, suggestedPacks: 0 };
  }

  if (params.maxStock && params.maxStock > 0) {
    const maxAllowed = params.maxStock - currentPipeline;
    if (maxAllowed < rawDeficit) {
      rawDeficit = Math.max(0, maxAllowed);
    }
  }

  const suggestedPacks = Math.ceil(rawDeficit / upp);
  const suggestedQty = suggestedPacks * upp;

  return { suggestedQty, suggestedPacks };
}

export async function computeReorderSuggestions(
  tenantId: string,
  storeId: string,
  filters?: { supplierId?: string; search?: string }
): Promise<ReorderSuggestionsReport> {
  const today = new Date();
  const todayStr = format(today, "yyyy-MM-dd");
  const thirtyDaysAgo = subDays(today, 30);

  // 1. Fetch store info
  const store = await db.query.stores.findFirst({
    where: and(eq(schema.stores.tenantId, tenantId), eq(schema.stores.id, storeId)),
  });

  const storeName = store ? `${store.name} (${store.code})` : "Store";

  // 2. Fetch all active medicines
  const medConds = [eq(schema.medicines.tenantId, tenantId), eq(schema.medicines.isActive, true)];
  const allMeds = await db
    .select({
      id: schema.medicines.id,
      name: schema.medicines.name,
      genericName: schema.medicines.genericName,
      packUnit: schema.medicines.packUnit,
      looseUnit: schema.medicines.looseUnit,
      unitsPerPack: schema.medicines.unitsPerPack,
      reorderLevel: schema.medicines.reorderLevel,
      maxStock: schema.medicines.maxStock,
    })
    .from(schema.medicines)
    .where(and(...medConds));

  if (allMeds.length === 0) {
    return {
      storeId,
      storeName,
      totalMedicinesEvaluated: 0,
      totalSuggestionsCount: 0,
      totalEstimatedCostPaise: 0,
      suppliers: [],
    };
  }

  // 3. Query on-hand active non-expired stock for this store
  const onHandRows = await db
    .select({
      medicineId: schema.batches.medicineId,
      totalOnHand: sql<number>`COALESCE(SUM(${schema.batches.qtyOnHand}), 0)`,
      avgCost: sql<number>`COALESCE(AVG(${schema.batches.purchaseRate}), 0)`,
    })
    .from(schema.batches)
    .where(
      and(
        eq(schema.batches.tenantId, tenantId),
        eq(schema.batches.storeId, storeId),
        eq(schema.batches.status, "active"),
        gte(schema.batches.expiryDate, todayStr),
        gt(schema.batches.qtyOnHand, 0)
      )
    )
    .groupBy(schema.batches.medicineId);

  const onHandMap = new Map<string, { onHand: number; avgCost: number }>();
  for (const row of onHandRows) {
    onHandMap.set(row.medicineId, {
      onHand: Number(row.totalOnHand),
      avgCost: Number(row.avgCost),
    });
  }

  // 4. Query pending purchase orders (approved or sent, not yet received)
  const openPoRows = await db
    .select({
      medicineId: schema.purchaseOrderItems.medicineId,
      pendingQty: sql<number>`COALESCE(SUM(${schema.purchaseOrderItems.qty} + ${schema.purchaseOrderItems.freeQty} - ${schema.purchaseOrderItems.receivedQty}), 0)`,
    })
    .from(schema.purchaseOrderItems)
    .innerJoin(schema.purchaseOrders, eq(schema.purchaseOrderItems.purchaseOrderId, schema.purchaseOrders.id))
    .where(
      and(
        eq(schema.purchaseOrders.tenantId, tenantId),
        eq(schema.purchaseOrders.storeId, storeId),
        inArray(schema.purchaseOrders.status, ["approved", "sent"])
      )
    )
    .groupBy(schema.purchaseOrderItems.medicineId);

  const onOrderMap = new Map<string, number>();
  for (const row of openPoRows) {
    onOrderMap.set(row.medicineId, Number(row.pendingQty));
  }

  // 5. Query 30-day sales velocity
  const salesRows = await db
    .select({
      medicineId: schema.saleItems.medicineId,
      totalSold: sql<number>`COALESCE(SUM(${schema.saleItems.qty}), 0)`,
    })
    .from(schema.saleItems)
    .innerJoin(schema.sales, eq(schema.saleItems.saleId, schema.sales.id))
    .where(
      and(
        eq(schema.sales.tenantId, tenantId),
        eq(schema.sales.storeId, storeId),
        eq(schema.sales.status, "completed"),
        gte(schema.sales.createdAt, thirtyDaysAgo)
      )
    )
    .groupBy(schema.saleItems.medicineId);

  const velocityMap = new Map<string, number>();
  for (const row of salesRows) {
    velocityMap.set(row.medicineId, Number(row.totalSold) / 30);
  }

  // 6. Query preferred supplier and last rate from recent purchases
  const recentPurchases = await db
    .select({
      medicineId: schema.purchaseItems.medicineId,
      supplierId: schema.purchases.supplierId,
      supplierName: schema.suppliers.name,
      supplierPhone: schema.suppliers.phone,
      leadTimeDays: schema.suppliers.leadTimeDays,
      ratePaise: schema.purchaseItems.rate,
    })
    .from(schema.purchaseItems)
    .innerJoin(schema.purchases, eq(schema.purchaseItems.purchaseId, schema.purchases.id))
    .innerJoin(schema.suppliers, eq(schema.purchases.supplierId, schema.suppliers.id))
    .where(and(eq(schema.purchases.tenantId, tenantId), eq(schema.purchases.status, "completed")))
    .orderBy(desc(schema.purchases.invoiceDate));

  const supplierMap = new Map<
    string,
    {
      supplierId: string;
      supplierName: string;
      supplierPhone: string | null;
      leadTimeDays: number;
      ratePaise: number;
    }
  >();

  for (const p of recentPurchases) {
    if (!supplierMap.has(p.medicineId)) {
      supplierMap.set(p.medicineId, {
        supplierId: p.supplierId,
        supplierName: p.supplierName,
        supplierPhone: p.supplierPhone,
        leadTimeDays: p.leadTimeDays || 2,
        ratePaise: p.ratePaise || 0,
      });
    }
  }

  // 7. Evaluate each medicine
  const suggestions: ReorderItemSuggestion[] = [];

  for (const med of allMeds) {
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      const matchName = med.name.toLowerCase().includes(q);
      const matchGeneric = med.genericName?.toLowerCase().includes(q);
      if (!matchName && !matchGeneric) continue;
    }

    const onHandData = onHandMap.get(med.id);
    const onHand = onHandData?.onHand || 0;
    const onOrder = onOrderMap.get(med.id) || 0;
    const avgDailySales = velocityMap.get(med.id) || 0;
    const prefSupplier = supplierMap.get(med.id);

    if (filters?.supplierId && prefSupplier?.supplierId !== filters.supplierId) {
      continue;
    }

    const leadTimeDays = prefSupplier?.leadTimeDays || 2;
    const reorderLevel = med.reorderLevel !== null ? med.reorderLevel : 10;
    const upp = med.unitsPerPack || 1;

    const { suggestedQty, suggestedPacks } = calculateReorderQuantity({
      onHand,
      onOrder,
      inTransit: 0,
      avgDailySales,
      leadTimeDays,
      reorderLevel,
      maxStock: med.maxStock,
      unitsPerPack: upp,
    });

    if (suggestedQty > 0) {
      const lastRate = prefSupplier?.ratePaise || onHandData?.avgCost || 0;
      const estimatedCost = suggestedPacks * lastRate;

      suggestions.push({
        medicineId: med.id,
        medicineName: med.name,
        genericName: med.genericName,
        packUnit: med.packUnit || "pack",
        looseUnit: med.looseUnit || "unit",
        unitsPerPack: upp,
        onHand,
        onOrder,
        inTransit: 0,
        avgDailySales: Math.round(avgDailySales * 100) / 100,
        reorderLevel,
        maxStock: med.maxStock,
        leadTimeDays,
        suggestedQty,
        suggestedPacks,
        lastPurchaseRatePaise: lastRate,
        estimatedCostPaise: estimatedCost,
        preferredSupplierId: prefSupplier?.supplierId || null,
        preferredSupplierName: prefSupplier?.supplierName || null,
      });
    }
  }

  // 8. Group suggestions by preferred supplier
  const supplierGroupsMap = new Map<string, SupplierReorderGroup>();

  for (const item of suggestions) {
    const key = item.preferredSupplierId || "unassigned";
    const name = item.preferredSupplierName || "Unassigned / Direct Purchase";
    const leadTime = item.leadTimeDays;

    let group = supplierGroupsMap.get(key);
    if (!group) {
      group = {
        supplierId: key,
        supplierName: name,
        leadTimeDays: leadTime,
        phone: null,
        items: [],
        totalSuggestedItems: 0,
        totalEstimatedCostPaise: 0,
      };
      supplierGroupsMap.set(key, group);
    }

    group.items.push(item);
    group.totalSuggestedItems += 1;
    group.totalEstimatedCostPaise += item.estimatedCostPaise;
  }

  const suppliers = Array.from(supplierGroupsMap.values()).sort(
    (a, b) => b.totalEstimatedCostPaise - a.totalEstimatedCostPaise
  );

  const totalCost = suggestions.reduce((sum, s) => sum + s.estimatedCostPaise, 0);

  return {
    storeId,
    storeName,
    totalMedicinesEvaluated: allMeds.length,
    totalSuggestionsCount: suggestions.length,
    totalEstimatedCostPaise: totalCost,
    suppliers,
  };
}

