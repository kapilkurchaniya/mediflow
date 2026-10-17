"use server";

import { requireAuth } from "@/server/auth";
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
  const { session } = await requireAuth();
  return generateTrialBalance(session.tenantId, session.storeId, { from, to });
}

export async function getProfitAndLossReport(
  from?: string | null,
  to?: string | null
): Promise<ProfitAndLossReport> {
  const { session } = await requireAuth();
  return generateProfitAndLoss(session.tenantId, session.storeId, { from, to });
}

export async function getBalanceSheetReport(
  asOf?: string | null
): Promise<BalanceSheetReport> {
  const { session } = await requireAuth();
  return generateBalanceSheet(session.tenantId, session.storeId, asOf || undefined);
}

export async function getCashFlowReport(
  from?: string | null,
  to?: string | null
): Promise<CashFlowReport> {
  const { session } = await requireAuth();
  return generateCashFlow(session.tenantId, session.storeId, { from, to });
}

export async function getOutstandingReport(
  type: "receivable" | "payable"
): Promise<OutstandingReport> {
  const { session } = await requireAuth();
  return generateOutstanding(session.tenantId, session.storeId, type);
}

export async function getInventoryMovementReport(
  from?: string | null,
  to?: string | null
): Promise<InventoryMovementReport> {
  const { session } = await requireAuth();
  return generateInventoryAnalytics(session.tenantId, session.storeId, { from, to });
}

export async function getExpiryAnalysisReport(): Promise<ExpiryExposureReport> {
  const { session } = await requireAuth();
  return generateExpiryReport(session.tenantId, session.storeId);
}
