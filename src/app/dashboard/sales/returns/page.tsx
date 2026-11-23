import Link from "next/link";
import { RotateCcw, FileText, ArrowUpRight, Search, Printer, Calendar } from "lucide-react";
import { PageHeader } from "@/app/components/ui";
import { requirePagePermission } from "@/server/rbac";
import { getSaleReturnsList } from "@/app/actions/sales";
import { formatINR, formatISTDateTime } from "@/lib/format";

export const metadata = { title: "Sale Returns & Credit Notes" };

export default async function SaleReturnsListPage({
  searchParams,
}: {
  searchParams: Promise<{ dateFrom?: string; dateTo?: string }>;
}) {
  await requirePagePermission("sale.view");
  const { dateFrom, dateTo } = await searchParams;

  const returns = await getSaleReturnsList(dateFrom, dateTo);

  const totalAmount = returns.reduce((sum, r) => sum + (r.saleReturn.totalAmount ?? 0), 0);
  const totalTaxable = returns.reduce((sum, r) => sum + (r.saleReturn.taxableAmount ?? 0), 0);
  const totalTax = returns.reduce((sum, r) => sum + (r.saleReturn.taxAmount ?? 0), 0);

  return (
    <div className="page space-y-6">
      <PageHeader
        title="Sale Returns & Credit Notes"
        description="Register of all customer returns, inventory batch restorations, and issued GST Credit Notes"
        backHref="/dashboard/sales"
        actions={
          <div className="flex items-center gap-2">
            <Link href="/dashboard/sales" className="btn btn-secondary text-xs">
              View Sales Register
            </Link>
            <Link href="/dashboard/sales/pos" className="btn btn-primary text-xs">
              New Sale Counter <kbd className="ml-1 text-[10px] opacity-75 font-mono">Alt+N</kbd>
            </Link>
          </div>
        }
      />

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-4 space-y-1 shadow-xs border-amber-200 bg-amber-50/40">
          <div className="text-[12px] font-bold text-amber-800 uppercase tracking-wider">
            Total Credit Notes
          </div>
          <div className="text-2xl font-black text-ink-900 num">{returns.length}</div>
          <div className="text-[12px] text-ink-500">Processed returns to date</div>
        </div>

        <div className="card p-4 space-y-1 shadow-xs border-amber-200 bg-amber-50/40">
          <div className="text-[12px] font-bold text-amber-800 uppercase tracking-wider">
            Total Returned Value
          </div>
          <div className="text-2xl font-black text-amber-800 num">{formatINR(totalAmount)}</div>
          <div className="text-[12px] text-ink-500">Gross credit notes issued</div>
        </div>

        <div className="card p-4 space-y-1 shadow-xs border-amber-200 bg-amber-50/40">
          <div className="text-[12px] font-bold text-amber-800 uppercase tracking-wider">
            Tax Reversals (Output GST)
          </div>
          <div className="text-2xl font-black text-ink-900 num">{formatINR(totalTax)}</div>
          <div className="text-[12px] text-ink-500">
            Taxable Value: <span className="font-semibold num">{formatINR(totalTaxable)}</span>
          </div>
        </div>
      </div>

      {/* Date Filter Bar */}
      <div className="card p-4 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <form method="GET" className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-ink-400" />
            <span className="text-xs font-semibold text-ink-700">Filter Date:</span>
          </div>
          <input
            type="date"
            name="dateFrom"
            defaultValue={dateFrom || ""}
            className="input !py-1 !px-2 text-xs"
            placeholder="From Date"
          />
          <span className="text-xs text-ink-400">to</span>
          <input
            type="date"
            name="dateTo"
            defaultValue={dateTo || ""}
            className="input !py-1 !px-2 text-xs"
            placeholder="To Date"
          />
          <button type="submit" className="btn btn-secondary !py-1 !px-3 text-xs">
            Filter
          </button>
          {(dateFrom || dateTo) && (
            <Link href="/dashboard/sales/returns" className="text-xs text-ink-500 hover:text-ink-800 underline">
              Reset
            </Link>
          )}
        </form>

        <span className="text-xs text-ink-500 font-mono">
          Showing {returns.length} return voucher(s)
        </span>
      </div>

      {/* Returns List Table */}
      <div className="card overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Credit Note No</th>
                <th>Issued At</th>
                <th>Original Invoice</th>
                <th>Customer</th>
                <th>Method</th>
                <th>Reason</th>
                <th className="text-right">Taxable</th>
                <th className="text-right">GST</th>
                <th className="text-right">Total Credit</th>
                <th className="text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {returns.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-ink-400 text-sm">
                    No sale returns recorded yet.
                  </td>
                </tr>
              ) : (
                returns.map(({ saleReturn, sale, user }) => (
                  <tr key={saleReturn.id}>
                    <td>
                      <Link
                        href={`/dashboard/sales/returns/${saleReturn.id}/print`}
                        className="font-mono font-bold text-amber-800 hover:text-amber-950 flex items-center gap-1"
                      >
                        <FileText className="h-3.5 w-3.5 text-amber-600" />
                        {saleReturn.returnNo}
                      </Link>
                    </td>

                    <td>
                      <span className="text-[12.5px] text-ink-800">
                        {saleReturn.createdAt
                          ? formatISTDateTime(saleReturn.createdAt, "short")
                          : "—"}
                      </span>
                      {user && <div className="cell-sub text-[11px]">By {user.name}</div>}
                    </td>

                    <td>
                      <Link
                        href={`/dashboard/sales/${sale.id}`}
                        className="font-mono text-ink-800 hover:text-brand-600 font-medium flex items-center gap-1 text-[12.5px]"
                      >
                        {sale.invoiceNo}
                        <ArrowUpRight className="h-3 w-3 text-ink-400" />
                      </Link>
                    </td>

                    <td>
                      <span className="font-medium text-ink-900 text-[13px]">
                        {sale.customerName || "Walk-in Customer"}
                      </span>
                      {sale.customerPhone && (
                        <div className="cell-sub text-[11px] font-mono">{sale.customerPhone}</div>
                      )}
                    </td>

                    <td>
                      <span className="badge badge-neutral uppercase text-[10.5px]">
                        {saleReturn.refundMethod}
                      </span>
                    </td>

                    <td className="max-w-xs truncate text-[12px] text-ink-600" title={saleReturn.reason}>
                      {saleReturn.reason}
                    </td>

                    <td className="text-right num text-ink-700">
                      {formatINR(saleReturn.taxableAmount ?? 0)}
                    </td>

                    <td className="text-right num text-ink-700">
                      {formatINR(saleReturn.taxAmount ?? 0)}
                    </td>

                    <td className="text-right num font-bold text-amber-800 text-[14px]">
                      {formatINR(saleReturn.totalAmount ?? 0)}
                    </td>

                    <td className="text-center">
                      <Link
                        href={`/dashboard/sales/returns/${saleReturn.id}/print`}
                        className="btn btn-secondary !py-1 !px-2.5 text-xs text-ink-800"
                        title="Print official GST Credit Note"
                      >
                        <Printer className="h-3.5 w-3.5 mr-1 text-ink-600" />
                        Print
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
