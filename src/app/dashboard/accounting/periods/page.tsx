import { requirePagePermission } from "@/server/rbac";
import { PageHeader, StatCard } from "@/app/components/ui";
import { db } from "@/server/db";
import {
  getCurrentIndianFY,
  listAccountingPeriods,
  getDistinctGSTINs,
} from "@/server/domain/accounting-periods";
import { PeriodsTable } from "./_components/PeriodsTable";
import { Lock, Unlock, Calendar, ShieldCheck } from "lucide-react";

export const metadata = {
  title: "Accounting Period Lock | MediFlow",
  description: "Monthly accounting period closing, balance lock, and audit history.",
};

export default async function AccountingPeriodsPage({
  searchParams,
}: {
  searchParams: Promise<{ fy?: string }>;
}) {
  const ctx = await requirePagePermission("accounting.view");
  const params = await searchParams;

  const currentFY = getCurrentIndianFY();
  const selectedFY = params.fy || currentFY;

  const periods = await listAccountingPeriods(db, ctx.tenantId, {
    financialYear: selectedFY,
  });

  const distinctGstins = await getDistinctGSTINs(db, ctx.tenantId);

  const totalCount = periods.length;
  const lockedCount = periods.filter((p) => p.status === "locked").length;
  const openCount = periods.filter((p) => p.status === "open").length;

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Accounting Period Lock"
        description={`Manage monthly closing periods and prevent unauthorized modifications to finalized books for Indian Financial Year ${selectedFY}.`}
      />

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Active Financial Year"
          value={selectedFY}
          icon={Calendar}
          tone="neutral"
        />
        <StatCard
          label="Total Periods"
          value={totalCount}
          icon={ShieldCheck}
          tone="neutral"
        />
        <StatCard
          label="Locked Periods"
          value={lockedCount}
          icon={Lock}
          tone="warning"
        />
        <StatCard
          label="Open Periods"
          value={openCount}
          icon={Unlock}
          tone="brand"
        />
      </div>

      {/* Periods Table */}
      <PeriodsTable
        initialPeriods={periods}
        distinctGstins={distinctGstins}
        currentFY={selectedFY}
      />
    </div>
  );
}
