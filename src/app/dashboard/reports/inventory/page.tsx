import React from "react";
import { getInventoryMovementReport } from "@/app/actions/reports";
import { resolveDateRange } from "@/lib/date-range";
import { DateRangeFilter } from "@/app/components/DateRangeFilter";
import { ReportShell } from "@/app/components/ReportShell";
import { StatCard, EmptyState } from "@/app/components/ui";
import { formatINR, formatNumber } from "@/lib/format";
import { Boxes, Zap, Snail, Archive, AlertCircle } from "lucide-react";

export const metadata = {
  title: "Inventory Movement Analytics | MediFlow Reports",
  description: "Fast-moving, slow-moving, and non-moving dead stock identification for pharmacy replenishment planning.",
};

export default async function InventoryMovementPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const dateRange = resolveDateRange({
    range: params.range,
    from: params.from,
    to: params.to,
  });

  const report = await getInventoryMovementReport(dateRange.from, dateRange.to);
  const { fastMoving, slowMoving, nonMoving, totalStockValuationPaise } = report;

  const deadStockValuation = nonMoving.reduce((sum, item) => sum + item.stockValuationPaise, 0);

  return (
    <ReportShell
      eyebrow="Inventory Analytics"
      title="Stock Movement & Velocity (Fast / Slow / Dead)"
      description="Analyze inventory turnover to prevent over-stocking and identify non-moving capital."
      backHref="/dashboard/reports"
      backLabel="Back to Reports Hub"
      filterBar={<DateRangeFilter />}
      kpiRow={
        <>
          <StatCard
            label="Total Inventory Value"
            value={formatINR(totalStockValuationPaise)}
            icon={Boxes}
            tone="brand"
            footnote="At purchase cost (PTR landed)"
          />
          <StatCard
            label="Top Fast Movers"
            value={formatNumber(fastMoving.length)}
            icon={Zap}
            tone="info"
            footnote="Highest sales velocity"
          />
          <StatCard
            label="Slow Moving Items"
            value={formatNumber(slowMoving.length)}
            icon={Snail}
            tone="warning"
            footnote="Sluggish turnover"
          />
          <StatCard
            label="Dead Capital (Non-Moving)"
            value={formatINR(deadStockValuation)}
            icon={Archive}
            tone={deadStockValuation > 0 ? "danger" : "neutral"}
            footnote={`${nonMoving.length} items with 0 sales`}
          />
        </>
      }
    >
      <div className="space-y-8">
        {/* Fast Movers Section */}
        <div className="card overflow-hidden">
          <div className="card-header border-b border-ink-150">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-emerald-600" />
              <h2 className="card-title">Fast Moving Medicines (Top Velocity)</h2>
            </div>
            <span className="badge badge-success !text-[11.5px]">High Demand</span>
          </div>

          {fastMoving.length === 0 ? (
            <EmptyState
              icon={Boxes}
              title="No sales movements in this period"
              description="Medicines with active sales will appear ranked by units dispensed."
              compact
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Medicine</th>
                    <th>Composition / Generic</th>
                    <th className="text-right">Units Sold</th>
                    <th className="text-right">Revenue (₹)</th>
                    <th className="text-right">Stock on Hand</th>
                  </tr>
                </thead>
                <tbody>
                  {fastMoving.map((item, idx) => (
                    <tr key={item.medicineId} className="hover:bg-ink-50/70">
                      <td className="cell-primary">
                        <span className="font-mono text-ink-400 mr-2 text-[12px]">#{idx + 1}</span>
                        {item.name}
                      </td>
                      <td className="cell-sub">{item.genericName || "—"}</td>
                      <td className="text-right num font-semibold text-emerald-700">
                        {formatNumber(item.totalQtySold)}
                      </td>
                      <td className="text-right num font-medium text-ink-900">
                        {formatINR(item.totalRevenuePaise)}
                      </td>
                      <td className="text-right num text-ink-700">
                        {formatNumber(item.currentStock)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Non-Moving / Dead Stock Section */}
        <div className="card overflow-hidden">
          <div className="card-header border-b border-ink-150">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-rose-600" />
              <h2 className="card-title">Dead Inventory (Stock on Hand with 0 Sales in Period)</h2>
            </div>
            <span className="badge badge-danger !text-[11.5px]">Trapped Capital</span>
          </div>

          {nonMoving.length === 0 ? (
            <div className="p-8 text-center text-ink-500 text-[13px]">
              🎉 No dead stock detected. All stocked items have active turnover.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Item Name</th>
                    <th>Composition</th>
                    <th className="text-right">Idle Quantity</th>
                    <th className="text-right">Trapped Value (₹)</th>
                    <th className="text-right">Recommended Action</th>
                  </tr>
                </thead>
                <tbody>
                  {nonMoving.map((item) => (
                    <tr key={item.medicineId} className="hover:bg-ink-50/70">
                      <td className="cell-primary font-medium text-ink-900">{item.name}</td>
                      <td className="cell-sub">{item.genericName || "—"}</td>
                      <td className="text-right num font-medium text-ink-800">
                        {formatNumber(item.currentStock)} units
                      </td>
                      <td className="text-right num font-bold text-rose-600">
                        {formatINR(item.stockValuationPaise)}
                      </td>
                      <td className="text-right">
                        <span className="badge badge-neutral text-[11px]">
                          Supplier Return / Doctor Outreach
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </ReportShell>
  );
}
