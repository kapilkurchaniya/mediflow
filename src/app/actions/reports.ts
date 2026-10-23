"use server";

import { requirePermission } from "@/server/rbac";
import {
  generateTrialBalance,
  generateProfitAndLoss,
  generateBalanceSheet,
  generateCashFlow,
  generateOutstanding,
  generateInventoryAnalytics,
  generateExpiryReport,
  TrialBalanceReport,
  ProfitAndLossReport,
  BalanceSheetReport,
  CashFlowReport,
  OutstandingReport,
  InventoryMovementReport,
  ExpiryExposureReport,
} from "@/server/domain/reports";

export async function getTrialBalanceReport(
  from?: string | null,
  to?: string | null
): Promise<TrialBalanceReport> {
  const ctx = await requirePermission("report.view");
  return generateTrialBalance(ctx.tenantId, ctx.storeId, { from, to });
}

export async function getProfitAndLossReport(
  from?: string | null,
  to?: string | null
): Promise<ProfitAndLossReport> {
  const ctx = await requirePermission("report.view");
  return generateProfitAndLoss(ctx.tenantId, ctx.storeId, { from, to });
}

export async function getBalanceSheetReport(
  asOf?: string | null
): Promise<BalanceSheetReport> {
  const ctx = await requirePermission("report.view");
  return generateBalanceSheet(ctx.tenantId, ctx.storeId, asOf || undefined);
}

export async function getCashFlowReport(
  from?: string | null,
  to?: string | null
): Promise<CashFlowReport> {
  const ctx = await requirePermission("report.view");
  return generateCashFlow(ctx.tenantId, ctx.storeId, { from, to });
}

export async function getOutstandingReport(
  type: "receivable" | "payable"
): Promise<OutstandingReport> {
  const ctx = await requirePermission("report.view");
  return generateOutstanding(ctx.tenantId, ctx.storeId, type);
}

export async function getInventoryMovementReport(
  from?: string | null,
  to?: string | null
): Promise<InventoryMovementReport> {
  const ctx = await requirePermission("report.view");
  return generateInventoryAnalytics(ctx.tenantId, ctx.storeId, { from, to });
}

export async function getExpiryAnalysisReport(): Promise<ExpiryExposureReport> {
  const ctx = await requirePermission("report.view");
  return generateExpiryReport(ctx.tenantId, ctx.storeId);
}
