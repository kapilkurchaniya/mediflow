import React from "react";
import { getProfitAndLossReport } from "@/app/actions/reports";
import { resolveDateRange } from "@/lib/date-range";
import { DateRangeFilter } from "@/app/components/DateRangeFilter";
import { ReportShell } from "@/app/components/ReportShell";
import { StatCard } from "@/app/components/ui";
import { formatINR } from "@/lib/format";
import { TrendingUp, IndianRupee, ShoppingCart, Percent } from "lucide-react";

export const metadata = {
  title: "Profit & Loss Statement | MediFlow Accounting",
  description: "Pharmacy operational revenue, cost of goods sold (COGS), operating expenses, and net profit margins.",
};

export default async function ProfitAndLossPage({
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

  const report = await getProfitAndLossReport(dateRange.from, dateRange.to);
  const { revenue, cogs, grossProfit, operatingExpenses, netProfit, marginPercent, periodLabel } = report;

  const isProfitable = netProfit >= 0;

  return (
    <ReportShell
      eyebrow="Financial Statements"
      title="Profit & Loss Statement"
      description={`Income statement showing trading performance and operational expenses (${periodLabel}).`}
      backHref="/dashboard/accounting"
      backLabel="Back to Accounting Overview"
      filterBar={<DateRangeFilter />}
      kpiRow={
        <>
          <StatCard
            label="Gross Revenue"
            value={formatINR(revenue.totalRevenue)}
            icon={IndianRupee}
            tone="brand"
            footnote="Net of sales returns & rebates"
          />
          <StatCard
            label="Cost of Goods (COGS)"
            value={formatINR(cogs.totalCogs)}
            icon={ShoppingCart}
            tone="neutral"
            footnote="Direct purchase expenditure"
          />
          <StatCard
            label="Gross Profit"
            value={formatINR(grossProfit)}
            icon={TrendingUp}
            tone={grossProfit >= 0 ? "info" : "danger"}
            footnote={`${marginPercent}% trading margin`}
          />
          <StatCard
            label="Net Profit"
            value={formatINR(netProfit)}
            icon={isProfitable ? TrendingUp : Percent}
            tone={isProfitable ? "brand" : "danger"}
            footnote={isProfitable ? "Surplus after all expenses" : "Net trading loss"}
          />
        </>
      }
    >
      <div className="card overflow-hidden">
        <div className="card-header border-b border-ink-150">
          <div>
            <h2 className="card-title">Trading & Income Statement</h2>
            <p className="text-[12px] text-ink-500">
              Values calculated in accordance with double-entry ledger postings.
            </p>
          </div>
          <span className="badge badge-brand num font-medium text-[12px]">
            Gross Margin: {marginPercent}%
          </span>
        </div>

        <div className="p-6 space-y-8">
          {/* Section 1: Revenue from Operations */}
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-ink-200">
              <h3 className="text-[14px] font-semibold text-ink-900 uppercase tracking-wide">
                1. Revenue from Operations (Income)
              </h3>
              <span className="text-[14px] font-bold text-ink-900 num">
                {formatINR(revenue.totalRevenue)}
              </span>
            </div>
            <table className="w-full text-[13.5px]">
              <tbody>
                {revenue.accounts.length === 0 ? (
                  <tr>
                    <td className="py-2 text-ink-400 italic">No sales revenue recorded in this period.</td>
                    <td className="py-2 text-right num text-ink-400">₹0.00</td>
                  </tr>
                ) : (
                  revenue.accounts.map((acc) => (
                    <tr key={acc.code} className="border-b border-ink-100 hover:bg-ink-50/50">
                      <td className="py-2.5 text-ink-700">
                        <span className="font-mono text-ink-400 mr-2">[{acc.code}]</span>
                        {acc.name}
                      </td>
                      <td className="py-2.5 text-right font-medium num text-ink-900">
                        {formatINR(acc.amount)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Section 2: Cost of Goods Sold */}
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-ink-200">
              <h3 className="text-[14px] font-semibold text-ink-900 uppercase tracking-wide">
                2. Cost of Materials Consumed & Inward Purchases
              </h3>
              <span className="text-[14px] font-bold text-ink-900 num">
                {formatINR(cogs.totalCogs)}
              </span>
            </div>
            <table className="w-full text-[13.5px]">
              <tbody>
                {cogs.accounts.length === 0 ? (
                  <tr>
                    <td className="py-2 text-ink-400 italic">No purchase expenses posted in this period.</td>
                    <td className="py-2 text-right num text-ink-400">₹0.00</td>
                  </tr>
                ) : (
                  cogs.accounts.map((acc) => (
                    <tr key={acc.code} className="border-b border-ink-100 hover:bg-ink-50/50">
                      <td className="py-2.5 text-ink-700">
                        <span className="font-mono text-ink-400 mr-2">[{acc.code}]</span>
                        {acc.name}
                      </td>
                      <td className="py-2.5 text-right font-medium num text-ink-900">
                        {formatINR(acc.amount)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Gross Profit Summary Banner */}
          <div className="p-4 rounded-xl bg-ink-50 border border-ink-200/80 flex items-center justify-between">
            <div>
              <p className="text-[14px] font-semibold text-ink-900">Gross Profit (1 - 2)</p>
              <p className="text-[12px] text-ink-500">Retail pharmacy trade surplus before operational expenses</p>
            </div>
            <span className={`text-[18px] font-bold num ${grossProfit >= 0 ? "text-brand-700" : "text-rose-600"}`}>
              {formatINR(grossProfit)}
            </span>
          </div>

          {/* Section 3: Operating & Administrative Expenses */}
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-ink-200">
              <h3 className="text-[14px] font-semibold text-ink-900 uppercase tracking-wide">
                3. Operating & Administrative Expenses
              </h3>
              <span className="text-[14px] font-bold text-ink-900 num">
                {formatINR(operatingExpenses.totalExpenses)}
              </span>
            </div>
            <table className="w-full text-[13.5px]">
              <tbody>
                {operatingExpenses.accounts.length === 0 ? (
                  <tr>
                    <td className="py-2 text-ink-400 italic">No secondary operating expenses recorded.</td>
                    <td className="py-2 text-right num text-ink-400">₹0.00</td>
                  </tr>
                ) : (
                  operatingExpenses.accounts.map((acc) => (
                    <tr key={acc.code} className="border-b border-ink-100 hover:bg-ink-50/50">
                      <td className="py-2.5 text-ink-700">
                        <span className="font-mono text-ink-400 mr-2">[{acc.code}]</span>
                        {acc.name}
                      </td>
                      <td className="py-2.5 text-right font-medium num text-ink-900">
                        {formatINR(acc.amount)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Net Profit Final Box */}
          <div className={`p-5 rounded-xl border flex items-center justify-between ${
            isProfitable
              ? "bg-brand-50/50 border-brand-200 text-brand-950"
              : "bg-rose-50/50 border-rose-200 text-rose-950"
          }`}>
            <div>
              <p className="text-[16px] font-bold">
                {isProfitable ? "Net Profit for the Period" : "Net Operating Loss"}
              </p>
              <p className="text-[12.5px] opacity-80 mt-0.5">
                Transferred to Balance Sheet Retained Earnings
              </p>
            </div>
            <div className="text-right">
              <span className={`text-[24px] font-extrabold num ${isProfitable ? "text-brand-700" : "text-rose-600"}`}>
                {formatINR(netProfit)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </ReportShell>
  );
}
