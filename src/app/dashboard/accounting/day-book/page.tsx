import { requirePagePermission } from "@/server/rbac";
import { PageHeader, StatCard } from "@/app/components/ui";
import { DateRangeFilter } from "@/app/components/DateRangeFilter";
import { resolveDateRange } from "@/lib/date-range";
import { getReportStoresListAction } from "@/app/actions/reports";
import { formatINR } from "@/lib/format";
import { format } from "date-fns";
import {
  getDayBookReport,
  resolveStoreScope,
  type DayBookFilter,
  type ReportStoreScope,
  type VoucherTypeFilter,
} from "@/server/domain/accounting-reports";
import { DayBookTable } from "./_components/DayBookTable";
import { PrintWatermark } from "@/app/components/PrintWatermark";
import { BookOpen, CheckCircle2, AlertTriangle, ArrowDownLeft, ArrowUpRight } from "lucide-react";

export const metadata = {
  title: "Day Book | MediFlow Accounting",
  description: "Chronological double-entry journal register across all transactions.",
};

export default async function DayBookPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    range?: string;
    store?: string;
    type?: string;
    page?: string;
  }>;
}) {
  const ctx = await requirePagePermission("accounting.view");
  const params = await searchParams;

  const dateRange = resolveDateRange({
    range: params.range ?? "today",
    from: params.from,
    to: params.to,
  });

  const canViewAll = ctx.permissions.has("report.all_stores") || ctx.allowedStoreIds === "all";

  // Resolve Store Scope
  let requestedStoreScope: ReportStoreScope;
  if (params.store === "all" && canViewAll) {
    requestedStoreScope = { type: "all" };
  } else if (params.store === "unallocated" && canViewAll) {
    requestedStoreScope = { type: "unallocated" };
  } else if (params.store) {
    requestedStoreScope = { type: "store", storeId: params.store };
  } else {
    requestedStoreScope = { type: "store", storeId: ctx.storeId };
  }

  const storeScope = resolveStoreScope(ctx, requestedStoreScope);
  const voucherType = (params.type as VoucherTypeFilter) || "all";
  const currentPage = Math.max(1, parseInt(params.page || "1", 10));
  const pageSize = 50;
  const offset = (currentPage - 1) * pageSize;

  const filter: DayBookFilter = {
    dateRange: { from: dateRange.from, to: dateRange.to },
    storeScope,
    voucherType,
    limit: pageSize,
    offset,
  };

  const [report, stores] = await Promise.all([
    getDayBookReport(ctx.tenantId, filter),
    getReportStoresListAction(),
  ]);

  const periodLabel = dateRange.from && dateRange.to
    ? `${format(new Date(dateRange.from), "d MMM yyyy")} – ${format(new Date(dateRange.to), "d MMM yyyy")}`
    : "All Time";

  return (
    <div className="page space-y-6">
      <PrintWatermark />
      <PageHeader
        eyebrow="Financial Registers"
        title="Day Book"
        description={`Chronological posted journal register for ${periodLabel}.`}
      />

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Vouchers"
          value={report.totalVouchers.toLocaleString("en-IN")}
          footnote="Distinct posted journal entries"
          icon={BookOpen}
        />
        <StatCard
          label="Total Debits"
          value={formatINR(report.totalDebit)}
          footnote="Period debit movements"
          icon={ArrowDownLeft}
          tone="brand"
        />
        <StatCard
          label="Total Credits"
          value={formatINR(report.totalCredit)}
          footnote="Period credit movements"
          icon={ArrowUpRight}
          tone="info"
        />
        <StatCard
          label="Balancing Status"
          value={report.isBalanced ? "Balanced" : "Out of Balance"}
          footnote={report.isBalanced ? "Total Dr = Total Cr" : "Variance detected"}
          icon={report.isBalanced ? CheckCircle2 : AlertTriangle}
          tone={report.isBalanced ? "brand" : "danger"}
        />
      </div>

      {/* Filter Toolbar */}
      <div className="card bg-white border border-slate-200 p-4 shadow-xs">
        <form method="GET" className="flex flex-wrap items-center gap-3">
          <DateRangeFilter defaultRange="today" />

          {/* Store Selector */}
          {canViewAll && (
            <div className="form-control">
              <label className="label py-1 text-xs font-medium text-slate-600">Store Scope</label>
              <select
                name="store"
                defaultValue={
                  storeScope.type === "all"
                    ? "all"
                    : storeScope.type === "unallocated"
                      ? "unallocated"
                      : storeScope.storeId
                }
                className="select select-sm select-bordered text-xs"
              >
                <option value="all">Consolidated (All Stores)</option>
                <option value="unallocated">Unallocated / Tenant-Wide</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Voucher Type Selector */}
          <div className="form-control">
            <label className="label py-1 text-xs font-medium text-slate-600">Voucher Type</label>
            <select
              name="type"
              defaultValue={voucherType}
              className="select select-sm select-bordered text-xs"
            >
              <option value="all">All Vouchers</option>
              <option value="sale">Sales Invoices</option>
              <option value="sale_return">Sale Returns</option>
              <option value="purchase">Purchase Invoices</option>
              <option value="purchase_return">Purchase Returns</option>
              <option value="expense">Operating Expenses</option>
              <option value="payment">Payments</option>
              <option value="receipt">Receipts</option>
              <option value="journal">Manual Journals</option>
            </select>
          </div>

          <div className="flex items-end self-end pt-5">
            <button type="submit" className="btn btn-sm btn-primary">
              Filter
            </button>
          </div>
        </form>
      </div>

      {/* Day Book Table View */}
      <DayBookTable
        entries={report.entries}
        totalVouchers={report.totalVouchers}
        currentPage={currentPage}
        pageSize={pageSize}
        filter={filter}
      />
    </div>
  );
}
