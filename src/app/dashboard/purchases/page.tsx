import { getPurchases } from "@/app/actions/purchases";
import { Plus, FileInput } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { PageHeader, SearchForm, EmptyState } from "@/app/components/ui";
import { formatINR, formatNumber } from "@/lib/format";
import { DateRangeFilter } from "@/app/components/DateRangeFilter";
import { ExportButton } from "@/app/components/ExportButton";
import { resolveDateRange } from "@/lib/date-range";

export const metadata = { title: "Purchases" };

export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; range?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const dateRange = resolveDateRange({
    range: params.range,
    from: params.from,
    to: params.to,
  });

  const purchases = await getPurchases(dateRange.from, dateRange.to);
  const total = purchases.reduce((a, { purchase }) => a + (purchase.totalAmount ?? 0), 0);

  return (
    <div className="page space-y-6">
      <PageHeader
        title="Purchases"
        description="Supplier invoices and goods receipt notes (GRN) posted to stock and payables."
        actions={
          <>
            <ExportButton
              endpoint="/api/export/purchases"
              from={dateRange.from}
              to={dateRange.to}
            />
            <Link href="/dashboard/purchases/new" className="btn btn-primary">
              <Plus /> New purchase
            </Link>
          </>
        }
      />

      {/* Date Range Filter */}
      <div className="card px-4 py-3">
        <DateRangeFilter />
      </div>

      <div className="card overflow-hidden">
        <SearchForm placeholder="Search invoice no. or supplier">
          <span className="text-[12.5px] text-ink-500">
            {formatNumber(purchases.length)} invoices ·{" "}
            <span className="font-medium text-ink-900 num">{formatINR(total)}</span>
          </span>
        </SearchForm>

        {purchases.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Supplier invoice</th>
                  <th>Date</th>
                  <th>Supplier</th>
                  <th className="text-right">Taxable</th>
                  <th className="text-right">GST</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map(({ purchase, supplier }) => (
                  <tr key={purchase.id} className="hover:bg-ink-50/70 transition-colors">
                    <td>
                      <Link
                        href={`/dashboard/purchases/${purchase.id}`}
                        className="font-mono text-[12.5px] font-bold text-brand-700 hover:text-brand-900 hover:underline"
                      >
                        {purchase.supplierInvoiceNo}
                      </Link>
                      <div className="cell-sub font-mono">{purchase.purchaseNo}</div>
                    </td>
                    <td className="text-ink-600 num whitespace-nowrap">
                      {format(new Date(purchase.invoiceDate), "d MMM yyyy")}
                    </td>
                    <td className="cell-primary">{supplier.name}</td>
                    <td className="text-right num text-ink-600">{formatINR(purchase.taxableAmount)}</td>
                    <td className="text-right num text-ink-600">
                      {formatINR((purchase.cgst ?? 0) + (purchase.sgst ?? 0) + (purchase.igst ?? 0))}
                    </td>
                    <td className="text-right num font-medium text-ink-900">{formatINR(purchase.totalAmount)}</td>
                    <td className="text-right">
                      <span className="badge badge-success badge-dot">Posted</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={FileInput}
            title="No purchases recorded"
            description="Post your first supplier invoice to add stock and create the payable automatically."
            action={
              <Link href="/dashboard/purchases/new" className="btn btn-primary btn-sm">
                <Plus /> New purchase
              </Link>
            }
          />
        )}
      </div>
    </div>
  );
}
