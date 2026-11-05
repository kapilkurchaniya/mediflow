"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requirePermission } from "@/server/rbac";
import {
  listAccountingPeriods,
  getAccountingPeriodById,
  getPeriodAuditHistory,
  getDistinctGSTINs,
  validatePeriodCanBeClosed,
  closeAccountingPeriod,
  reopenAccountingPeriod,
  type AccountingPeriod,
  type AccountingPeriodEvent,
  type PeriodValidationResult,
  type CloseAccountingPeriodResult,
  type ReopenAccountingPeriodResult,
} from "@/server/domain/accounting-periods";

const ListPeriodsSchema = z.object({
  financialYear: z.string().regex(/^\d{4}-\d{4}$/).optional(),
  gstin: z.string().nullable().optional(),
});

const PeriodIdSchema = z.string().uuid("Invalid period ID");

const ClosePeriodSchema = z.object({
  periodId: z.string().uuid("Invalid period ID"),
  reason: z.string().trim().min(3, "Reason must be at least 3 characters").max(255),
  force: z.boolean().default(false),
});

const ReopenPeriodSchema = z.object({
  periodId: z.string().uuid("Invalid period ID"),
  reason: z.string().trim().min(5, "Reopening requires a detailed audit reason (at least 5 characters)").max(255),
});

export async function getAccountingPeriodsAction(
  rawInput: z.infer<typeof ListPeriodsSchema> = {},
): Promise<{ success: boolean; data?: AccountingPeriod[]; distinctGstins?: string[]; error?: string }> {
  try {
    const ctx = await requirePermission("accounting.view");
    const filter = ListPeriodsSchema.parse(rawInput);
    const periods = await listAccountingPeriods(db, ctx.tenantId, filter);
    const distinctGstins = await getDistinctGSTINs(db, ctx.tenantId);

    return { success: true, data: periods, distinctGstins };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load accounting periods";
    return { success: false, error: msg };
  }
}

export async function validatePeriodCloseAction(
  periodIdRaw: string,
): Promise<{ success: boolean; data?: PeriodValidationResult; error?: string }> {
  try {
    const ctx = await requirePermission("accounting.period.lock");
    const periodId = PeriodIdSchema.parse(periodIdRaw);

    const period = await getAccountingPeriodById(db, ctx.tenantId, periodId);
    if (!period) {
      return { success: false, error: "Accounting period not found." };
    }

    const result = await validatePeriodCanBeClosed(db, ctx.tenantId, period, ctx.userId);
    return { success: true, data: result };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to validate period closing";
    return { success: false, error: msg };
  }
}

export async function closePeriodAction(
  rawInput: z.infer<typeof ClosePeriodSchema>,
): Promise<{ success: boolean; data?: CloseAccountingPeriodResult; error?: string }> {
  try {
    const ctx = await requirePermission("accounting.period.lock");
    const input = ClosePeriodSchema.parse(rawInput);

    const result = await db.transaction(async (tx) => {
      return closeAccountingPeriod(tx, {
        tenantId: ctx.tenantId,
        periodId: input.periodId,
        performedBy: ctx.userId,
        reason: input.reason,
        force: input.force,
      });
    });

    revalidatePath("/dashboard/accounting/periods");
    return { success: true, data: result };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to lock accounting period";
    return { success: false, error: msg };
  }
}

export async function reopenPeriodAction(
  rawInput: z.infer<typeof ReopenPeriodSchema>,
): Promise<{ success: boolean; data?: ReopenAccountingPeriodResult; error?: string }> {
  try {
    const ctx = await requirePermission("accounting.period.reopen");
    const input = ReopenPeriodSchema.parse(rawInput);

    const result = await db.transaction(async (tx) => {
      return reopenAccountingPeriod(tx, {
        tenantId: ctx.tenantId,
        periodId: input.periodId,
        performedBy: ctx.userId,
        reason: input.reason,
      });
    });

    revalidatePath("/dashboard/accounting/periods");
    return { success: true, data: result };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to reopen accounting period";
    return { success: false, error: msg };
  }
}

export async function getPeriodAuditHistoryAction(
  periodIdRaw: string,
): Promise<{ success: boolean; data?: AccountingPeriodEvent[]; error?: string }> {
  try {
    const ctx = await requirePermission("accounting.view");
    const periodId = PeriodIdSchema.parse(periodIdRaw);

    const events = await getPeriodAuditHistory(db, ctx.tenantId, periodId);
    return { success: true, data: events };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch period audit history";
    return { success: false, error: msg };
  }
}
