"use server";

import { requirePermission } from "@/server/rbac";
import { db, schema } from "@/server/db";
import { eq, and } from "drizzle-orm";
import type { AuthCtx } from "@/server/rbac";
import {
  generateTrialBalance,
  generateProfitAndLoss,
  generateBalanceSheet,
  generateCashFlow,
  generateOutstanding,
  generateInventoryAnalytics,
  generateExpiryReport,
  generateChainOverviewReport,
  TrialBalanceReport,
  ProfitAndLossReport,
  BalanceSheetReport,
  CashFlowReport,
  OutstandingReport,
  InventoryMovementReport,
  ExpiryExposureReport,
  ChainOverviewReport,
  StoreScope,
  DateRangeFilter,
} from "@/server/domain/reports";

function resolveStoreScope(ctx: AuthCtx, requestedScope?: StoreScope): StoreScope {
  const canViewAll = ctx.permissions.has("report.all_stores") || ctx.allowedStoreIds === "all";
  if (!canViewAll) {
    return ctx.storeId;
  }
  return requestedScope || "all";
}

export async function getReportStoresListAction() {
  const ctx = await requirePermission("report.view");
  const canViewAll = ctx.permissions.has("report.all_stores") || ctx.allowedStoreIds === "all";
  if (!canViewAll) {
    const storeList = await db
      .select({
        id: schema.stores.id,
        name: schema.stores.name,
        code: schema.stores.code,
        city: schema.stores.city,
      })
      .from(schema.stores)
      .where(and(eq(schema.stores.id, ctx.storeId), eq(schema.stores.tenantId, ctx.tenantId)));
    return storeList;
  }
  return db
    .select({
      id: schema.stores.id,
      name: schema.stores.name,
      code: schema.stores.code,
      city: schema.stores.city,
    })
    .from(schema.stores)
    .where(and(eq(schema.stores.tenantId, ctx.tenantId), eq(schema.stores.isActive, true)))
    .orderBy(schema.stores.name);
}

export async function getChainOverviewReportAction(
  storeScope?: StoreScope,
  dateRange?: DateRangeFilter
): Promise<ChainOverviewReport> {
  const ctx = await requirePermission("report.view");
  const scope = resolveStoreScope(ctx, storeScope);
  return generateChainOverviewReport(ctx.tenantId, scope, dateRange);
}

export async function getTrialBalanceReport(
  from?: string | null,
  to?: string | null,
  storeScope?: StoreScope
): Promise<TrialBalanceReport> {
  const ctx = await requirePermission("report.view");
  const scope = resolveStoreScope(ctx, storeScope);
  return generateTrialBalance(ctx.tenantId, scope, { from, to });
}

export async function getProfitAndLossReport(
  from?: string | null,
  to?: string | null,
  storeScope?: StoreScope
): Promise<ProfitAndLossReport> {
  const ctx = await requirePermission("report.view");
  const scope = resolveStoreScope(ctx, storeScope);
  return generateProfitAndLoss(ctx.tenantId, scope, { from, to });
}

export async function getBalanceSheetReport(
  asOf?: string | null,
  storeScope?: StoreScope
): Promise<BalanceSheetReport> {
  const ctx = await requirePermission("report.view");
  const scope = resolveStoreScope(ctx, storeScope);
  return generateBalanceSheet(ctx.tenantId, scope, asOf || undefined);
}

export async function getCashFlowReport(
  from?: string | null,
  to?: string | null,
  storeScope?: StoreScope
): Promise<CashFlowReport> {
  const ctx = await requirePermission("report.view");
  const scope = resolveStoreScope(ctx, storeScope);
  return generateCashFlow(ctx.tenantId, scope, { from, to });
}

export async function getOutstandingReport(
  type: "receivable" | "payable",
  storeScope?: StoreScope
): Promise<OutstandingReport> {
  const ctx = await requirePermission("report.view");
  const scope = resolveStoreScope(ctx, storeScope);
  return generateOutstanding(ctx.tenantId, scope, type);
}

export async function getInventoryMovementReport(
  from?: string | null,
  to?: string | null,
  storeScope?: StoreScope
): Promise<InventoryMovementReport> {
  const ctx = await requirePermission("report.view");
  const scope = resolveStoreScope(ctx, storeScope);
  return generateInventoryAnalytics(ctx.tenantId, scope, { from, to });
}

export async function getExpiryAnalysisReport(storeScope?: StoreScope): Promise<ExpiryExposureReport> {
  const ctx = await requirePermission("report.view");
  const scope = resolveStoreScope(ctx, storeScope);
  return generateExpiryReport(ctx.tenantId, scope);
}
