"use server";

import { db, schema } from "@/server/db";
import { requirePermission } from "@/server/rbac";
import { and, eq } from "drizzle-orm";
import {
  getDayBookReport,
  getAccountLedgerReport,
  getPartyControlReconciliation,
  generateDayBookCsv,
  generateLedgerCsv,
  getNormalBalanceSide,
  resolveStoreScope,
  type AccountInfo,
  type AccountType,
  type DayBookFilter,
  type DayBookReport,
  type LedgerFilter,
  type LedgerReport,
  type ReconciliationReport,
  type ReportStoreScope,
} from "@/server/domain/accounting-reports";

export async function getAccountsListAction(): Promise<AccountInfo[]> {
  const ctx = await requirePermission("accounting.view");

  const rows = await db
    .select()
    .from(schema.accounts)
    .where(and(eq(schema.accounts.tenantId, ctx.tenantId), eq(schema.accounts.isActive, true)))
    .orderBy(schema.accounts.code);

  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    type: r.type as AccountType,
    normalSide: getNormalBalanceSide(r.type as AccountType),
    systemKey: r.systemKey,
    isActive: r.isActive,
  }));
}

export async function getDayBookAction(filter: DayBookFilter): Promise<DayBookReport> {
  const ctx = await requirePermission("accounting.view");
  const storeScope = resolveStoreScope(ctx, filter.storeScope);
  return getDayBookReport(ctx.tenantId, { ...filter, storeScope });
}

export async function getAccountLedgerAction(filter: LedgerFilter): Promise<LedgerReport> {
  const ctx = await requirePermission("accounting.view");
  const storeScope = resolveStoreScope(ctx, filter.storeScope);
  return getAccountLedgerReport(ctx.tenantId, { ...filter, storeScope });
}

export async function getPartyControlReconciliationAction(
  partyType: "customer" | "supplier",
  storeScope: ReportStoreScope,
  partyId?: string | null,
): Promise<ReconciliationReport> {
  const ctx = await requirePermission("accounting.view");
  const resolvedScope = resolveStoreScope(ctx, storeScope);
  return getPartyControlReconciliation(ctx.tenantId, partyType, resolvedScope, partyId);
}

export async function exportDayBookCsvAction(filter: DayBookFilter): Promise<string> {
  const ctx = await requirePermission("report.export");
  const storeScope = resolveStoreScope(ctx, filter.storeScope);
  return generateDayBookCsv(ctx.tenantId, { ...filter, storeScope });
}

export async function exportLedgerCsvAction(filter: LedgerFilter): Promise<string> {
  const ctx = await requirePermission("report.export");
  const storeScope = resolveStoreScope(ctx, filter.storeScope);
  return generateLedgerCsv(ctx.tenantId, { ...filter, storeScope });
}
