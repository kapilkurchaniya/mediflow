import { requirePagePermission } from "@/server/rbac";
import { PageHeader, StatCard } from "@/app/components/ui";
import { getReportStoresListAction } from "@/app/actions/reports";
import { formatINR } from "@/lib/format";
import { format } from "date-fns";
import {
  getReceivablesAgeingReport,
  reconcileReceivablesWithControlAccount,
  type AgeingMode,
  type ReceivablesAgeingFilter,
  type ReportStoreScope,
} from "@/server/domain/receivables";
import { resolveStoreScope } from "@/server/domain/accounting-reports/balances";
import { ReceivablesTable } from "./_components/ReceivablesTable";
import { ReceivablesFilterBar } from "./_components/ReceivablesFilterBar";
import {
  Users,
  CheckCircle2,
  AlertTriangle,
  Clock,
  AlertCircle,
  FileSpreadsheet,
} from "lucide-react";

export const metadata = {
  title: "Receivables & Credit Control | MediFlow Accounting",
  description: "Customer credit limits, invoice-level ageing, and debt collection management.",
};

export default async function ReceivablesPage({
  searchParams,
}: {
  searchParams: Promise<{
    asOf?: string;
    mode?: string;
    store?: string;
    search?: string;
    overdue?: string;
    page?: string;
  }>;
}) {
  const ctx = await requirePagePermission("accounting.view");
  const params = await searchParams;

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const asOfDate = params.asOf || todayStr;
  const mode = (params.mode === "invoice_date" ? "invoice_date" : "due_date") as AgeingMode;
  const search = params.search || "";
  const onlyOverdue = params.overdue === "true";
  const currentPage = Math.max(1, parseInt(params.page || "1", 10));

  const canViewAll = ctx.permissions.has("report.all_stores") || ctx.allowedStoreIds === "all";

  // Resolve Store Scope
  let requestedStoreScope: ReportStoreScope;
  if (params.store === "all" && canViewAll) {
    requestedStoreScope = { type: "all" };
  } else if (params.store) {
    requestedStoreScope = { type: "store", storeId: params.store };
  } else {
    requestedStoreScope = { type: "store", storeId: ctx.storeId };
  }

  const storeScope = resolveStoreScope(ctx, requestedStoreScope);
  const pageSize = 50;
  const offset = (currentPage - 1) * pageSize;

  const filter: ReceivablesAgeingFilter = {
    asOfDate,
    mode,
    storeScope,
    search: search || undefined,
    onlyOverdue,
    limit: pageSize,
    offset,
  };

  const [report, stores, recon] = await Promise.all([
    getReceivablesAgeingReport(ctx.tenantId, filter),
    getReportStoresListAction(),
    reconcileReceivablesWithControlAccount(ctx.tenantId, storeScope, asOfDate),
  ]);

  const currentStoreId =
    storeScope.type === "all"
      ? "all"
      : storeScope.type === "store"
      ? storeScope.storeId
      : ctx.storeId;

  return (
    <div className="page space-y-6">
      <PageHeader
        eyebrow="Credit Risk & Working Capital"
        title="Receivables & Credit Control"
        description={`Customer outstanding dues, credit limits, and ${
          mode === "due_date" ? "overdue ageing" : "bill age"
        } as of ${asOfDate}.`}
      />

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard
          label="Net Receivables"
          value={formatINR(report.totalNetExposure)}
          footnote={`${report.totalCustomers} customer(s)`}
          icon={Users}
          tone="brand"
        />
        <StatCard
          label="Current / Not Due"
          value={formatINR(report.summaryBuckets.current)}
          footnote="Within credit terms"
          icon={CheckCircle2}
          tone="info"
        />
        <StatCard
          label="1–30 Days Overdue"
          value={formatINR(report.summaryBuckets.days1to30)}
          footnote="Early collection"
          icon={Clock}
          tone="warning"
        />
        <StatCard
          label="31–60 Days Overdue"
          value={formatINR(report.summaryBuckets.days31to60)}
          footnote="Follow-up required"
          icon={Clock}
          tone="warning"
        />
        <StatCard
          label="61–90 Days Overdue"
          value={formatINR(report.summaryBuckets.days61to90)}
          footnote="Credit hold zone"
          icon={AlertTriangle}
          tone="danger"
        />
        <StatCard
          label="90+ Days Overdue"
          value={formatINR(report.summaryBuckets.over90)}
          footnote="High default risk"
          icon={AlertCircle}
          tone="danger"
        />
      </div>

      {/* Control Account Parity Banner */}
      <div
        className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
          recon.isReconciled
            ? "bg-emerald-50/70 border-emerald-200 text-emerald-800"
            : "bg-amber-50/80 border-amber-200 text-amber-900"
        }`}
      >
        <div className="flex items-center gap-2">
          {recon.isReconciled ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          )}
          <span>
            <strong>Debtors Control Account (1050) Parity:</strong> Subledger Net Receivables:{" "}
            {formatINR(recon.netSubledgerReceivables)} | Control Account Balance:{" "}
            {formatINR(recon.debtorsControlAccountBalance)}
            {!recon.isReconciled && (
              <span className="font-semibold text-rose-600 ml-1">
                (Variance: {formatINR(recon.variance)})
              </span>
            )}
          </span>
        </div>
        <div className="text-[11px] text-neutral-500 flex items-center gap-1 font-mono">
          <FileSpreadsheet className="w-3.5 h-3.5" />
          Single Source of Truth
        </div>
      </div>

      {/* Filter Toolbar */}
      <ReceivablesFilterBar
        asOfDate={asOfDate}
        mode={mode}
        currentStore={currentStoreId}
        search={search}
        onlyOverdue={onlyOverdue}
        stores={stores}
        canViewAll={canViewAll}
      />

      {/* Receivables Table */}
      <ReceivablesTable customers={report.customers} />
    </div>
  );
}
