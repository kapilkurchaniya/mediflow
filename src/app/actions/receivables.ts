"use server";

import { z } from "zod";
import { db } from "@/server/db";
import { requirePermission } from "@/server/rbac";
import { resolveStoreScope } from "@/server/domain/accounting-reports/balances";
import {
  enqueuePaymentReminder,
  getReceivablesAgeingReport,
  getCustomerExposure,
  reconcileReceivablesWithControlAccount,
  type AgeingMode,
  type ReceivablesReport,
  type CustomerExposure,
  type ReceivablesReconciliationResult,
} from "@/server/domain/receivables";

const StoreScopeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("store"), storeId: z.string().uuid() }),
  z.object({ type: z.literal("unallocated") }),
  z.object({ type: z.literal("all") }),
]);

const ReceivablesFilterSchema = z.object({
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  mode: z.enum(["due_date", "invoice_date"]).default("due_date"),
  storeScope: StoreScopeSchema,
  search: z.string().trim().max(100).optional(),
  customerId: z.string().uuid().optional(),
  onlyOverdue: z.boolean().default(false),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});

export async function getReceivablesAgeingAction(
  rawInput: z.infer<typeof ReceivablesFilterSchema>,
): Promise<{ success: boolean; data?: ReceivablesReport; error?: string }> {
  try {
    const ctx = await requirePermission("accounting.view");
    const input = ReceivablesFilterSchema.parse(rawInput);
    const resolvedScope = resolveStoreScope(ctx, input.storeScope);

    const report = await getReceivablesAgeingReport(
      ctx.tenantId,
      {
        ...input,
        storeScope: resolvedScope,
      },
      db,
    );

    return { success: true, data: report };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load receivables report";
    return { success: false, error: message };
  }
}

export async function getCustomerReceivableDetailsAction(
  customerId: string,
  storeScopeRaw: z.infer<typeof StoreScopeSchema>,
  asOfDate?: string,
  mode: AgeingMode = "due_date",
): Promise<{ success: boolean; data?: CustomerExposure | null; error?: string }> {
  try {
    const ctx = await requirePermission("accounting.view");
    const resolvedScope = resolveStoreScope(ctx, storeScopeRaw);
    const exposure = await getCustomerExposure(
      ctx.tenantId,
      customerId,
      resolvedScope,
      asOfDate,
      mode,
      db,
    );

    return { success: true, data: exposure };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load customer receivables";
    return { success: false, error: message };
  }
}

export async function sendPaymentReminderAction(input: {
  customerId: string;
  phone: string;
  message?: string;
}): Promise<{ success: boolean; eventId?: string; message?: string; error?: string }> {
  try {
    const ctx = await requirePermission("accounting.view");
    const res = await enqueuePaymentReminder(db, ctx, input);
    return { success: true, eventId: res.eventId, message: res.message };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to send payment reminder";
    return { success: false, error: message };
  }
}

export async function reconcileReceivablesAction(
  storeScopeRaw: z.infer<typeof StoreScopeSchema>,
  asOfDate?: string,
): Promise<{ success: boolean; data?: ReceivablesReconciliationResult; error?: string }> {
  try {
    const ctx = await requirePermission("accounting.view");
    const resolvedScope = resolveStoreScope(ctx, storeScopeRaw);
    const result = await reconcileReceivablesWithControlAccount(
      ctx.tenantId,
      resolvedScope,
      asOfDate,
      db,
    );

    return { success: true, data: result };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to reconcile receivables";
    return { success: false, error: message };
  }
}
