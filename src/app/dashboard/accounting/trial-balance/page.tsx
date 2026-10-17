import React from "react";
import { getTrialBalanceReport } from "@/app/actions/reports";
import { resolveDateRange } from "@/lib/date-range";
import { DateRangeFilter } from "@/app/components/DateRangeFilter";
import { ReportShell } from "@/app/components/ReportShell";
import { StatCard, EmptyState } from "@/app/components/ui";
import { formatINR } from "@/lib/format";
import { Scale, CheckCircle2, AlertTriangle, ArrowRightLeft } from "lucide-react";

export const metadata = {
  title: "Trial Balance | MediFlow Accounting",
  description: "Comprehensive multi-column trial balance with opening balances, period movements, and closing positions.",
};

export default async function TrialBalancePage({
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

  const report = await getTrialBalanceReport(dateRange.from, dateRange.to);
  const { items, totals, isBalanced } = report;

  return (
    <ReportShell
      eyebrow="Financial Statements"
      title="Trial Balance"
      description="Detailed ledger balances showing opening balances, period transactions, and closing debit/credit positions."
      backHref="/dashboard/accounting"
      backLabel="Back to Accounting Overview"
      filterBar={<DateRangeFilter />}
      kpiRow={
        <>
          <StatCard
            label="Total Period Debits"
            value={formatINR(totals.periodDebit)}
            icon={Scale}
            tone="info"
          />
          <StatCard
            label="Total Period Credits"
            value={formatINR(totals.periodCredit)}
            icon={Scale}
            tone="neutral"
          />
          <StatCard
            label="Closing Position"
            value={formatINR(totals.closingDebit)}
            icon={ArrowRightLeft}
            tone="brand"
            footnote="Net debit & credit total"
          />
          <StatCard
            label="Ledger Health"
            value={isBalanced ? "Balanced" : "Discrepancy"}
            icon={isBalanced ? CheckCircle2 : AlertTriangle}
            tone={isBalanced ? "brand" : "danger"}
            footnote={
              isBalanced
                ? "Total Debits equal Total Credits"
                : `Difference: ${formatINR(Math.abs(totals.closingDebit - totals.closingCredit))}`
            }
          />
        </>
      }
    >
      <div className="card overflow-hidden">
        <div className="card-header border-b border-ink-150">
          <div>
            <h2 className="card-title">General Ledger Balances</h2>
            <p className="text-[12px] text-ink-500">
              Double-entry account balances grouped by nature of account.
            </p>
          </div>
          <span className="badge badge-neutral num font-mono text-[12px]">
            {items.length} Active Accounts
          </span>
        </div>

        {items.length === 0 ? (
          <EmptyState
            icon={Scale}
            title="No ledger entries found"
            description="Post your first sale, purchase, or stock movement to generate accounting entries."
            compact
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="w-20">Code</th>
                  <th>Account Name</th>
                  <th>Category</th>
                  <th className="text-right border-l border-ink-100">Opening (₹)</th>
                  <th className="text-right">Debit (₹)</th>
                  <th className="text-right">Credit (₹)</th>
                  <th className="text-right border-l border-ink-100">Closing Debit</th>
                  <th className="text-right">Closing Credit</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id} className="hover:bg-ink-50/70 transition-colors">
                    <td className="font-mono text-[12px] text-ink-500 font-medium">
                      {row.code}
                    </td>
                    <td className="cell-primary font-medium">{row.name}</td>
                    <td>
                      <span className="badge badge-neutral capitalize !text-[11px]">
                        {row.type}
                      </span>
                    </td>
                    <td className="text-right num text-ink-500 border-l border-ink-100">
                      {row.openingDebit > 0
                        ? formatINR(row.openingDebit)
                        : row.openingCredit > 0
                        ? `(${formatINR(row.openingCredit)})`
                        : "—"}
                    </td>
                    <td className="text-right num text-ink-800">
                      {row.periodDebit > 0 ? formatINR(row.periodDebit) : "—"}
                    </td>
                    <td className="text-right num text-ink-800">
                      {row.periodCredit > 0 ? formatINR(row.periodCredit) : "—"}
                    </td>
                    <td className="text-right num font-semibold text-ink-900 border-l border-ink-100">
                      {row.closingDebit > 0 ? formatINR(row.closingDebit) : "—"}
                    </td>
                    <td className="text-right num font-semibold text-ink-900">
                      {row.closingCredit > 0 ? formatINR(row.closingCredit) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-ink-50/90 font-bold border-t-2 border-ink-300 text-ink-900">
                  <td colSpan={3} className="text-right uppercase tracking-wider text-[11.5px]">
                    Total
                  </td>
                  <td className="text-right num border-l border-ink-200">
                    {formatINR(totals.openingDebit)}
                  </td>
                  <td className="text-right num text-ink-900">
                    {formatINR(totals.periodDebit)}
                  </td>
                  <td className="text-right num text-ink-900">
                    {formatINR(totals.periodCredit)}
                  </td>
                  <td className="text-right num text-brand-700 border-l border-ink-200">
                    {formatINR(totals.closingDebit)}
                  </td>
                  <td className="text-right num text-brand-700">
                    {formatINR(totals.closingCredit)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </ReportShell>
  );
}
