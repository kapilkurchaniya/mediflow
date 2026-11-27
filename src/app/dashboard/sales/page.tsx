import { getSales } from "@/app/actions/sales";
import { Plus, Receipt, RotateCcw, Banknote, ArrowLeftRight, Building2 } from "lucide-react";
import Link from "next/link";
import { PageHeader, SearchForm, EmptyState } from "@/app/components/ui";
import { formatINR, formatNumber } from "@/lib/format";
import { DateRangeFilter } from "@/app/components/DateRangeFilter";
import { ExportButton } from "@/app/components/ExportButton";
import { resolveDateRange } from "@/lib/date-range";
import { requirePagePermission } from "@/server/rbac";
import { getCachedTenantStores } from "@/server/domain/stores/cached";
import { SalesTableClient } from "./SalesTableClient";

export const metadata = { title: "Sales & invoices" };

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; range?: string; from?: string; to?: string }>;
}) {
  const ctx = await requirePagePermission("sale.view");
  const params = await searchParams;
  const dateRange = resolveDateRange({
    range: params.range,
    from: params.from,
    to: params.to,
  });

  const [sales, tenantStores] = await Promise.all([
    getSales(dateRange.from, dateRange.to, params.q),
    getCachedTenantStores(ctx.tenantId),
  ]);

  const store = tenantStores.find((s) => s.id === ctx.storeId);
  const isWarehouse = store?.kind === "warehouse";
  const activeSales = sales.filter(({ sale }) => sale.status !== "cancelled");
  const total = activeSales.reduce((a, { sale }) => a + (sale.totalAmount ?? 0), 0);
  const outstanding = activeSales.reduce((a, { sale }) => a + Math.max(sale.creditAmount ?? 0, 0), 0);

  return (
    <div className="page space-y-6">
      <PageHeader
        title="Sales & invoices"
        description="Every bill raised from this store, with payment status."
        actions={
          isWarehouse ? (
            <>
              <ExportButton
                endpoint="/api/export/sales"
                from={dateRange.from}
                to={dateRange.to}
              />
              <Link href="/dashboard/inventory/transfers" className="btn btn-primary">
                <ArrowLeftRight className="h-4 w-4 mr-1" /> Stock transfers
              </Link>
            </>
          ) : (
            <>
              <Link href="/dashboard/customers/credit" className="btn btn-secondary">
                Udhaar &amp; Dues
              </Link>
              <Link href="/dashboard/sales/register" className="btn btn-secondary">
                <Banknote className="h-4 w-4 mr-1 text-emerald-600" /> Cash register
              </Link>
              <Link href="/dashboard/sales/returns" className="btn btn-secondary">
                <RotateCcw className="h-4 w-4 mr-1 text-amber-600" /> Credit notes
              </Link>
              <ExportButton
                endpoint="/api/export/sales"
                from={dateRange.from}
                to={dateRange.to}
              />
              <Link href="/dashboard/sales/pos" className="btn btn-primary">
                <Plus /> New bill
              </Link>
            </>
          )
        }
      />

      {isWarehouse && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-xs text-amber-800 flex items-start gap-3">
          <Building2 className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-900">Warehouse Mode Active</p>
            <p className="mt-0.5 text-amber-700">
              This facility is a central warehouse. Retail counter billing is handled by retail branch counters. Use Stock Transfers to allocate inventory to branches.
            </p>
          </div>
        </div>
      )}

      {/* Date Range Filter */}
      <div className="card px-4 py-3">
        <DateRangeFilter />
      </div>

      <div className="card overflow-hidden">
        <SearchForm placeholder="Search invoice no. or customer" defaultValue={params.q ?? ""}>
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
          <SalesTableClient rows={sales} />
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
