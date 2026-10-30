import { db, schema, type Tx } from "@/server/db";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { differenceInDays, format, parseISO, subDays } from "date-fns";
import { nextDocNumber } from "@/server/domain/sequence";
import { DomainError } from "@/server/errors";

export interface RedistributionCandidateStore {
  storeId: string;
  storeName: string;
  storeCode: string;
  onHand: number;
  dailyVelocity: number;
  projectedDemand: number;
  netCapacity: number;
}

export interface ExpiryRedistributionItem {
  id: string; // unique item key
  batchId: string;
  batchNo: string;
  expiryDate: string; // YYYY-MM-DD
  daysToExpiry: number;
  medicineId: string;
  medicineName: string;
  genericName: string | null;
  packUnit: string;
  looseUnit: string;
  unitsPerPack: number;
  sourceStoreId: string;
  sourceStoreName: string;
  sourceStoreCode: string;
  sourceOnHand: number;
  sourceDailyVelocity: number;
  sourceProjectedSales: number;
  surplusAtRisk: number;
  purchaseRatePaise: number;
  mrpPaise: number;
  atRiskCapitalPaise: number;
  suggestedTransferQty: number; // in base units
  suggestedPacks: number;
  potentialLossPreventedPaise: number;
  urgency: "critical" | "high" | "medium";
  bestDestinationStore: RedistributionCandidateStore | null;
  allCandidateDestinations: RedistributionCandidateStore[];
}

export interface ExpiryRedistributionReport {
  generatedAt: string;
  minDays: number;
  maxDays: number;
  totalAtRiskCapitalPaise: number;
  totalRecoverableValuePaise: number;
  totalBatchesAtRisk: number;
  criticalUrgencyCount: number;
  suggestions: ExpiryRedistributionItem[];
}

/**
 * Pure calculation logic for single batch redistribution analysis.
 */
export function calculateRedistributionForBatch(params: {
  daysToExpiry: number;
  onHandSource: number;
  velocitySource: number;
  purchaseRatePaise: number;
  unitsPerPack?: number;
  candidateStores: Array<{
    storeId: string;
    storeName: string;
    storeCode: string;
    onHand: number;
    velocity: number;
  }>;
}): {
  surplusAtRisk: number;
  suggestedTransferQty: number;
  suggestedPacks: number;
  potentialLossPreventedPaise: number;
  urgency: "critical" | "high" | "medium";
  bestDestination: RedistributionCandidateStore | null;
  allCandidates: RedistributionCandidateStore[];
} | null {
  const {
    daysToExpiry,
    onHandSource,
    velocitySource,
    purchaseRatePaise,
    candidateStores,
  } = params;

  if (onHandSource <= 0) return null;

  const dte = Math.max(1, daysToExpiry);
  const projSalesSource = Math.floor(velocitySource * dte);
  const surplusAtRisk = Math.max(0, onHandSource - projSalesSource);

  if (surplusAtRisk <= 0) {
    // Natural sell-out expected at source store before expiry
    return null;
  }

  const upp = params.unitsPerPack && params.unitsPerPack > 0 ? params.unitsPerPack : 1;

  // Evaluate candidate destination stores
  const evaluatedCandidates: RedistributionCandidateStore[] = [];
  for (const c of candidateStores) {
    if (c.velocity <= 0) continue; // destination does not move this item
    const projDemand = Math.floor(c.velocity * dte);
    const netCapacity = Math.max(0, projDemand - c.onHand);
    if (netCapacity > 0) {
      evaluatedCandidates.push({
        storeId: c.storeId,
        storeName: c.storeName,
        storeCode: c.storeCode,
        onHand: c.onHand,
        dailyVelocity: Math.round(c.velocity * 100) / 100,
        projectedDemand: projDemand,
        netCapacity,
      });
    }
  }

  // Sort descending by highest capacity, then velocity
  evaluatedCandidates.sort((a, b) => {
    if (b.netCapacity !== a.netCapacity) {
      return b.netCapacity - a.netCapacity;
    }
    return b.dailyVelocity - a.dailyVelocity;
  });

  const bestDestination = evaluatedCandidates[0] || null;
  const suggestedTransferQty = bestDestination
    ? Math.min(surplusAtRisk, bestDestination.netCapacity)
    : 0;

  const suggestedPacks = suggestedTransferQty > 0
    ? Math.max(1, Math.ceil(suggestedTransferQty / upp))
    : 0;

  const potentialLossPreventedPaise = suggestedTransferQty * purchaseRatePaise;

  let urgency: "critical" | "high" | "medium" = "medium";
  if (dte <= 45) {
    urgency = "critical";
  } else if (dte <= 75) {
    urgency = "high";
  }

  return {
    surplusAtRisk,
    suggestedTransferQty,
    suggestedPacks,
    potentialLossPreventedPaise,
    urgency,
    bestDestination,
    allCandidates: evaluatedCandidates,
  };
}

/**
 * Computes chain-wide expiry redistribution suggestions.
 * Scans active batches expiring in [minDays, maxDays] sitting at slow-moving stores
 * and matches them with high-velocity stores to prevent write-offs.
 */
export async function computeExpiryRedistribution(
  tenantId: string,
  options?: {
    sourceStoreId?: string;
    minDays?: number;
    maxDays?: number;
    search?: string;
  }
): Promise<ExpiryRedistributionReport> {
  const minDays = options?.minDays ?? 30;
  const maxDays = options?.maxDays ?? 120;
  const today = new Date();
  const todayStr = format(today, "yyyy-MM-dd");
  const thirtyDaysAgo = subDays(today, 30);

  // 1. Fetch active stores
  const stores = await db
    .select({
      id: schema.stores.id,
      name: schema.stores.name,
      code: schema.stores.code,
      gstin: schema.stores.gstin,
    })
    .from(schema.stores)
    .where(and(eq(schema.stores.tenantId, tenantId), eq(schema.stores.isActive, true)));

  if (stores.length < 2) {
    return {
      generatedAt: today.toISOString(),
      minDays,
      maxDays,
      totalAtRiskCapitalPaise: 0,
      totalRecoverableValuePaise: 0,
      totalBatchesAtRisk: 0,
      criticalUrgencyCount: 0,
      suggestions: [],
    };
  }

  const storeMap = new Map(stores.map((s) => [s.id, s]));

  // 2. Query batches in the target expiry window
  const minExpiryDate = format(new Date(today.getTime() + minDays * 86400000), "yyyy-MM-dd");
  const maxExpiryDate = format(new Date(today.getTime() + maxDays * 86400000), "yyyy-MM-dd");

  const batchConditions = [
    eq(schema.batches.tenantId, tenantId),
    eq(schema.batches.status, "active"),
    gte(schema.batches.expiryDate, minExpiryDate),
    lte(schema.batches.expiryDate, maxExpiryDate),
    sql`${schema.batches.qtyOnHand} > 0`,
  ];

  if (options?.sourceStoreId) {
    batchConditions.push(eq(schema.batches.storeId, options.sourceStoreId));
  }

  const rawBatches = await db
    .select({
      batch: schema.batches,
      medicine: schema.medicines,
    })
    .from(schema.batches)
    .innerJoin(schema.medicines, eq(schema.batches.medicineId, schema.medicines.id))
    .where(and(...batchConditions))
    .orderBy(schema.batches.expiryDate);

  if (rawBatches.length === 0) {
    return {
      generatedAt: today.toISOString(),
      minDays,
      maxDays,
      totalAtRiskCapitalPaise: 0,
      totalRecoverableValuePaise: 0,
      totalBatchesAtRisk: 0,
      criticalUrgencyCount: 0,
      suggestions: [],
    };
  }

  // Filter search query if present
  let filteredBatches = rawBatches;
  if (options?.search) {
    const q = options.search.toLowerCase();
    filteredBatches = rawBatches.filter(
      (b) =>
        b.medicine.name.toLowerCase().includes(q) ||
        b.medicine.genericName?.toLowerCase().includes(q) ||
        b.batch.batchNo.toLowerCase().includes(q)
    );
  }

  const medicineIds = Array.from(new Set(filteredBatches.map((b) => b.batch.medicineId)));

  // 3. Compute 30-day velocity for all (storeId, medicineId) pairs
  const salesHistory = await db
    .select({
      storeId: schema.sales.storeId,
      medicineId: schema.saleItems.medicineId,
      totalQtySold: sql<number>`coalesce(sum(${schema.saleItems.qty} - ${schema.saleItems.returnedQty}), 0)`,
    })
    .from(schema.sales)
    .innerJoin(schema.saleItems, eq(schema.sales.id, schema.saleItems.saleId))
    .where(
      and(
        eq(schema.sales.tenantId, tenantId),
        eq(schema.sales.status, "completed"),
        gte(schema.sales.completedAt, thirtyDaysAgo),
        inArray(schema.saleItems.medicineId, medicineIds)
      )
    )
    .groupBy(schema.sales.storeId, schema.saleItems.medicineId);

  // Velocity map: "storeId:medicineId" -> daily velocity
  const velocityMap = new Map<string, number>();
  for (const s of salesHistory) {
    const vel = Number(s.totalQtySold) / 30;
    velocityMap.set(`${s.storeId}:${s.medicineId}`, vel);
  }

  // 4. Query total on-hand stock per (storeId, medicineId) for destination evaluation
  const stockByStoreMed = await db
    .select({
      storeId: schema.batches.storeId,
      medicineId: schema.batches.medicineId,
      totalOnHand: sql<number>`coalesce(sum(${schema.batches.qtyOnHand}), 0)`,
    })
    .from(schema.batches)
    .where(
      and(
        eq(schema.batches.tenantId, tenantId),
        eq(schema.batches.status, "active"),
        gte(schema.batches.expiryDate, todayStr),
        inArray(schema.batches.medicineId, medicineIds)
      )
    )
    .groupBy(schema.batches.storeId, schema.batches.medicineId);

  // onHandMap: "storeId:medicineId" -> totalOnHand
  const storeOnHandMap = new Map<string, number>();
  for (const st of stockByStoreMed) {
    storeOnHandMap.set(`${st.storeId}:${st.medicineId}`, Number(st.totalOnHand));
  }

  // 5. Build suggestions
  const suggestions: ExpiryRedistributionItem[] = [];

  for (const row of filteredBatches) {
    const batch = row.batch;
    const med = row.medicine;
    const sourceStore = storeMap.get(batch.storeId);
    if (!sourceStore) continue;

    const daysToExpiry = differenceInDays(parseISO(batch.expiryDate), today);
    const sourceVelocity = velocityMap.get(`${batch.storeId}:${med.id}`) || 0;
    const purchaseRate = batch.purchaseRate ?? med.purchasePrice ?? 0;
    const mrp = batch.mrp ?? med.mrp ?? 0;

    // Collect candidate destination stores (all other active stores in tenant)
    const candidateStores = stores
      .filter((s) => s.id !== batch.storeId)
      .map((s) => {
        const vel = velocityMap.get(`${s.id}:${med.id}`) || 0;
        const onHand = storeOnHandMap.get(`${s.id}:${med.id}`) || 0;
        return {
          storeId: s.id,
          storeName: s.name,
          storeCode: s.code,
          onHand,
          velocity: vel,
        };
      });

    const calc = calculateRedistributionForBatch({
      daysToExpiry,
      onHandSource: batch.qtyOnHand,
      velocitySource: sourceVelocity,
      purchaseRatePaise: purchaseRate,
      unitsPerPack: med.unitsPerPack || 1,
      candidateStores,
    });

    if (calc && calc.surplusAtRisk > 0) {
      const atRiskCapital = calc.surplusAtRisk * purchaseRate;

      suggestions.push({
        id: `${batch.id}-${batch.storeId}`,
        batchId: batch.id,
        batchNo: batch.batchNo,
        expiryDate: batch.expiryDate,
        daysToExpiry,
        medicineId: med.id,
        medicineName: med.name,
        genericName: med.genericName,
        packUnit: med.packUnit || "pack",
        looseUnit: med.looseUnit || "unit",
        unitsPerPack: med.unitsPerPack || 1,
        sourceStoreId: sourceStore.id,
        sourceStoreName: sourceStore.name,
        sourceStoreCode: sourceStore.code,
        sourceOnHand: batch.qtyOnHand,
        sourceDailyVelocity: Math.round(sourceVelocity * 100) / 100,
        sourceProjectedSales: Math.floor(sourceVelocity * Math.max(1, daysToExpiry)),
        surplusAtRisk: calc.surplusAtRisk,
        purchaseRatePaise: purchaseRate,
        mrpPaise: mrp,
        atRiskCapitalPaise: atRiskCapital,
        suggestedTransferQty: calc.suggestedTransferQty,
        suggestedPacks: calc.suggestedPacks,
        potentialLossPreventedPaise: calc.potentialLossPreventedPaise,
        urgency: calc.urgency,
        bestDestinationStore: calc.bestDestination,
        allCandidateDestinations: calc.allCandidates,
      });
    }
  }

  // Sort suggestions by potential loss prevented descending, then urgency
  suggestions.sort((a, b) => {
    if (b.potentialLossPreventedPaise !== a.potentialLossPreventedPaise) {
      return b.potentialLossPreventedPaise - a.potentialLossPreventedPaise;
    }
    return a.daysToExpiry - b.daysToExpiry;
  });

  const totalAtRisk = suggestions.reduce((sum, s) => sum + s.atRiskCapitalPaise, 0);
  const totalRecoverable = suggestions.reduce(
    (sum, s) => sum + s.potentialLossPreventedPaise,
    0
  );
  const criticalCount = suggestions.filter((s) => s.urgency === "critical").length;

  return {
    generatedAt: today.toISOString(),
    minDays,
    maxDays,
    totalAtRiskCapitalPaise: totalAtRisk,
    totalRecoverableValuePaise: totalRecoverable,
    totalBatchesAtRisk: suggestions.length,
    criticalUrgencyCount: criticalCount,
    suggestions,
  };
}

/**
 * Creates a transfer draft from an expiry redistribution recommendation.
 * Automatically classifies docKind as delivery_challan or tax_invoice based on GSTINs.
 */
export async function createRedistributionTransferDraft(
  tx: Tx,
  params: {
    tenantId: string;
    fromStoreId: string;
    toStoreId: string;
    items: Array<{
      batchId: string;
      medicineId: string;
      batchNo: string;
      expiryDate: string;
      qty: number;
      unitCost: number;
      mrp: number;
      saleRate?: number;
    }>;
    createdBy: string;
    notes?: string;
  }
): Promise<{ transferId: string; transferNo: string }> {
  const { tenantId, fromStoreId, toStoreId, items, createdBy, notes } = params;

  if (items.length === 0) {
    throw new DomainError("EMPTY_TRANSFER", "At least one item is required to create a transfer draft");
  }

  const [fromStore] = await tx
    .select({ id: schema.stores.id, gstin: schema.stores.gstin })
    .from(schema.stores)
    .where(and(eq(schema.stores.id, fromStoreId), eq(schema.stores.tenantId, tenantId)))
    .limit(1);

  const [toStore] = await tx
    .select({ id: schema.stores.id, gstin: schema.stores.gstin })
    .from(schema.stores)
    .where(and(eq(schema.stores.id, toStoreId), eq(schema.stores.tenantId, tenantId)))
    .limit(1);

  if (!fromStore || !toStore) {
    throw new DomainError("STORE_NOT_FOUND", "Source or destination store not found");
  }

  const docKind =
    fromStore.gstin && toStore.gstin && fromStore.gstin === toStore.gstin
      ? "delivery_challan"
      : "tax_invoice";

  const transferNo = await nextDocNumber(
    tx,
    tenantId,
    fromStoreId,
    "stock_transfer",
    "TRF"
  );

  const [transfer] = await tx
    .insert(schema.stockTransfers)
    .values({
      tenantId,
      transferNo,
      fromStoreId,
      toStoreId,
      status: "draft",
      docKind,
      notes: notes || "Auto-generated from Expiry Redistribution Suggestions",
      createdBy,
    })
    .returning({ id: schema.stockTransfers.id });

  for (const item of items) {
    await tx.insert(schema.stockTransferItems).values({
      tenantId,
      transferId: transfer.id,
      medicineId: item.medicineId,
      fromBatchId: item.batchId,
      batchNo: item.batchNo,
      expiryDate: item.expiryDate,
      qty: item.qty,
      unitCost: item.unitCost,
      mrp: item.mrp,
      saleRate: item.saleRate ?? item.mrp,
    });
  }

  return { transferId: transfer.id, transferNo };
}

