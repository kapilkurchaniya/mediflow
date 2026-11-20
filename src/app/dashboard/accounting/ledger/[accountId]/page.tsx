import { requirePagePermission } from "@/server/rbac";
import { PageHeader, StatCard } from "@/app/components/ui";
import { resolveDateRange } from "@/lib/date-range";
import { getReportStoresListAction } from "@/app/actions/reports";
import { formatINR } from "@/lib/format";
import { format } from "date-fns";
import { db, schema } from "@/server/db";
import { eq } from "drizzle-orm";
import {
  getAccountLedgerReport,
  getPartyControlReconciliation,
  resolveStoreScope,
  type LedgerFilter,
  type ReportStoreScope,
} from "@/server/domain/accounting-reports";
import { getAccountsListAction } from "@/app/actions/accounting-reports";
import { LedgerFilterBar } from "../_components/LedgerFilterBar";
import { LedgerTable } from "../_components/LedgerTable";
import { ReconciliationCard } from "../_components/ReconciliationCard";
import { PrintWatermark } from "@/app/components/PrintWatermark";
import { Scale, ArrowDownLeft, ArrowUpRight, Landmark } from "lucide-react";

export const metadata = {
  title: "Account Ledger | MediFlow Accounting",
  description: "Account-wise chronological transaction movements and running balances.",
};

export default async function AccountLedgerPage({
  params,
  searchParams,
}: {
  params: Promise<{ accountId: string }>;
  searchParams: Promise<{
    from?: string;
    to?: string;
    range?: string;
    store?: string;
    partyId?: string;
  }>;
}) {
  const ctx = await requirePagePermission("accounting.view");
  const { accountId } = await params;
  const sParams = await searchParams;

  const dateRange = resolveDateRange({
    range: sParams.range ?? "month",
    from: sParams.from,
    to: sParams.to,
  });

  const canViewAll = ctx.permissions.has("report.all_stores") || ctx.allowedStoreIds === "all";

  // Resolve Store Scope
  let requestedStoreScope: ReportStoreScope;
  if (sParams.store === "all" && canViewAll) {
    requestedStoreScope = { type: "all" };
  } else if (sParams.store === "unallocated" && canViewAll) {
    requestedStoreScope = { type: "unallocated" };
  } else if (sParams.store) {
    requestedStoreScope = { type: "store", storeId: sParams.store };
  } else {
    requestedStoreScope = { type: "store", storeId: ctx.storeId };
  }

  const storeScope = resolveStoreScope(ctx, requestedStoreScope);
  const accounts = await getAccountsListAction();
  const currentAccount = accounts.find((a) => a.id === accountId);

  if (!currentAccount) {
    throw new Error(`Account not found: ${accountId}`);
  }

  // Detect Control Account
  const isDebtors = currentAccount.systemKey === "debtors" || currentAccount.code === "1050";
  const isCreditors = currentAccount.systemKey === "creditors" || currentAccount.code === "2010";
  const isControlAccount = isDebtors || isCreditors;
  const partyType = isDebtors ? "customer" : isCreditors ? "supplier" : null;

  // Fetch party options and reconciliation if applicable
  let parties: { id: string; name: string }[] = [];
  let reconciliation = null;

  if (isControlAccount && partyType) {
    if (partyType === "customer") {
      parties = await db
        .select({ id: schema.customers.id, name: schema.customers.name })
        .from(schema.customers)
        .where(eq(schema.customers.tenantId, ctx.tenantId))
        .orderBy(schema.customers.name);
    } else {
      parties = await db
        .select({ id: schema.suppliers.id, name: schema.suppliers.name })
        .from(schema.suppliers)
        .where(eq(schema.suppliers.tenantId, ctx.tenantId))
        .orderBy(schema.suppliers.name);
    }

    reconciliation = await getPartyControlReconciliation(
      ctx.tenantId,
      partyType,
      storeScope,
      sParams.partyId || null,
    );
  }

  const ledgerFilter: LedgerFilter = {
    accountId,
    dateRange: { from: dateRange.from, to: dateRange.to },
    storeScope,
    partyType,
    partyId: sParams.partyId || null,
    limit: 50,
  };

  const [report, stores] = await Promise.all([
    getAccountLedgerReport(ctx.tenantId, ledgerFilter),
    getReportStoresListAction(),
  ]);

  const periodLabel = dateRange.from && dateRange.to
    ? `${format(new Date(dateRange.from), "d MMM yyyy")} – ${format(new Date(dateRange.to), "d MMM yyyy")}`
    : "All Time";

  return (
    <div className="page space-y-6">
      <PrintWatermark />
      <PageHeader
        eyebrow={`Ledger Account • ${currentAccount.type.toUpperCase()}`}
        title={`${currentAccount.code} — ${currentAccount.name}`}
        description={`Transaction movements and continuous running balance for ${periodLabel}.`}
      />

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Opening Balance"
          value={`${formatINR(report.periodOpeningBalance)} ${report.periodOpeningSide.toUpperCase()}`}
          footnote="Position before period"
          icon={Landmark}
        />
        <StatCard
          label="Total Debits"
          value={formatINR(report.periodDebitTotal)}
          footnote="Period debit movements"
          icon={ArrowDownLeft}
          tone="brand"
        />
        <StatCard
          label="Total Credits"
          value={formatINR(report.periodCreditTotal)}
          footnote="Period credit movements"
          icon={ArrowUpRight}
          tone="info"
        />
        <StatCard
          label="Closing Balance"
          value={`${formatINR(report.periodClosingBalance)} ${report.periodClosingSide.toUpperCase()}`}
          footnote="Current net position"
          icon={Scale}
        />
      </div>

      {/* Control Account Reconciliation Banner */}
      {reconciliation && <ReconciliationCard reconciliation={reconciliation} />}

      {/* Filter Toolbar */}
      <LedgerFilterBar
        accounts={accounts}
        currentAccountId={accountId}
        stores={stores}
        canViewAll={canViewAll}
        storeScope={storeScope}
        isControlAccount={isControlAccount}
        partyType={partyType}
        parties={parties}
        currentPartyId={sParams.partyId}
        filter={ledgerFilter}
      />

      {/* Ledger Table */}
      <LedgerTable report={report} />
    </div>
  );
}
