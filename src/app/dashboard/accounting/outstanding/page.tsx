import React from "react";
import Link from "next/link";
import { getOutstandingReport } from "@/app/actions/reports";
import { ReportShell } from "@/app/components/ReportShell";
import { StatCard, EmptyState, Avatar } from "@/app/components/ui";
import { formatINR, formatNumber } from "@/lib/format";
import { Users, Truck, Clock, AlertTriangle, ChevronRight, Phone } from "lucide-react";
import { requirePagePermission } from "@/server/rbac";

export const metadata = {
  title: "Outstanding Ageing Analysis | MediFlow Accounting",
  description: "Customer receivables and supplier payables with 30, 60, 90+ day ageing buckets.",
};

export default async function OutstandingPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  await requirePagePermission("accounting.view");
  const params = await searchParams;
  const type = (params.type === "payable" ? "payable" : "receivable") as "receivable" | "payable";

  const report = await getOutstandingReport(type);
  const { parties, totalDue, buckets } = report;

  const isReceivable = type === "receivable";

  return (
    <ReportShell
      eyebrow="Credit & Debtors Analysis"
      title={isReceivable ? "Customer Receivables & Ageing" : "Supplier Payables & Ageing"}
      description={
        isReceivable
          ? "Unsettled credit balances owed by customers with invoice ageing analysis."
          : "Outstanding balances owed to medicine suppliers and distributors."
      }
      backHref="/dashboard/accounting"
      backLabel="Back to Accounting Overview"
      filterBar={
        <div className="flex items-center justify-between gap-4">
          <div className="inline-flex rounded-lg border border-ink-200 bg-ink-50/70 p-1" role="tablist">
            <Link
              href="/dashboard/accounting/outstanding?type=receivable"
              role="tab"
              aria-selected={isReceivable}
              className={`flex items-center gap-2 rounded-md px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                isReceivable
                  ? "bg-white text-ink-900 shadow-xs font-semibold"
                  : "text-ink-600 hover:text-ink-900"
              }`}
            >
              <Users className="h-4 w-4" />
              Customer Receivables
            </Link>
            <Link
              href="/dashboard/accounting/outstanding?type=payable"
              role="tab"
              aria-selected={!isReceivable}
              className={`flex items-center gap-2 rounded-md px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                !isReceivable
                  ? "bg-white text-ink-900 shadow-xs font-semibold"
                  : "text-ink-600 hover:text-ink-900"
              }`}
            >
              <Truck className="h-4 w-4" />
              Supplier Payables
            </Link>
          </div>

          <span className="text-[12.5px] text-ink-500">
            Total {parties.length} {isReceivable ? "Debtors" : "Creditors"}
          </span>
        </div>
      }
      kpiRow={
        <>
          <StatCard
            label={isReceivable ? "Total Receivables" : "Total Payables"}
            value={formatINR(totalDue)}
            icon={isReceivable ? Users : Truck}
            tone={isReceivable ? "warning" : "neutral"}
            footnote={`Across ${formatNumber(parties.length)} accounts`}
          />
          <StatCard
            label="Current (0–30 Days)"
            value={formatINR(buckets.bucket0to30)}
            icon={Clock}
            tone="brand"
            footnote="Within standard credit period"
          />
          <StatCard
            label="Overdue (31–60 Days)"
            value={formatINR(buckets.bucket31to60)}
            icon={Clock}
            tone="info"
            footnote="Due for reminder"
          />
          <StatCard
            label="Critical (> 60 Days)"
            value={formatINR(buckets.bucket61to90 + buckets.bucketOver90)}
            icon={AlertTriangle}
            tone={buckets.bucket61to90 + buckets.bucketOver90 > 0 ? "danger" : "neutral"}
            footnote="Immediate recovery needed"
          />
        </>
      }
    >
      <div className="card overflow-hidden">
        <div className="card-header border-b border-ink-150">
          <div>
            <h2 className="card-title">
              {isReceivable ? "Debtor Ageing Ledger" : "Creditor Ageing Ledger"}
            </h2>
            <p className="text-[12px] text-ink-500">
              Ageing is categorized from original invoice issuance date.
            </p>
          </div>
          <span className="badge badge-neutral num font-mono text-[12px]">
            Total Outstanding: {formatINR(totalDue)}
          </span>
        </div>

        {parties.length === 0 ? (
          <EmptyState
            icon={isReceivable ? Users : Truck}
            title={isReceivable ? "Zero outstanding customer credit" : "Zero supplier dues"}
            description={
              isReceivable
                ? "All customers have fully settled their invoices."
                : "All supplier goods receipt notes (GRN) are paid in full."
            }
            compact
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{isReceivable ? "Customer Name" : "Supplier Name"}</th>
                  <th>Invoices</th>
                  <th>Latest Bill Date</th>
                  <th className="text-right">0–30 Days</th>
                  <th className="text-right">31–60 Days</th>
                  <th className="text-right">61–90 Days</th>
                  <th className="text-right">Over 90 Days</th>
                  <th className="text-right border-l border-ink-150">Total Due</th>
                </tr>
              </thead>
              <tbody>
                {parties.map((party) => (
                  <tr key={party.id} className="hover:bg-ink-50/70 transition-colors">
                    <td>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={party.name} size="sm" />
                        <div>
                          <p className="cell-primary font-medium">{party.name}</p>
                          {party.phone && (
                            <p className="cell-sub flex items-center gap-1 font-mono text-[11.5px]">
                              <Phone className="h-3 w-3 text-ink-400" />
                              {party.phone}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="num text-ink-600">
                      {party.invoiceCount} {party.invoiceCount === 1 ? "bill" : "bills"}
                    </td>
                    <td className="num text-ink-600 whitespace-nowrap text-[12.5px]">
                      {party.latestInvoiceDate || "—"}
                    </td>
                    <td className="text-right num text-ink-700">
                      {party.bucket0to30 > 0 ? formatINR(party.bucket0to30) : <span className="text-ink-300">—</span>}
                    </td>
                    <td className="text-right num text-ink-700">
                      {party.bucket31to60 > 0 ? formatINR(party.bucket31to60) : <span className="text-ink-300">—</span>}
                    </td>
                    <td className="text-right num text-amber-700 font-medium">
                      {party.bucket61to90 > 0 ? formatINR(party.bucket61to90) : <span className="text-ink-300">—</span>}
                    </td>
                    <td className="text-right num text-rose-600 font-semibold">
                      {party.bucketOver90 > 0 ? formatINR(party.bucketOver90) : <span className="text-ink-300">—</span>}
                    </td>
                    <td className="text-right num font-bold text-ink-900 border-l border-ink-150">
                      {formatINR(party.totalDue)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-ink-50/90 font-bold border-t-2 border-ink-300 text-ink-900">
                  <td colSpan={3} className="text-right uppercase tracking-wider text-[11.5px]">
                    Total Outstanding
                  </td>
                  <td className="text-right num">{formatINR(buckets.bucket0to30)}</td>
                  <td className="text-right num">{formatINR(buckets.bucket31to60)}</td>
                  <td className="text-right num text-amber-700">{formatINR(buckets.bucket61to90)}</td>
                  <td className="text-right num text-rose-600">{formatINR(buckets.bucketOver90)}</td>
                  <td className="text-right num text-brand-700 border-l border-ink-200">
                    {formatINR(totalDue)}
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
