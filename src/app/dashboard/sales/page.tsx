import { getSales } from "@/app/actions/sales";
import { Plus, Receipt, Printer, Eye } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { PageHeader, SearchForm, EmptyState, Avatar } from "@/app/components/ui";
import { formatINR, formatNumber } from "@/lib/format";
import { DateRangeFilter } from "@/app/components/DateRangeFilter";
import { ExportButton } from "@/app/components/ExportButton";
import { resolveDateRange } from "@/lib/date-range";
import { requirePagePermission } from "@/server/rbac";

export const metadata = { title: "Sales & invoices" };

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; range?: string; from?: string; to?: string }>;
}) {
  await requirePagePermission("sale.view");
  const params = await searchParams;
  const dateRange = resolveDateRange({
    range: params.range,
    from: params.from,
    to: params.to,
  });

  const sales = await getSales(dateRange.from, dateRange.to);
  const total = sales.reduce((a, { sale }) => a + (sale.totalAmount ?? 0), 0);
  const outstanding = sales.reduce((a, { sale }) => a + Math.max(sale.creditAmount ?? 0, 0), 0);

  return (
    <div className="page space-y-6">
      <PageHeader
        title="Sales & invoices"
        description="Every bill raised from this store, with payment status."
        actions={
          <>
            <ExportButton
              endpoint="/api/export/sales"
              from={dateRange.from}
              to={dateRange.to}
            />
            <Link href="/dashboard/sales/pos" className="btn btn-primary">
              <Plus /> New bill
            </Link>
          </>
        }
      />

      {/* Date Range Filter */}
      <div className="card px-4 py-3">
        <DateRangeFilter />
      </div>

      <div className="card overflow-hidden">
        <SearchForm placeholder="Search invoice no. or customer">
          <div className="flex items-center gap-4 text-[12.5px] text-ink-500">
            <span>
              Billed <span className="font-medium text-ink-900 num">{formatINR(total)}</span>
            </span>
            <span className="h-3 w-px bg-ink-200" />
            <span>
              Outstanding <span className="font-medium text-amber-700 num">{formatINR(outstanding)}</span>
            </span>
            <span className="h-3 w-px bg-ink-200" />
            <span>
              <span className="font-medium text-ink-900 num">{formatNumber(sales.length)}</span> invoices
            </span>
          </div>
        </SearchForm>

        {sales.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Prescribed by</th>
                  <th className="text-right">Amount</th>
                  <th className="text-right">Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sales.map(({ sale, customer }) => {
                  const name = customer?.name || sale.customerName || "Walk-in customer";
                  const paid = !sale.creditAmount || sale.creditAmount <= 0;
                  const partial = !paid && (sale.paidAmount ?? 0) > 0;
                  return (
                    <tr key={sale.id} className="hover:bg-ink-50/70 transition-colors">
                      <td>
                        <Link
                          href={`/dashboard/sales/${sale.id}`}
                          className="font-mono text-[12.5px] font-bold text-brand-700 hover:text-brand-900 hover:underline"
                        >
                          {sale.invoiceNo}
                        </Link>
                      </td>
                      <td className="text-ink-600 num whitespace-nowrap">
                        {format(new Date(sale.completedAt ?? sale.createdAt), "d MMM yyyy")}
                        <div className="cell-sub">{format(new Date(sale.completedAt ?? sale.createdAt), "hh:mm a")}</div>
                      </td>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <Avatar name={name} size="sm" />
                          <span className="text-ink-800 font-medium">{name}</span>
                        </div>
                      </td>
                      <td className="text-ink-600">{sale.doctorName || <span className="text-ink-400">—</span>}</td>
                      <td className="text-right font-bold text-ink-900 num">{formatINR(sale.totalAmount)}</td>
                      <td className="text-right">
                        <span
                          className={`badge badge-dot ${paid ? "badge-success" : partial ? "badge-warning" : "badge-danger"}`}
                        >
                          {paid ? "Paid" : partial ? "Partial" : "Unpaid"}
                        </span>
                      </td>
                      <td className="text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <Link
                            href={`/dashboard/sales/${sale.id}`}
                            className="btn btn-secondary btn-icon !h-7 !w-7"
                            title="View Invoice Details"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Link>
                          <Link
                            href={`/dashboard/sales/${sale.id}/print?format=thermal`}
                            className="btn btn-secondary btn-icon !h-7 !w-7"
                            title="Print Thermal 80mm Slip"
                          >
                            <Printer className="h-3.5 w-3.5" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="flex items-center justify-between border-t border-ink-150 px-4 py-2.5 text-[12.5px] text-ink-500">
              <span className="num">Showing {formatNumber(sales.length)} invoices</span>
            </div>
          </div>
        ) : (
          <EmptyState
            icon={Receipt}
            title="No invoices yet"
            description="Open the POS counter to raise your first bill. It takes under 10 seconds."
            action={
              <Link href="/dashboard/sales/pos" className="btn btn-primary btn-sm">
                <Plus /> Open POS
              </Link>
            }
          />
        )}
      </div>
    </div>
  );
}
