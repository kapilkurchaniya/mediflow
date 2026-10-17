import React from "react";
import Link from "next/link";
import { getExpiryAnalysisReport } from "@/app/actions/reports";
import { ReportShell } from "@/app/components/ReportShell";
import { StatCard, EmptyState } from "@/app/components/ui";
import { formatINR, formatNumber } from "@/lib/format";
import { CalendarClock, AlertTriangle, ShieldAlert, ArrowRight, CornerDownRight } from "lucide-react";

export const metadata = {
  title: "Expiry Exposure & Loss Risk | MediFlow Reports",
  description: "Batch expiry loss forecasting and near-expiry exposure tracking across 30, 60, and 90-day horizons.",
};

export default async function ExpiryReportPage() {
  const report = await getExpiryAnalysisReport();
  const {
    expired,
    expiringIn30Days,
    expiringIn60Days,
    expiringIn90Days,
    totalExpiredLossPaise,
    totalAtRiskLossPaise,
  } = report;

  const totalAtRiskCount =
    expiringIn30Days.length + expiringIn60Days.length + expiringIn90Days.length;

  return (
    <ReportShell
      eyebrow="Inventory Risk"
      title="Expiry Exposure & Loss Risk Analysis"
      description="Identify short-expiry medicines to initiate distributor returns, supplier replacements, or promotional clearance."
      backHref="/dashboard/reports"
      backLabel="Back to Reports Hub"
      kpiRow={
        <>
          <StatCard
            label="Already Expired Loss"
            value={formatINR(totalExpiredLossPaise)}
            icon={ShieldAlert}
            tone={totalExpiredLossPaise > 0 ? "danger" : "neutral"}
            footnote={`${expired.length} batches ready for dump/write-off`}
          />
          <StatCard
            label="Near-Expiry Exposure (≤ 90d)"
            value={formatINR(totalAtRiskLossPaise)}
            icon={AlertTriangle}
            tone={totalAtRiskLossPaise > 0 ? "warning" : "neutral"}
            footnote={`${totalAtRiskCount} batches at financial risk`}
          />
          <StatCard
            label="Urgent (≤ 30 Days)"
            value={formatNumber(expiringIn30Days.length)}
            icon={CalendarClock}
            tone={expiringIn30Days.length > 0 ? "danger" : "neutral"}
            footnote="Immediate return or claim required"
          />
          <StatCard
            label="Next 60–90 Days"
            value={formatNumber(expiringIn60Days.length + expiringIn90Days.length)}
            icon={CalendarClock}
            tone="info"
            footnote="Window to accelerate dispensing"
          />
        </>
      }
    >
      <div className="space-y-8">
        {/* Urgent: Already Expired */}
        {expired.length > 0 && (
          <div className="card overflow-hidden border-rose-200">
            <div className="card-header border-b border-rose-100 bg-rose-50/50">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-rose-600" />
                <h2 className="card-title text-rose-950 font-bold">
                  Expired Batches with Stock on Hand (Illegal to Dispense)
                </h2>
              </div>
              <span className="badge badge-danger num">
                Loss: {formatINR(totalExpiredLossPaise)}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Medicine</th>
                    <th>Batch No.</th>
                    <th>Expiry Date</th>
                    <th className="text-right">Qty Left</th>
                    <th className="text-right">Unit PTR</th>
                    <th className="text-right">Total Write-Off Loss</th>
                  </tr>
                </thead>
                <tbody>
                  {expired.map((b) => (
                    <tr key={b.batchId} className="bg-rose-50/20 hover:bg-rose-50/40">
                      <td className="cell-primary font-medium">{b.medicineName}</td>
                      <td className="font-mono text-[12px]">{b.batchNo}</td>
                      <td className="num font-semibold text-rose-600">{b.expiryDate}</td>
                      <td className="text-right num font-semibold">{b.qtyOnHand} units</td>
                      <td className="text-right num">{formatINR(b.purchaseRate)}</td>
                      <td className="text-right num font-bold text-rose-700">
                        {formatINR(b.lossExposurePaise)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Near Expiry: <= 30 Days */}
        <div className="card overflow-hidden">
          <div className="card-header border-b border-ink-150">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-amber-600" />
              <h2 className="card-title">Expiring in ≤ 30 Days (Critical Return Window)</h2>
            </div>
            <span className="badge badge-warning num">{expiringIn30Days.length} Batches</span>
          </div>

          {expiringIn30Days.length === 0 ? (
            <div className="p-6 text-center text-[13px] text-ink-500">
              ✨ No inventory expiring within the next 30 days.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Medicine</th>
                    <th>Batch No.</th>
                    <th>Expiry Date</th>
                    <th>Days Left</th>
                    <th className="text-right">Stock</th>
                    <th className="text-right">Loss Exposure</th>
                  </tr>
                </thead>
                <tbody>
                  {expiringIn30Days.map((b) => (
                    <tr key={b.batchId} className="hover:bg-ink-50/70">
                      <td className="cell-primary font-medium">{b.medicineName}</td>
                      <td className="font-mono text-[12px]">{b.batchNo}</td>
                      <td className="num font-medium text-amber-700">{b.expiryDate}</td>
                      <td className="num font-bold text-amber-600">{b.daysRemaining} days</td>
                      <td className="text-right num font-medium">{b.qtyOnHand} units</td>
                      <td className="text-right num font-bold text-ink-900">
                        {formatINR(b.lossExposurePaise)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Near Expiry: 31–90 Days */}
        <div className="card overflow-hidden">
          <div className="card-header border-b border-ink-150">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-sky-600" />
              <h2 className="card-title">Expiring in 31 to 90 Days (Advisory Horizon)</h2>
            </div>
            <span className="badge badge-neutral num">
              {expiringIn60Days.length + expiringIn90Days.length} Batches
            </span>
          </div>

          {[...expiringIn60Days, ...expiringIn90Days].length === 0 ? (
            <div className="p-6 text-center text-[13px] text-ink-500">
              ✨ No inventory expiring in the 31–90 day horizon.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Medicine</th>
                    <th>Batch No.</th>
                    <th>Expiry Date</th>
                    <th>Days Remaining</th>
                    <th className="text-right">Stock</th>
                    <th className="text-right">Exposure (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {[...expiringIn60Days, ...expiringIn90Days].map((b) => (
                    <tr key={b.batchId} className="hover:bg-ink-50/70">
                      <td className="cell-primary font-medium">{b.medicineName}</td>
                      <td className="font-mono text-[12px]">{b.batchNo}</td>
                      <td className="num text-ink-600">{b.expiryDate}</td>
                      <td className="num font-medium text-ink-800">{b.daysRemaining} days</td>
                      <td className="text-right num">{b.qtyOnHand} units</td>
                      <td className="text-right num font-semibold text-ink-900">
                        {formatINR(b.lossExposurePaise)}
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
