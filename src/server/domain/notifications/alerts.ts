import { and, eq, gt, inArray, lte, ne, sql } from "drizzle-orm";
import { addDays, format } from "date-fns";
import { schema, type DbOrTx } from "@/server/db";
import { formatINR } from "@/lib/format";

export interface StoreAlertItem {
  id: string;
  fingerprint: string;
  title: string;
  message: string;
  time: string;
  type: "warning" | "danger" | "info";
  href: string;
  count: number;
}

export interface StoreAlertBuildInput {
  outOfStockItems: Array<{ name: string; minQty: number }>;
  lowStockItems: Array<{ name: string; onHand: number; minQty: number }>;
  expiring30Count: number;
  expiring90Count: number;
  pendingUdhaarPaise: number;
  pendingUdhaarCustomers: number;
  pdcDueSoonCount: number;
  openConflictsCount: number;
  promiseOrdersReadyCount: number;
}

export function buildStoreAlertItems(input: StoreAlertBuildInput): StoreAlertItem[] {
  const alerts: StoreAlertItem[] = [];

  if (input.outOfStockItems.length > 0) {
    const sample = input.outOfStockItems
      .slice(0, 3)
      .map((i) => i.name)
      .join(", ");
    const extra = input.outOfStockItems.length > 3 ? ` +${input.outOfStockItems.length - 3} more` : "";
    alerts.push({
      id: "out-of-stock",
      fingerprint: `oos:${input.outOfStockItems.length}:${sample}`,
      title: `Out of Stock (${input.outOfStockItems.length})`,
      message: `${sample}${extra} hit 0 stock while Min Alert Qty > 0.`,
      time: "Reorder",
      type: "danger",
      href: "/dashboard/purchases/reorder?onlyBelowMin=true",
      count: input.outOfStockItems.length,
    });
  }

  if (input.lowStockItems.length > 0) {
    const sample = input.lowStockItems
      .slice(0, 3)
      .map((i) => `${i.name} (${i.onHand}/${i.minQty})`)
      .join(", ");
    const extra = input.lowStockItems.length > 3 ? ` +${input.lowStockItems.length - 3} more` : "";
    alerts.push({
      id: "low-stock",
      fingerprint: `low:${input.lowStockItems.length}:${sample}`,
      title: `Below Min Alert Qty (${input.lowStockItems.length})`,
      message: `${sample}${extra}. Ready for reorder suggestions.`,
      time: "Low Stock",
      type: "warning",
      href: "/dashboard/purchases/reorder?onlyBelowMin=true",
      count: input.lowStockItems.length,
    });
  }

  if (input.expiring30Count > 0 || input.expiring90Count > 0) {
    const total = Math.max(input.expiring30Count, input.expiring90Count);
    alerts.push({
      id: "near-expiry",
      fingerprint: `exp:${input.expiring30Count}:${input.expiring90Count}`,
      title:
        input.expiring30Count > 0
          ? `Urgent Expiry ≤30d (${input.expiring30Count})`
          : `Near Expiry ≤90d (${input.expiring90Count})`,
      message:
        input.expiring30Count > 0
          ? `${input.expiring30Count} batch(es) expire within 30 days (${input.expiring90Count} within 90 days).`
          : `${input.expiring90Count} batch(es) expire within the next 90 days.`,
      time: "Expiry",
      type: input.expiring30Count > 0 ? "danger" : "warning",
      href: "/dashboard/inventory/batches?nearExpiry=true",
      count: total,
    });
  }

  if (input.openConflictsCount > 0) {
    alerts.push({
      id: "stock-conflicts",
      fingerprint: `conflicts:${input.openConflictsCount}`,
      title: `Offline Stock Conflicts (${input.openConflictsCount})`,
      message: `${input.openConflictsCount} offline batch conflict case(s) require reconciliation.`,
      time: "Action",
      type: "danger",
      href: "/dashboard/inventory/conflicts",
      count: input.openConflictsCount,
    });
  }

  if (input.pendingUdhaarPaise > 0 && input.pendingUdhaarCustomers > 0) {
    alerts.push({
      id: "customer-udhaar",
      fingerprint: `udhaar:${input.pendingUdhaarCustomers}:${input.pendingUdhaarPaise}`,
      title: `Customer Udhaar Pending (${input.pendingUdhaarCustomers})`,
      message: `${formatINR(input.pendingUdhaarPaise)} receivable across ${input.pendingUdhaarCustomers} customer account(s).`,
      time: "Collect",
      type: "warning",
      href: "/dashboard/customers/credit",
      count: input.pendingUdhaarCustomers,
    });
  }

  if (input.pdcDueSoonCount > 0) {
    alerts.push({
      id: "pdc-due",
      fingerprint: `pdc:${input.pdcDueSoonCount}`,
      title: `PDC Cheques Due ≤3d (${input.pdcDueSoonCount})`,
      message: `${input.pdcDueSoonCount} post-dated cheque(s) mature within 3 days.`,
      time: "Banking",
      type: "info",
      href: "/dashboard/accounting/pdc",
      count: input.pdcDueSoonCount,
    });
  }

  if (input.promiseOrdersReadyCount > 0) {
    alerts.push({
      id: "promise-ready",
      fingerprint: `promise:${input.promiseOrdersReadyCount}`,
      title: `Promise Orders In Stock (${input.promiseOrdersReadyCount})`,
      message: `${input.promiseOrdersReadyCount} pending promise order item(s) now have stock on shelf.`,
      time: "Notify",
      type: "info",
      href: "/dashboard/sales/promise-orders",
      count: input.promiseOrdersReadyCount,
    });
  }

  return alerts;
}

export async function getStoreNotifications(
  db: DbOrTx,
  tenantId: string,
  storeId: string,
): Promise<StoreAlertItem[]> {
  const now = new Date();
  const todayStr = format(now, "yyyy-MM-dd");
  const thirtyDaysStr = format(addDays(now, 30), "yyyy-MM-dd");
  const ninetyDaysStr = format(addDays(now, 90), "yyyy-MM-dd");
  const pdcCutoffStr = format(addDays(now, 3), "yyyy-MM-dd");

  const [
    medsRows,
    branchRows,
    stockRows,
    expirySummaryRows,
    udhaarRows,
    pdcCount,
    conflictCount,
    promiseReadyCount,
  ] = await Promise.all([
    db
      .select({
        id: schema.medicines.id,
        name: schema.medicines.name,
        reorderLevel: schema.medicines.reorderLevel,
      })
      .from(schema.medicines)
      .where(and(eq(schema.medicines.tenantId, tenantId), eq(schema.medicines.isActive, true))),
    db
      .select({
        medicineId: schema.storeMedicineSettings.medicineId,
        reorderLevel: schema.storeMedicineSettings.reorderLevel,
      })
      .from(schema.storeMedicineSettings)
      .where(
        and(
          eq(schema.storeMedicineSettings.tenantId, tenantId),
          eq(schema.storeMedicineSettings.storeId, storeId),
        ),
      ),
    db
      .select({
        medicineId: schema.batches.medicineId,
        onHand: sql<number>`coalesce(sum(${schema.batches.qtyOnHand}), 0)::int`,
        batchCount: sql<number>`count(*)::int`,
      })
      .from(schema.batches)
      .where(
        and(
          eq(schema.batches.tenantId, tenantId),
          eq(schema.batches.storeId, storeId),
        ),
      )
      .groupBy(schema.batches.medicineId),
    db
      .select({
        expiring30: sql<number>`count(*) filter (where ${schema.batches.expiryDate} <= ${thirtyDaysStr})::int`,
        expiring90: sql<number>`count(*) filter (where ${schema.batches.expiryDate} <= ${ninetyDaysStr})::int`,
      })
      .from(schema.batches)
      .where(
        and(
          eq(schema.batches.tenantId, tenantId),
          eq(schema.batches.storeId, storeId),
          eq(schema.batches.status, "active"),
          gt(schema.batches.qtyOnHand, 0),
          lte(schema.batches.expiryDate, ninetyDaysStr),
        ),
      ),
    db
      .select({
        totalDue: sql<number>`coalesce(sum(${schema.sales.creditAmount}), 0)::bigint`.mapWith(Number),
        customerCount: sql<number>`count(distinct ${schema.sales.customerId})::int`,
      })
      .from(schema.sales)
      .where(
        and(
          eq(schema.sales.tenantId, tenantId),
          eq(schema.sales.storeId, storeId),
          ne(schema.sales.status, "held"),
          ne(schema.sales.status, "cancelled"),
          gt(schema.sales.creditAmount, 0),
        ),
      ),
    db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(schema.pdcCheques)
      .where(
        and(
          eq(schema.pdcCheques.tenantId, tenantId),
          eq(schema.pdcCheques.storeId, storeId),
          inArray(schema.pdcCheques.status, ["pending", "deposited"]),
          lte(schema.pdcCheques.chequeDate, pdcCutoffStr),
        ),
      )
      .then((r) => r[0]?.cnt ?? 0)
      .catch(() => 0),
    db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(schema.stockConflictCases)
      .where(
        and(
          eq(schema.stockConflictCases.tenantId, tenantId),
          eq(schema.stockConflictCases.storeId, storeId),
          inArray(schema.stockConflictCases.status, ["open", "investigating", "partially_resolved"]),
        ),
      )
      .then((r) => r[0]?.cnt ?? 0)
      .catch(() => 0),
    db
      .select({
        cnt: sql<number>`count(distinct ${schema.promiseOrders.id})::int`,
      })
      .from(schema.promiseOrders)
      .innerJoin(
        schema.batches,
        and(
          eq(schema.batches.medicineId, schema.promiseOrders.medicineId),
          eq(schema.batches.storeId, storeId),
          eq(schema.batches.status, "active"),
          gt(schema.batches.qtyOnHand, 0),
          gt(schema.batches.expiryDate, todayStr),
        ),
      )
      .where(
        and(
          eq(schema.promiseOrders.tenantId, tenantId),
          eq(schema.promiseOrders.storeId, storeId),
          inArray(schema.promiseOrders.status, ["pending", "ordered"]),
        ),
      )
      .then((r) => r[0]?.cnt ?? 0)
      .catch(() => 0),
  ]);

  const branchMap = new Map(branchRows.map((b) => [b.medicineId, b.reorderLevel]));
  const stockMap = new Map(stockRows.map((s) => [s.medicineId, { onHand: s.onHand, batchCount: s.batchCount }]));

  const outOfStockItems: Array<{ name: string; minQty: number }> = [];
  const lowStockItems: Array<{ name: string; onHand: number; minQty: number }> = [];

  for (const med of medsRows) {
    const branchMin = branchMap.get(med.id);
    const minQty = branchMin !== undefined && branchMin !== null ? branchMin : Number(med.reorderLevel ?? 10);
    if (minQty <= 0) continue;

    const stockInfo = stockMap.get(med.id);
    // Include medicines stocked in this store OR explicitly configured with a branch setting
    if (!stockInfo && branchMin === undefined) continue;

    const onHand = stockInfo?.onHand ?? 0;
    if (onHand <= 0) {
      outOfStockItems.push({ name: med.name, minQty });
    } else if (onHand <= minQty) {
      lowStockItems.push({ name: med.name, onHand, minQty });
    }
  }

  return buildStoreAlertItems({
    outOfStockItems,
    lowStockItems,
    expiring30Count: expirySummaryRows[0]?.expiring30 ?? 0,
    expiring90Count: expirySummaryRows[0]?.expiring90 ?? 0,
    pendingUdhaarPaise: udhaarRows[0]?.totalDue ?? 0,
    pendingUdhaarCustomers: udhaarRows[0]?.customerCount ?? 0,
    pdcDueSoonCount: pdcCount,
    openConflictsCount: conflictCount,
    promiseOrdersReadyCount: promiseReadyCount,
  });
}
