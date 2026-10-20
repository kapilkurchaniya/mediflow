import React from "react";
import { getBalanceSheetReport } from "@/app/actions/reports";
import { ReportShell } from "@/app/components/ReportShell";
import { StatCard } from "@/app/components/ui";
import { formatINR } from "@/lib/format";
import { Landmark, CheckCircle2, AlertTriangle, ShieldCheck, Wallet } from "lucide-react";
import { format } from "date-fns";

export const metadata = {
  title: "Balance Sheet | MediFlow Accounting",
  description: "Statutory statement of pharmacy assets, liabilities, and owners' equity as of current reporting date.",
};

export default async function BalanceSheetPage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string }>;
}) {
  const params = await searchParams;
  const asOf = params.to || format(new Date(), "yyyy-MM-dd");

  const report = await getBalanceSheetReport(asOf);
  const { assets, liabilities, equity, totalLiabilitiesAndEquity, isBalanced, asOfDate } = report;

  return (
    <ReportShell
      eyebrow="Financial Statements"
      title="Balance Sheet"
      description={`Statement of Financial Position as of ${format(new Date(asOfDate), "d MMMM yyyy")}.`}
      backHref="/dashboard/accounting"
      backLabel="Back to Accounting Overview"
      kpiRow={
        <>
          <StatCard
            label="Total Assets"
            value={formatINR(assets.totalAssets)}
            icon={Landmark}
            tone="brand"
            footnote="Cash, Bank, Debtors & Stock"
          />
          <StatCard
            label="Total Liabilities"
            value={formatINR(liabilities.totalLiabilities)}
            icon={Wallet}
            tone="neutral"
            footnote="Supplier payables & GST liability"
          />
          <StatCard
            label="Owner's Equity & Retained"
            value={formatINR(equity.totalEquity)}
            icon={ShieldCheck}
            tone="info"
            footnote="Capital + Accumulated profit"
          />
          <StatCard
            label="Equation Status"
            value={isBalanced ? "Balanced" : "Unbalanced"}
            icon={isBalanced ? CheckCircle2 : AlertTriangle}
            tone={isBalanced ? "brand" : "danger"}
            footnote={
              isBalanced
                ? "Assets = Liabilities + Equity"
                : `Variance: ${formatINR(Math.abs(assets.totalAssets - totalLiabilitiesAndEquity))}`
            }
          />
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Side: Assets */}
        <div className="card overflow-hidden flex flex-col justify-between">
          <div>
            <div className="card-header border-b border-ink-150 bg-ink-50/50">
              <h2 className="card-title text-[15px] font-bold">Assets</h2>
              <span className="badge badge-brand num font-semibold">
                {formatINR(assets.totalAssets)}
              </span>
            </div>

            <div className="p-5 space-y-6">
              {/* Current Assets */}
              <div className="space-y-2.5">
                <h3 className="text-[12.5px] font-semibold text-ink-500 uppercase tracking-wider">
                  Current Assets
                </h3>
                <table className="w-full text-[13px]">
                  <tbody>
                    {assets.currentAssets.length === 0 ? (
                      <tr>
                        <td className="py-2 text-ink-400 italic">No current assets posted.</td>
                      </tr>
                    ) : (
                      assets.currentAssets.map((acc) => (
                        <tr key={acc.code} className="border-b border-ink-100/70 hover:bg-ink-50/50">
                          <td className="py-2 text-ink-700">
                            <span className="font-mono text-ink-400 mr-2 text-[11.5px]">[{acc.code}]</span>
                            {acc.name}
                          </td>
                          <td className="py-2 text-right font-medium num text-ink-900">
                            {formatINR(acc.amount)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Fixed Assets */}
              {assets.fixedAssets.length > 0 && (
                <div className="space-y-2.5">
                  <h3 className="text-[12.5px] font-semibold text-ink-500 uppercase tracking-wider">
                    Non-Current & Fixed Assets
                  </h3>
                  <table className="w-full text-[13px]">
                    <tbody>
                      {assets.fixedAssets.map((acc) => (
                        <tr key={acc.code} className="border-b border-ink-100/70 hover:bg-ink-50/50">
                          <td className="py-2 text-ink-700">
                            <span className="font-mono text-ink-400 mr-2 text-[11.5px]">[{acc.code}]</span>
                            {acc.name}
                          </td>
                          <td className="py-2 text-right font-medium num text-ink-900">
                            {formatINR(acc.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="p-4 bg-ink-50/90 border-t border-ink-200 flex items-center justify-between font-bold text-[14px]">
            <span>Total Assets</span>
            <span className="text-brand-700 num">{formatINR(assets.totalAssets)}</span>
          </div>
        </div>

        {/* Right Side: Liabilities & Equity */}
        <div className="card overflow-hidden flex flex-col justify-between">
          <div>
            <div className="card-header border-b border-ink-150 bg-ink-50/50">
              <h2 className="card-title text-[15px] font-bold">Liabilities & Equity</h2>
              <span className="badge badge-neutral num font-semibold">
                {formatINR(totalLiabilitiesAndEquity)}
              </span>
            </div>

            <div className="p-5 space-y-6">
              {/* Liabilities */}
              <div className="space-y-2.5">
                <h3 className="text-[12.5px] font-semibold text-ink-500 uppercase tracking-wider">
                  Current Liabilities
                </h3>
                <table className="w-full text-[13px]">
                  <tbody>
                    {liabilities.currentLiabilities.length === 0 ? (
                      <tr>
                        <td className="py-2 text-ink-400 italic">No liabilities outstanding.</td>
                      </tr>
                    ) : (
                      liabilities.currentLiabilities.map((acc) => (
                        <tr key={acc.code} className="border-b border-ink-100/70 hover:bg-ink-50/50">
                          <td className="py-2 text-ink-700">
                            <span className="font-mono text-ink-400 mr-2 text-[11.5px]">[{acc.code}]</span>
                            {acc.name}
                          </td>
                          <td className="py-2 text-right font-medium num text-ink-900">
                            {formatINR(acc.amount)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Equity & Retained Earnings */}
              <div className="space-y-2.5">
                <h3 className="text-[12.5px] font-semibold text-ink-500 uppercase tracking-wider">
                  Owners&apos; Equity & Reserves
                </h3>
                <table className="w-full text-[13px]">
                  <tbody>
                    <tr className="border-b border-ink-100/70 hover:bg-ink-50/50">
                      <td className="py-2 text-ink-700">
                        <span className="font-mono text-brand-600 mr-2 text-[11.5px]">[RE]</span>
                        Retained Earnings (Period Profit)
                      </td>
                      <td className="py-2 text-right font-medium num text-ink-900">
                        {formatINR(equity.retainedEarnings)}
                      </td>
                    </tr>
                    {equity.accounts.map((acc) => (
                      <tr key={acc.code} className="border-b border-ink-100/70 hover:bg-ink-50/50">
                        <td className="py-2 text-ink-700">
                          <span className="font-mono text-ink-400 mr-2 text-[11.5px]">[{acc.code}]</span>
                          {acc.name}
                        </td>
                        <td className="py-2 text-right font-medium num text-ink-900">
                          {formatINR(acc.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="p-4 bg-ink-50/90 border-t border-ink-200 flex items-center justify-between font-bold text-[14px]">
            <span>Total Liabilities & Equity</span>
            <span className="text-ink-900 num">{formatINR(totalLiabilitiesAndEquity)}</span>
          </div>
        </div>
      </div>
    </ReportShell>
  );
}
