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
  activeSuppliers: Array<{ id: string; name: string; phone: string | null; leadTimeDays: number }>;
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
  filters?: { supplierId?: string; search?: string; includeNeverStocked?: boolean }
): Promise<ReorderSuggestionsReport> {
  const today = new Date();
  const todayStr = format(today, "yyyy-MM-dd");
  const thirtyDaysAgo = subDays(today, 30);

  // 1. Fetch store info, active medicines, branch settings, active suppliers, stock, open POs, in-transit, sales, and posted GRNs in parallel
  const [
    store,
    allMeds,
    branchSettingsRows,
    activeSuppliersRows,
    onHandRows,
    historicalBatchRows,
    openPoRows,
    inTransitRows,
    salesRows,
    recentPurchases,
    batchSupplierRows,
  ] = await Promise.all([
    db.query.stores.findFirst({
      where: and(eq(schema.stores.tenantId, tenantId), eq(schema.stores.id, storeId)),
    }),
    db
      .select({
        id: schema.medicines.id,
        name: schema.medicines.name,
        genericName: schema.medicines.genericName,
        packUnit: schema.medicines.packUnit,
        looseUnit: schema.medicines.looseUnit,
        unitsPerPack: schema.medicines.unitsPerPack,
        reorderLevel: schema.medicines.reorderLevel,
        maxStock: schema.medicines.maxStock,
        purchasePrice: schema.medicines.purchasePrice,
      })
      .from(schema.medicines)
      .where(and(eq(schema.medicines.tenantId, tenantId), eq(schema.medicines.isActive, true))),
    db
      .select({
        medicineId: schema.storeMedicineSettings.medicineId,
        reorderLevel: schema.storeMedicineSettings.reorderLevel,
        maxStock: schema.storeMedicineSettings.maxStock,
      })
      .from(schema.storeMedicineSettings)
      .where(
        and(
          eq(schema.storeMedicineSettings.tenantId, tenantId),
          eq(schema.storeMedicineSettings.storeId, storeId)
        )
      ),
    db
      .select({
        id: schema.suppliers.id,
        name: schema.suppliers.name,
        phone: schema.suppliers.phone,
        leadTimeDays: schema.suppliers.leadTimeDays,
      })
      .from(schema.suppliers)
      .where(and(eq(schema.suppliers.tenantId, tenantId), eq(schema.suppliers.isActive, true)))
      .orderBy(schema.suppliers.name),
    db
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
      .groupBy(schema.batches.medicineId),
    db
      .select({
        medicineId: schema.batches.medicineId,
      })
      .from(schema.batches)
      .where(and(eq(schema.batches.tenantId, tenantId), eq(schema.batches.storeId, storeId)))
      .groupBy(schema.batches.medicineId),
    // PO items are stored in PACKS — multiply by medicines.unitsPerPack to get base units
    db
      .select({
        medicineId: schema.purchaseOrderItems.medicineId,
        pendingUnits: sql<number>`COALESCE(SUM(GREATEST(${schema.purchaseOrderItems.qty} + ${schema.purchaseOrderItems.freeQty} - ${schema.purchaseOrderItems.receivedQty}, 0) * GREATEST(${schema.medicines.unitsPerPack}, 1)), 0)`,
      })
      .from(schema.purchaseOrderItems)
      .innerJoin(schema.purchaseOrders, eq(schema.purchaseOrderItems.purchaseOrderId, schema.purchaseOrders.id))
      .innerJoin(schema.medicines, eq(schema.purchaseOrderItems.medicineId, schema.medicines.id))
      .where(
        and(
          eq(schema.purchaseOrders.tenantId, tenantId),
          eq(schema.purchaseOrders.storeId, storeId),
          inArray(schema.purchaseOrders.status, ["draft", "approved", "sent", "partially_received"])
        )
      )
      .groupBy(schema.purchaseOrderItems.medicineId),
    // Incoming inter-branch stock transfers
    db
      .select({
        medicineId: schema.stockTransferItems.medicineId,
        pendingUnits: sql<number>`COALESCE(SUM(GREATEST(${schema.stockTransferItems.qtyDispatched} - ${schema.stockTransferItems.receivedQty} - ${schema.stockTransferItems.qtyDamaged} - ${schema.stockTransferItems.qtyShortage}, 0)), 0)`,
      })
      .from(schema.stockTransferItems)
      .innerJoin(schema.stockTransfers, eq(schema.stockTransferItems.transferId, schema.stockTransfers.id))
      .where(
        and(
          eq(schema.stockTransfers.tenantId, tenantId),
          eq(schema.stockTransfers.toStoreId, storeId),
          inArray(schema.stockTransfers.status, ["dispatched", "partially_received"])
        )
      )
      .groupBy(schema.stockTransferItems.medicineId),
    // Net 30-day sales velocity (subtracting returnedQty, using completedAt ?? createdAt)
    db
      .select({
        medicineId: schema.saleItems.medicineId,
        totalSold: sql<number>`COALESCE(SUM(GREATEST(${schema.saleItems.qty} - ${schema.saleItems.returnedQty}, 0)), 0)`,
      })
      .from(schema.saleItems)
      .innerJoin(schema.sales, eq(schema.saleItems.saleId, schema.sales.id))
      .where(
        and(
          eq(schema.sales.tenantId, tenantId),
          eq(schema.sales.storeId, storeId),
          eq(schema.sales.status, "completed"),
          gte(sql`COALESCE(${schema.sales.completedAt}, ${schema.sales.createdAt})`, thirtyDaysAgo)
        )
      )
      .groupBy(schema.saleItems.medicineId),
    // Preferred supplier & pack rate from POSTED purchases (preferring current storeId first, then tenant-wide)
    db
      .select({
        medicineId: schema.purchaseItems.medicineId,
        storeId: schema.purchases.storeId,
        supplierId: schema.purchases.supplierId,
        supplierName: schema.suppliers.name,
        supplierPhone: schema.suppliers.phone,
        leadTimeDays: schema.suppliers.leadTimeDays,
        ratePaise: schema.purchaseItems.rate,
      })
      .from(schema.purchaseItems)
      .innerJoin(schema.purchases, eq(schema.purchaseItems.purchaseId, schema.purchases.id))
      .innerJoin(schema.suppliers, eq(schema.purchases.supplierId, schema.suppliers.id))
      .where(
        and(
          eq(schema.purchases.tenantId, tenantId),
          eq(schema.purchases.status, "posted"),
          eq(schema.suppliers.isActive, true)
        )
      )
      .orderBy(
        sql`CASE WHEN ${schema.purchases.storeId} = ${storeId} THEN 0 ELSE 1 END`,
        desc(schema.purchases.invoiceDate),
        desc(schema.purchases.createdAt)
      ),
    // Fallback supplier from batches.supplierId if no GRN exists
    db
      .select({
        medicineId: schema.batches.medicineId,
        supplierId: schema.suppliers.id,
        supplierName: schema.suppliers.name,
        supplierPhone: schema.suppliers.phone,
        leadTimeDays: schema.suppliers.leadTimeDays,
        purchaseRate: schema.batches.purchaseRate,
      })
      .from(schema.batches)
      .innerJoin(schema.suppliers, eq(schema.batches.supplierId, schema.suppliers.id))
      .where(
        and(
          eq(schema.batches.tenantId, tenantId),
          eq(schema.batches.storeId, storeId),
          eq(schema.suppliers.isActive, true)
        )
      )
      .orderBy(desc(schema.batches.createdAt)),
  ]);

  const storeName = store ? `${store.name} (${store.code})` : "Store";
  const activeSuppliers = activeSuppliersRows.map((s) => ({
    id: s.id,
    name: s.name,
    phone: s.phone,
    leadTimeDays: s.leadTimeDays || 2,
  }));

  if (allMeds.length === 0) {
    return {
      storeId,
      storeName,
      totalMedicinesEvaluated: 0,
      totalSuggestionsCount: 0,
      totalEstimatedCostPaise: 0,
      suppliers: [],
      activeSuppliers,
    };
  }

  const branchSettingsMap = new Map(branchSettingsRows.map((s) => [s.medicineId, s]));
  const historicalBatchSet = new Set(historicalBatchRows.map((b) => b.medicineId));

  const onHandMap = new Map<string, { onHand: number; avgCost: number }>();
  for (const row of onHandRows) {
    onHandMap.set(row.medicineId, {
      onHand: Number(row.totalOnHand),
      avgCost: Number(row.avgCost),
    });
  }

  const onOrderMap = new Map<string, number>();
  for (const row of openPoRows) {
    onOrderMap.set(row.medicineId, Number(row.pendingUnits));
  }

  const inTransitMap = new Map<string, number>();
  for (const row of inTransitRows) {
    inTransitMap.set(row.medicineId, Number(row.pendingUnits));
  }

  const velocityMap = new Map<string, number>();
  for (const row of salesRows) {
    velocityMap.set(row.medicineId, Number(row.totalSold) / 30);
  }

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

  const batchSupplierMap = new Map<
    string,
    {
      supplierId: string;
      supplierName: string;
      supplierPhone: string | null;
      leadTimeDays: number;
      purchaseRate: number;
    }
  >();
  for (const b of batchSupplierRows) {
    if (!batchSupplierMap.has(b.medicineId)) {
      batchSupplierMap.set(b.medicineId, b);
    }
  }

  // Evaluate each medicine
  const suggestions: ReorderItemSuggestion[] = [];

  for (const med of allMeds) {
    const branchSetting = branchSettingsMap.get(med.id);

    if (filters?.search) {
      const q = filters.search.toLowerCase();
      const matchName = med.name.toLowerCase().includes(q);
      const matchGeneric = med.genericName?.toLowerCase().includes(q);
      if (!matchName && !matchGeneric) continue;
    }

    const onHandData = onHandMap.get(med.id);
    const onHand = onHandData?.onHand || 0;
    const onOrder = onOrderMap.get(med.id) || 0;
    const inTransit = inTransitMap.get(med.id) || 0;
    const avgDailySales = velocityMap.get(med.id) || 0;

    // Skip never-stocked / zero-sales catalog items unless explicitly requested
    const hasStorePresence =
      onHand > 0 ||
      onOrder > 0 ||
      inTransit > 0 ||
      avgDailySales > 0 ||
      historicalBatchSet.has(med.id) ||
      Boolean(branchSetting);
    if (!filters?.includeNeverStocked && !hasStorePresence) {
      continue;
    }

    const prefSupplier = supplierMap.get(med.id);
    const fallbackBatchSup = batchSupplierMap.get(med.id);
    const effectiveSupplierId = prefSupplier?.supplierId ?? fallbackBatchSup?.supplierId ?? null;
    const effectiveSupplierName = prefSupplier?.supplierName ?? fallbackBatchSup?.supplierName ?? null;
    const effectiveSupplierPhone = prefSupplier?.supplierPhone ?? fallbackBatchSup?.supplierPhone ?? null;

    if (filters?.supplierId && effectiveSupplierId !== filters.supplierId) {
      continue;
    }

    const leadTimeDays = prefSupplier?.leadTimeDays ?? fallbackBatchSup?.leadTimeDays ?? 2;
    const reorderLevel =
      branchSetting?.reorderLevel !== undefined && branchSetting?.reorderLevel !== null
        ? branchSetting.reorderLevel
        : med.reorderLevel !== null
        ? med.reorderLevel
        : 10;
    const effectiveMaxStock =
      branchSetting?.maxStock !== undefined && branchSetting?.maxStock !== null
        ? branchSetting.maxStock
        : med.maxStock;
    const upp = med.unitsPerPack || 1;

    const { suggestedQty, suggestedPacks } = calculateReorderQuantity({
      onHand,
      onOrder,
      inTransit,
      avgDailySales,
      leadTimeDays,
      reorderLevel,
      maxStock: effectiveMaxStock,
      unitsPerPack: upp,
    });

    if (suggestedQty > 0) {
      // Convert per-base-unit batch cost to per-pack rate when falling back from GRN pack rate
      const packRate =
        prefSupplier?.ratePaise ||
        (onHandData?.avgCost ? Math.round(onHandData.avgCost * upp) : 0) ||
        (fallbackBatchSup?.purchaseRate ? Math.round(fallbackBatchSup.purchaseRate * upp) : 0) ||
        med.purchasePrice ||
        0;
      const estimatedCost = suggestedPacks * packRate;

      suggestions.push({
        medicineId: med.id,
        medicineName: med.name,
        genericName: med.genericName,
        packUnit: med.packUnit || "pack",
        looseUnit: med.looseUnit || "unit",
        unitsPerPack: upp,
        onHand,
        onOrder,
        inTransit,
        avgDailySales: Math.round(avgDailySales * 100) / 100,
        reorderLevel,
        maxStock: effectiveMaxStock,
        leadTimeDays,
        suggestedQty,
        suggestedPacks,
        lastPurchaseRatePaise: packRate,
        estimatedCostPaise: estimatedCost,
        preferredSupplierId: effectiveSupplierId,
        preferredSupplierName: effectiveSupplierName,
        ...(effectiveSupplierPhone ? { preferredSupplierPhone: effectiveSupplierPhone } : {}),
      } as ReorderItemSuggestion & { preferredSupplierPhone?: string });
    }
  }

  // Group suggestions by preferred supplier
  const supplierGroupsMap = new Map<string, SupplierReorderGroup>();
  const phoneLookup = new Map(activeSuppliers.map((s) => [s.id, s.phone]));

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
        phone: item.preferredSupplierId ? phoneLookup.get(item.preferredSupplierId) ?? null : null,
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
    activeSuppliers,
  };
}
