"use server";

import { requirePermission } from "@/server/rbac";
import {
  reconcileDailyReport,
  formatReconciliationSummaryCsv,
  type LegacyDailyReportInput,
  type DailyReconciliationResult,
} from "@/server/domain/pilot/reconciliation";
import {
  submitPilotFeedback,
  type PilotFeedbackInput,
} from "@/server/domain/pilot/feedback";

export async function reconcileDailyReportAction(
  input: LegacyDailyReportInput,
): Promise<{ success: boolean; data?: DailyReconciliationResult; error?: string }> {
  try {
    const ctx = await requirePermission("report.view");
    const targetStoreId = input.storeId || ctx.storeId;
    if (!targetStoreId) {
      return { success: false, error: "Store ID is required for reconciliation." };
    }

    const result = await reconcileDailyReport(ctx.tenantId, {
      ...input,
      storeId: targetStoreId,
    });

    return { success: true, data: result };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to run daily reconciliation.";
    return { success: false, error: msg };
  }
}

export async function exportReconciliationCsvAction(
  result: DailyReconciliationResult,
): Promise<{ success: boolean; csv?: string; filename?: string; error?: string }> {
  try {
    await requirePermission("report.export");
    const csv = formatReconciliationSummaryCsv(result);
    const filename = `daily-reconcile-${result.storeId}-${result.date}.csv`;
    return { success: true, csv, filename };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to export reconciliation CSV.";
    return { success: false, error: msg };
  }
}

export async function submitPilotFeedbackAction(
  input: PilotFeedbackInput,
): Promise<{ success: boolean; feedbackId?: string; error?: string }> {
  try {
    const ctx = await requirePermission("dashboard.view");
    const inserted = await submitPilotFeedback(
      ctx.tenantId,
      ctx.storeId,
      ctx.userId,
      input,
    );

    return { success: true, feedbackId: inserted.id };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to submit pilot feedback.";
    return { success: false, error: msg };
  }
}

