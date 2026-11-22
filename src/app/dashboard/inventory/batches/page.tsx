import { getBatches } from "@/app/actions/stock";
import { Plus, Boxes, Upload, IndianRupee, Layers, CalendarClock } from "lucide-react";
import Link from "next/link";
import clsx from "clsx";
import { PageHeader, StatCard, EmptyState, TableWrapper } from "@/app/components/ui";
import { formatINR, formatNumber, daysUntil } from "@/lib/format";
import { ExpiryDateFilter } from "@/app/components/ExpiryDateFilter";
import { resolveExpiryDateRange } from "@/lib/date-range";
import { ExportButton } from "@/app/components/ExportButton";
import { requirePagePermission, can } from "@/server/rbac";
import { BackfillPtrBanner } from "./BackfillPtrBanner";
import { EditBatchButton } from "./EditBatchModal";
import { StockOcrButton } from "./_components/StockOcrButton";

export const metadata = { title: "Batches & stock" };

function ExpiryBadge({ date }: { date: string }) {
  const d = daysUntil(date);
  const label = new Date(date).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
  if (d < 0) return <span className="badge badge-danger">Expired · {label}</span>;
  if (d <= 30) return <span className="badge badge-danger badge-dot">{label} · {d}d</span>;
  if (d <= 90) return <span className="badge badge-warning badge-dot">{label} · {d}d</span>;
  return <span className="text-ink-600 num">{label}</span>;
}

export default async function BatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ nearExpiry?: string; range?: string; from?: string; to?: string; medicineId?: string }>;
}) {
  const ctx = await requirePagePermission("inventory.view");
  const canAdjust = can(ctx, "inventory.adjust");
  const { nearExpiry, range, from, to, medicineId } = await searchParams;
  const isNearExpiry = nearExpiry === "true";
  const dateRange = resolveExpiryDateRange({ range, from, to });
  const batches = await getBatches({
    nearExpiryOnly: isNearExpiry,
    from: dateRange.from,
    to: dateRange.to,
    medicineId: medicineId || null,
  });

  const getEffectivePtr = (b: (typeof batches)[0]["batch"], m: (typeof batches)[0]["medicine"]) => {
    if (b.purchaseRate > 0) return b.purchaseRate;
    if (m.purchasePrice > 0) return m.purchasePrice;
    if (b.mrp > 0) return Math.round(b.mrp * 0.8);
    if (m.mrp > 0) return Math.round(m.mrp * 0.8);
    return 0;
  };

  const zeroRateCount = batches.filter((r) => r.batch.purchaseRate === 0).length;
  const totalValuation = batches.reduce(
    (acc, row) => acc + row.batch.qtyOnHand * getEffectivePtr(row.batch, row.medicine),
    0
  );
  const totalUnits = batches.reduce((acc, row) => acc + row.batch.qtyOnHand, 0);
  const expiringCount = batches.filter((b) => daysUntil(b.batch.expiryDate) <= 90).length;

  return (
    <div className="page space-y-6">
      <PageHeader
        title="Batches & stock"
        description="Batch-level stock on hand, expiry exposure and purchase-cost valuation."
        actions={
          <>
            <ExportButton
              endpoint="/api/export/batches"
              from={dateRange.from}
              to={dateRange.to}
            />
            <StockOcrButton />
            <Link href="/dashboard/import?tab=quick" className="btn btn-secondary">
              <Upload /> Import CSV
            </Link>
            <Link href="/dashboard/inventory/batches/new" className="btn btn-primary">
              <Plus /> Opening stock
            </Link>
          </>
        }
      />

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard
          label="Active batches"
          value={formatNumber(batches.length)}
          icon={Layers}
          footnote={`${formatNumber(totalUnits)} units on hand`}
        />
        <StatCard
          label="Stock valuation"
          value={formatINR(totalValuation)}
          icon={IndianRupee}
          tone="brand"
          footnote={zeroRateCount > 0 ? "Includes estimated PTR (80% MRP)" : "At purchase rate (PTR)"}
        />
        <StatCard
          label="Expiring ≤ 90 days"
          value={formatNumber(expiringCount)}
          icon={CalendarClock}
          tone={expiringCount > 0 ? "danger" : "neutral"}
          footnote="Plan returns or discounts early"
        />
      </section>

      {/* Auto-sync PTR Banner if any batches have zero purchase rate */}
      {zeroRateCount > 0 && <BackfillPtrBanner zeroCount={zeroRateCount} />}

      {/* Expiry Date Filter Bar */}
      <div className="card px-4 py-3 bg-white/70 backdrop-blur-xs">
        <div className="mb-2 text-[12px] font-medium text-ink-500">Filter by expiry date:</div>
        <ExpiryDateFilter />
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-ink-150 px-4 py-3">
          <div className="inline-flex rounded-md border border-ink-200 bg-ink-50 p-0.5" role="tablist">
            <Link
              href="/dashboard/inventory/batches"
              role="tab"
              aria-selected={!isNearExpiry}
              className={clsx(
                "rounded px-3 py-1 text-[12.5px] font-medium transition-colors",
                !isNearExpiry ? "bg-white text-ink-900 shadow-xs" : "text-ink-500 hover:text-ink-800",
              )}
            >
              All batches
            </Link>
            <Link
              href="/dashboard/inventory/batches?nearExpiry=true"
              role="tab"
              aria-selected={isNearExpiry}
              className={clsx(
                "rounded px-3 py-1 text-[12.5px] font-medium transition-colors",
                isNearExpiry ? "bg-white text-ink-900 shadow-xs" : "text-ink-500 hover:text-ink-800",
              )}
            >
              Near expiry
            </Link>
          </div>
          <span className="text-[12.5px] text-ink-500 num">
            {medicineId && (
              <Link href="/dashboard/inventory/batches" className="mr-3 text-brand-700 hover:underline font-sans">
                Clear medicine filter &times;
              </Link>
            )}
            {formatNumber(batches.length)} rows
          </span>
        </div>

        {batches.length > 0 ? (
          <TableWrapper>
            <table className="data-table data-table-sticky min-w-[850px]">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Batch</th>
                  <th>Expiry</th>
                  <th className="text-right">PTR</th>
                  <th className="text-right">MRP</th>
                  <th className="text-right">Value</th>
                  <th className="text-right">On hand</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {batches.map(({ batch, medicine }) => {
                  const effectivePtr = getEffectivePtr(batch, medicine);
                  return (
                    <tr key={batch.id}>
                      <td>
                        <div className="cell-primary">{medicine.name}</div>
                        <div className="cell-sub capitalize">
                          {medicine.unit}
                          {medicine.packSize ? ` · ${medicine.packSize}` : ""}
                        </div>
                      </td>
                      <td>
                        <span className="font-mono text-[12.5px] text-ink-800">{batch.batchNo}</span>
                      </td>
                      <td>
                        <ExpiryBadge date={batch.expiryDate} />
                      </td>
                      <td className="text-right num text-ink-600">
                        {formatINR(effectivePtr)}
                        {batch.purchaseRate === 0 && effectivePtr > 0 && (
                          <span
                            className="ml-1 text-[10.5px] font-medium text-amber-600 cursor-help"
                            title="Estimated PTR based on standard 80% MRP"
                          >
                            est.
                          </span>
                        )}
                      </td>
                      <td className="text-right num text-ink-900">{formatINR(batch.mrp)}</td>
                      <td className="text-right num text-ink-600 font-medium">
                        {formatINR(batch.qtyOnHand * effectivePtr)}
                      </td>
                      <td className="text-right">
                        <span
                          className={clsx(
                            "num text-[13px] font-semibold",
                            batch.qtyOnHand > 0 ? "text-ink-900" : "text-red-600",
                          )}
                        >
                          {medicine.unitsPerPack > 1
                            ? `${Math.floor(batch.qtyOnHand / medicine.unitsPerPack)} ${medicine.packUnit}s + ${batch.qtyOnHand % medicine.unitsPerPack} ${medicine.looseUnit}s`
                            : formatNumber(batch.qtyOnHand)}
                        </span>
                        {medicine.unitsPerPack > 1 && (
                          <div className="cell-sub font-mono">{formatNumber(batch.qtyOnHand)} {medicine.looseUnit}s</div>
                        )}
                      </td>
                      <td className="text-right">
                        {canAdjust && (
                          <EditBatchButton
                            batch={{
                              id: batch.id,
                              batchNo: batch.batchNo,
                              expiryDate: batch.expiryDate,
                              purchaseRate: batch.purchaseRate,
                              mrp: batch.mrp,
                              saleRate: batch.saleRate,
                              qtyOnHand: batch.qtyOnHand,
                              status: batch.status,
                              medicineName: medicine.name,
                              unitsPerPack: medicine.unitsPerPack,
                              packUnit: medicine.packUnit,
                              looseUnit: medicine.looseUnit,
                            }}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrapper>
        ) : (
          <EmptyState
            icon={Boxes}
            title={isNearExpiry ? "Nothing expiring soon" : "No stock recorded yet"}
            description={
              isNearExpiry
                ? "No batch with stock on hand expires within the next 90 days."
                : "Record opening stock, post a purchase GRN, or bulk-import your current stock list."
            }
            action={
              !isNearExpiry && (
                <div className="flex gap-2">
                  <Link href="/dashboard/import?tab=quick" className="btn btn-secondary btn-sm">
                    <Upload /> Import CSV
                  </Link>
                  <Link href="/dashboard/inventory/batches/new" className="btn btn-primary btn-sm">
                    <Plus /> Opening stock
                  </Link>
                </div>
              )
            }
          />
        )}
      </div>
    </div>
  );
}
