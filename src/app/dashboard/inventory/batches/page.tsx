import { getBatches } from "@/app/actions/stock";
import { Plus, Boxes, Upload, IndianRupee, Layers, CalendarClock } from "lucide-react";
import Link from "next/link";
import clsx from "clsx";
import { PageHeader, StatCard, EmptyState } from "@/app/components/ui";
import { formatINR, formatNumber, daysUntil } from "@/lib/format";

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
  searchParams: Promise<{ nearExpiry?: string }>;
}) {
  const { nearExpiry } = await searchParams;
  const isNearExpiry = nearExpiry === "true";
  const batches = await getBatches(isNearExpiry);

  const totalValuation = batches.reduce((acc, row) => acc + row.batch.qtyOnHand * row.batch.purchaseRate, 0);
  const totalUnits = batches.reduce((acc, row) => acc + row.batch.qtyOnHand, 0);
  const expiringCount = batches.filter((b) => daysUntil(b.batch.expiryDate) <= 90).length;

  return (
    <div className="page space-y-6">
      <PageHeader
        title="Batches & stock"
        description="Batch-level stock on hand, expiry exposure and purchase-cost valuation."
        actions={
          <>
            <Link href="/dashboard/inventory/import" className="btn btn-secondary">
              <Upload /> Import CSV
            </Link>
            <Link href="/dashboard/inventory/batches/new" className="btn btn-primary">
              <Plus /> Opening stock
            </Link>
          </>
        }
      />

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="Active batches" value={formatNumber(batches.length)} icon={Layers} footnote={`${formatNumber(totalUnits)} units on hand`} />
        <StatCard label="Stock valuation" value={formatINR(totalValuation)} icon={IndianRupee} tone="brand" footnote="At purchase rate (PTR)" />
        <StatCard
          label="Expiring ≤ 90 days"
          value={formatNumber(expiringCount)}
          icon={CalendarClock}
          tone={expiringCount > 0 ? "danger" : "neutral"}
          footnote="Plan returns or discounts early"
        />
      </section>

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
          <span className="text-[12.5px] text-ink-500 num">{formatNumber(batches.length)} rows</span>
        </div>

        {batches.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Batch</th>
                  <th>Expiry</th>
                  <th className="text-right">PTR</th>
                  <th className="text-right">MRP</th>
                  <th className="text-right">Value</th>
                  <th className="text-right">On hand</th>
                </tr>
              </thead>
              <tbody>
                {batches.map(({ batch, medicine }) => (
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
                    <td className="text-right num text-ink-600">{formatINR(batch.purchaseRate)}</td>
                    <td className="text-right num text-ink-900">{formatINR(batch.mrp)}</td>
                    <td className="text-right num text-ink-600">{formatINR(batch.qtyOnHand * batch.purchaseRate)}</td>
                    <td className="text-right">
                      <span
                        className={clsx(
                          "num text-[13px] font-semibold",
                          batch.qtyOnHand > 0 ? "text-ink-900" : "text-red-600",
                        )}
                      >
                        {formatNumber(batch.qtyOnHand)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
                  <Link href="/dashboard/inventory/import" className="btn btn-secondary btn-sm">
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
