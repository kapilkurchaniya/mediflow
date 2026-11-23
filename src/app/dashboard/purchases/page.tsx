import { getPurchases } from "@/app/actions/purchases";
import { Plus, FileInput, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { PageHeader, SearchForm, EmptyState } from "@/app/components/ui";
import { formatINR, formatNumber } from "@/lib/format";
import { DateRangeFilter } from "@/app/components/DateRangeFilter";
import { ExportButton } from "@/app/components/ExportButton";
import { resolveDateRange } from "@/lib/date-range";
import { requirePagePermission, can } from "@/server/rbac";
import { PurchasesDropWrapper } from "./_components/PurchasesDropWrapper";
import { RegisterPendingSupplierButton } from "@/app/components/QuickRegisterSupplierModal";

export const metadata = { title: "Purchases" };

export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; range?: string; from?: string; to?: string }>;
}) {
  const ctx = await requirePagePermission("purchase.view");
  const canCreate = can(ctx, "purchase.create");
  const params = await searchParams;
  const dateRange = resolveDateRange({
    range: params.range,
    from: params.from,
    to: params.to,
  });

  const purchases = await getPurchases(dateRange.from, dateRange.to);
  const total = purchases.reduce((a, { purchase }) => a + (purchase.totalAmount ?? 0), 0);
  const pendingSupplierRows = purchases.filter(({ purchase }) => Boolean(purchase.pendingSupplierMeta));

  return (
    <PurchasesDropWrapper canCreate={canCreate}>
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
              {canCreate && (
                <Link href="/dashboard/purchases/new" className="btn btn-primary">
                  <Plus /> New purchase
                </Link>
              )}
            </>
          }
        />

        {pendingSupplierRows.length > 0 && (
          <div className="rounded-xl border border-amber-300 bg-amber-50/90 p-4 text-amber-950 space-y-2.5">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1 flex-1">
                <p className="text-sm font-bold">
                  {pendingSupplierRows.length} imported GRN invoice{pendingSupplierRows.length > 1 ? "s have" : " has"} an unregistered supplier
                </p>
                <p className="text-xs text-amber-900">
                  Stock has been added, but you must register and link the supplier below to complete payables and GST ITC records.
                </p>
              </div>
            </div>
            <div className="space-y-1.5 pl-7">
              {pendingSupplierRows.map(({ purchase }) => (
                <div
                  key={purchase.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/80 border border-amber-200 px-3 py-2 text-xs"
                >
                  <div>
                    <Link
                      href={`/dashboard/purchases/${purchase.id}`}
                      className="font-mono font-bold text-brand-700 hover:underline"
                    >
                      {purchase.supplierInvoiceNo}
                    </Link>{" "}
                    <span className="text-ink-500">({purchase.purchaseNo})</span> —{" "}
                    <span className="font-semibold text-ink-900">
                      {purchase.pendingSupplierMeta!.name}
                    </span>
                    {purchase.pendingSupplierMeta!.gstin && (
                      <span className="ml-1.5 font-mono text-ink-500">
                        GSTIN: {purchase.pendingSupplierMeta!.gstin}
                      </span>
                    )}
                  </div>
                  <RegisterPendingSupplierButton
                    meta={purchase.pendingSupplierMeta!}
                    purchaseId={purchase.id}
                    label="Register Supplier (Pre-filled)"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

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
                    <td className="cell-primary">
                      {purchase.pendingSupplierMeta ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-amber-900">
                            {purchase.pendingSupplierMeta.name}
                          </span>
                          <span className="badge badge-warning !text-[10px]">
                            Unregistered Supplier
                          </span>
                          <RegisterPendingSupplierButton
                            meta={purchase.pendingSupplierMeta}
                            purchaseId={purchase.id}
                            label="Add Supplier"
                          />
                        </div>
                      ) : (
                        supplier.name
                      )}
                    </td>
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
              canCreate ? (
                <Link href="/dashboard/purchases/new" className="btn btn-primary btn-sm">
                  <Plus /> New purchase
                </Link>
              ) : undefined
            }
          />
        )}
      </div>
    </div>
    </PurchasesDropWrapper>
  );
}
