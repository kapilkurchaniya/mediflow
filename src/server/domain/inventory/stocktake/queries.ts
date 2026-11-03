import { schema, type DbOrTx } from "@/server/db";
import { and, eq } from "drizzle-orm";
import type { FormattedAuditItem } from "./types";

/**
 * Retrieves audit session details and line items.
 * If isBlindStaffView is true, systemQty is masked to prevent counting bias.
 */
export async function getStockAuditSessionDetails(
  dbOrTx: DbOrTx,
  params: { tenantId: string; sessionId: string; isBlindStaffView?: boolean }
) {
  const { tenantId, sessionId, isBlindStaffView = false } = params;

  const [session] = await dbOrTx
    .select({
      session: schema.stockAuditSessions,
      store: schema.stores,
    })
    .from(schema.stockAuditSessions)
    .innerJoin(schema.stores, eq(schema.stockAuditSessions.storeId, schema.stores.id))
    .where(
      and(
        eq(schema.stockAuditSessions.id, sessionId),
        eq(schema.stockAuditSessions.tenantId, tenantId)
      )
    )
    .limit(1);

  if (!session) return null;

  const items = await dbOrTx
    .select({
      item: schema.stockAuditItems,
      batch: schema.batches,
      medicine: schema.medicines,
      rack: schema.racks,
    })
    .from(schema.stockAuditItems)
    .innerJoin(schema.batches, eq(schema.stockAuditItems.batchId, schema.batches.id))
    .innerJoin(schema.medicines, eq(schema.stockAuditItems.medicineId, schema.medicines.id))
    .leftJoin(schema.racks, eq(schema.stockAuditItems.rackId, schema.racks.id))
    .where(
      and(
        eq(schema.stockAuditItems.sessionId, sessionId),
        eq(schema.stockAuditItems.tenantId, tenantId)
      )
    )
    .orderBy(schema.racks.code, schema.medicines.name);

  const formattedItems: FormattedAuditItem[] = items.map((r) => {
    const isCounted = r.item.countedQty !== null;
    return {
      id: r.item.id,
      batchId: r.item.batchId,
      medicineId: r.item.medicineId,
      medicineName: r.medicine.name,
      genericName: r.medicine.genericName,
      packUnit: r.medicine.packUnit || "pack",
      looseUnit: r.medicine.looseUnit || "unit",
      batchNo: r.batch.batchNo,
      expiryDate: r.batch.expiryDate,
      rackId: r.item.rackId,
      rackCode: r.rack?.code || "Unassigned",
      rackName: r.rack?.name || "General Floor",
      // Hide systemQty if blind count is enabled and user is in staff counting view
      systemQty:
        isBlindStaffView && session.session.blindCount && !isCounted
          ? null
          : r.item.systemQty,
      countedQty: r.item.countedQty,
      varianceQty: r.item.varianceQty,
      unitCostPaise: r.item.unitCostPaise,
      varianceCostPaise: r.item.varianceCostPaise,
      status: r.item.status,
      countedAt: r.item.countedAt,
    };
  });

  const totalLines = formattedItems.length;
  const countedLines = formattedItems.filter((i) => i.countedQty !== null).length;
  const pendingLines = totalLines - countedLines;
  const shortageLines = formattedItems.filter((i) => (i.varianceQty || 0) < 0).length;
  const excessLines = formattedItems.filter((i) => (i.varianceQty || 0) > 0).length;
  const exactLines = formattedItems.filter(
    (i) => i.countedQty !== null && (i.varianceQty || 0) === 0
  ).length;

  const totalShortageCostPaise = formattedItems
    .filter((i) => (i.varianceQty || 0) < 0)
    .reduce((sum, i) => sum + Math.abs(i.varianceCostPaise || 0), 0);

  const totalExcessCostPaise = formattedItems
    .filter((i) => (i.varianceQty || 0) > 0)
    .reduce((sum, i) => sum + (i.varianceCostPaise || 0), 0);

  const netVarianceCostPaise = totalExcessCostPaise - totalShortageCostPaise;

  return {
    session: {
      id: session.session.id,
      sessionNo: session.session.sessionNo,
      storeId: session.session.storeId,
      storeName: session.store.name,
      storeCode: session.store.code,
      scope: session.session.scope,
      rackIds: session.session.rackIds,
      blindCount: session.session.blindCount,
      status: session.session.status,
      notes: session.session.notes,
      startedBy: session.session.startedBy,
      approvedBy: session.session.approvedBy,
      approvedAt: session.session.approvedAt,
      createdAt: session.session.createdAt,
    },
    items: formattedItems,
    summary: {
      totalLines,
      countedLines,
      pendingLines,
      shortageLines,
      excessLines,
      exactLines,
      totalShortageCostPaise,
      totalExcessCostPaise,
      netVarianceCostPaise,
    },
  };
}

/**
 * Formats physical count sheet data grouped by rack for printing.
 */
export async function getPrintCountSheetData(
  dbOrTx: DbOrTx,
  params: { tenantId: string; sessionId: string; mode?: "blind" | "manager" }
) {
  const { tenantId, sessionId, mode = "blind" } = params;
  const details = await getStockAuditSessionDetails(dbOrTx, {
    tenantId,
    sessionId,
    isBlindStaffView: mode === "blind",
  });

  if (!details) return null;

  // Group items by rack
  const rackGroups = new Map<string, { rackCode: string; rackName: string; items: FormattedAuditItem[] }>();

  for (const item of details.items) {
    const key = item.rackCode || "Unassigned";
    if (!rackGroups.has(key)) {
      rackGroups.set(key, {
        rackCode: item.rackCode,
        rackName: item.rackName,
        items: [],
      });
    }
    rackGroups.get(key)!.items.push(item);
  }

  return {
    ...details,
    mode,
    rackGroups: Array.from(rackGroups.values()),
  };
}
