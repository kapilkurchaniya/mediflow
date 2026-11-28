import React from "react";
import { getCashFlowReport } from "@/app/actions/reports";
import { resolveDateRange } from "@/lib/date-range";
import { DateRangeFilter } from "@/app/components/DateRangeFilter";
import { ReportShell } from "@/app/components/ReportShell";
import { StatCard } from "@/app/components/ui";
import { formatINR } from "@/lib/format";
import { Banknote, ArrowDownLeft, ArrowUpRight, Wallet } from "lucide-react";
import { requirePagePermission } from "@/server/rbac";

export const metadata = {
  title: "Cash Flow Statement | MediFlow Accounting",
  description: "Liquidity and cash movements from sales, debtor collections, and supplier settlements.",
};

export default async function CashFlowPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  await requirePagePermission("accounting.view");
  const params = await searchParams;
  const dateRange = resolveDateRange({
    range: params.range,
    from: params.from,
    to: params.to,
  });

  const report = await getCashFlowReport(dateRange.from, dateRange.to);
  const { operatingInflows, operatingOutflows, netOperatingCashFlow, openingCashAndBank, closingCashAndBank, periodLabel } = report;

  const isNetPositive = netOperatingCashFlow >= 0;

  return (
    <ReportShell
      eyebrow="Financial Statements"
      title="Cash Flow Statement"
      description={`Direct method operating liquidity analysis across counter cash, UPI and bank transfers (${periodLabel}).`}
      backHref="/dashboard/accounting"
      backLabel="Back to Accounting Overview"
      filterBar={<DateRangeFilter />}
      kpiRow={
        <>
          <StatCard
            label="Cash & Bank Inflows"
            value={formatINR(operatingInflows.totalInflows)}
            icon={ArrowDownLeft}
            tone="brand"
            footnote="Counter sales + customer payments"
          />
          <StatCard
            label="Cash & Bank Outflows"
            value={formatINR(operatingOutflows.totalOutflows)}
            icon={ArrowUpRight}
            tone="neutral"
            footnote="Supplier payouts & store expenses"
          />
          <StatCard
            label="Net Operating Cash Flow"
            value={formatINR(netOperatingCashFlow)}
            icon={Banknote}
            tone={isNetPositive ? "info" : "danger"}
            footnote={isNetPositive ? "Net cash generated" : "Net cash drained"}
          />
          <StatCard
            label="Closing Liquidity"
            value={formatINR(closingCashAndBank)}
            icon={Wallet}
            tone="brand"
            footnote="Cash on hand + Bank balance"
          />
        </>
      }
    >
      <div className="card overflow-hidden">
        <div className="card-header border-b border-ink-150">
          <div>
            <h2 className="card-title">Statement of Cash & Bank Inflows and Outflows</h2>
            <p className="text-[12px] text-ink-500">
              Transactions impacting liquid accounts (1010 Cash on Hand and 1020 Bank/Digital).
            </p>
          </div>
          <span className="badge badge-brand num font-medium text-[12px]">
            Opening: {formatINR(openingCashAndBank)}
          </span>
        </div>

        <div className="p-6 space-y-8">
          {/* Section 1: Inflows */}
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-ink-200">
              <h3 className="text-[14px] font-semibold text-ink-900 uppercase tracking-wide">
                1. Cash Inflows from Sales & Receipts
              </h3>
              <span className="text-[14px] font-bold text-brand-700 num">
                +{formatINR(operatingInflows.totalInflows)}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13.5px]">
                <tbody>
                  <tr className="border-b border-ink-100 hover:bg-ink-50/50">
                    <td className="py-2.5 text-ink-700">Cash Collected at POS Counter</td>
                    <td className="py-2.5 text-right font-medium num text-ink-900">
                      {formatINR(operatingInflows.cashSales)}
                    </td>
                  </tr>
                  <tr className="border-b border-ink-100 hover:bg-ink-50/50">
                    <td className="py-2.5 text-ink-700">UPI / QR / Digital Collections</td>
                    <td className="py-2.5 text-right font-medium num text-ink-900">
                      {formatINR(operatingInflows.digitalSales)}
                    </td>
                  </tr>
                  <tr className="border-b border-ink-100 hover:bg-ink-50/50">
                    <td className="py-2.5 text-ink-700">Collections against Past Customer Credit (Debtors)</td>
                    <td className="py-2.5 text-right font-medium num text-ink-900">
                      {formatINR(operatingInflows.debtorReceipts)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 2: Outflows */}
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-ink-200">
              <h3 className="text-[14px] font-semibold text-ink-900 uppercase tracking-wide">
                2. Cash Outflows for Operations & Procurement
              </h3>
              <span className="text-[14px] font-bold text-rose-600 num">
                -{formatINR(operatingOutflows.totalOutflows)}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13.5px]">
                <tbody>
                  <tr className="border-b border-ink-100 hover:bg-ink-50/50">
                    <td className="py-2.5 text-ink-700">Cash / Spot Purchases Paid to Suppliers</td>
                    <td className="py-2.5 text-right font-medium num text-ink-900">
                      {formatINR(operatingOutflows.cashPurchases)}
                    </td>
                  </tr>
                  <tr className="border-b border-ink-100 hover:bg-ink-50/50">
                    <td className="py-2.5 text-ink-700">Settlements against Supplier Invoices (Creditors)</td>
                    <td className="py-2.5 text-right font-medium num text-ink-900">
                      {formatINR(operatingOutflows.creditorPayments)}
                    </td>
                  </tr>
                  <tr className="border-b border-ink-100 hover:bg-ink-50/50">
                    <td className="py-2.5 text-ink-700">Operational & Incidental Cash Expenses</td>
                    <td className="py-2.5 text-right font-medium num text-ink-900">
                      {formatINR(operatingOutflows.expenses)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Net Movement Reconciliation */}
          <div className="p-5 rounded-xl bg-ink-50 border border-ink-200 space-y-3">
            <div className="flex items-center justify-between text-[13.5px] text-ink-700">
              <span>Opening Cash & Bank Balance</span>
              <span className="num font-semibold text-ink-900">{formatINR(openingCashAndBank)}</span>
            </div>
            <div className="flex items-center justify-between text-[13.5px] text-ink-700">
              <span>Net Operating Cash Generated / (Used)</span>
              <span className={`num font-bold ${isNetPositive ? "text-brand-700" : "text-rose-600"}`}>
                {isNetPositive ? "+" : ""}{formatINR(netOperatingCashFlow)}
              </span>
            </div>
            <div className="pt-3 border-t border-ink-200 flex items-center justify-between font-bold text-[15px] text-ink-900">
              <span>Closing Cash & Bank Balance</span>
              <span className="num text-brand-700 text-[18px]">{formatINR(closingCashAndBank)}</span>
            </div>
          </div>
        </div>
      </div>
    </ReportShell>
  );
}
