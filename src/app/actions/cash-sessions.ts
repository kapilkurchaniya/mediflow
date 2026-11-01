"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { requirePermission } from "@/server/rbac";
import {
  openShift,
  closeShift,
  getCurrentShift,
  getXReport,
  getZReport,
  getShiftHistory,
  OpenShiftInputSchema,
  CloseShiftInputSchema,
  type OpenShiftInput,
  type CloseShiftInput,
  type CurrentShiftStats,
  type ShiftReportData,
} from "@/server/domain/cash-sessions";

export type { OpenShiftInput, CloseShiftInput };

/**
 * Server Action: Opens a new cash register shift for the current active store.
 * Guarded by permission `register.manage`.
 */
export async function openShiftAction(input: OpenShiftInput) {
  try {
    const ctx = await requirePermission("register.manage");
    const parsed = OpenShiftInputSchema.parse(input);

    const session = await db.transaction(async (tx) => {
      return openShift(tx, ctx, parsed);
    });

    revalidatePath("/dashboard/sales/register");
    revalidatePath("/dashboard/sales/pos");

    return { ok: true as const, session };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to open register shift";
    return { ok: false as const, error: message };
  }
}

/**
 * Server Action: Closes an active cash register shift with counted cash tally.
 * Guarded by permission `register.manage`.
 */
export async function closeShiftAction(input: CloseShiftInput) {
  try {
    const ctx = await requirePermission("register.manage");
    const parsed = CloseShiftInputSchema.parse(input);

    const session = await db.transaction(async (tx) => {
      return closeShift(tx, ctx, parsed);
    });

    revalidatePath("/dashboard/sales/register");
    revalidatePath("/dashboard/sales/pos");

    return { ok: true as const, session };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to close register shift";
    return { ok: false as const, error: message };
  }
}

/**
 * Server Action: Fetches the current active shift and drawer totals.
 * Accessible to any role that can view sales (`sale.view` or `register.manage`).
 */
export async function getCurrentShiftAction(): Promise<{
  ok: true;
  data: CurrentShiftStats | null;
} | {
  ok: false;
  error: string;
}> {
  try {
    const ctx = await requirePermission("sale.view");
    const data = await getCurrentShift(db, ctx);
    return { ok: true, data };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load current shift";
    return { ok: false, error: message };
  }
}

/**
 * Server Action: Fetches active shift status and requireShift configuration for POS counter.
 */
export async function getPosShiftStatusAction(): Promise<{
  ok: true;
  shift: CurrentShiftStats | null;
  requireShift: boolean;
} | {
  ok: false;
  error: string;
}> {
  try {
    const ctx = await requirePermission("sale.view");
    const shift = await getCurrentShift(db, ctx);

    const [tenant] = await db
      .select({ settings: schema.tenants.settings })
      .from(schema.tenants)
      .where(eq(schema.tenants.id, ctx.tenantId))
      .limit(1);

    const requireShift = Boolean((tenant?.settings as Record<string, unknown>)?.requireShift);

    return { ok: true, shift, requireShift };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load POS shift status";
    return { ok: false, error: message };
  }
}

/**
 * Server Action: Fetches data for an X-Report mid-shift snapshot.
 * Guarded by permission `register.manage`.
 */
export async function getXReportAction(sessionId?: string): Promise<{
  ok: true;
  report: ShiftReportData;
} | {
  ok: false;
  error: string;
}> {
  try {
    const ctx = await requirePermission("register.manage");
    const report = await getXReport(db, ctx, sessionId);
    return { ok: true, report };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to generate X-Report";
    return { ok: false, error: message };
  }
}

/**
 * Server Action: Fetches data for an end-of-shift Z-Report audit sheet.
 * Guarded by permission `register.manage`.
 */
export async function getZReportAction(sessionId: string): Promise<{
  ok: true;
  report: ShiftReportData;
} | {
  ok: false;
  error: string;
}> {
  try {
    const ctx = await requirePermission("register.manage");
    const report = await getZReport(db, ctx, sessionId);
    return { ok: true, report };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to generate Z-Report";
    return { ok: false, error: message };
  }
}

/**
 * Server Action: Fetches past shift history for the store.
 * Guarded by permission `register.manage`.
 */
export async function getShiftHistoryAction(limit = 20) {
  try {
    const ctx = await requirePermission("register.manage");
    const history = await getShiftHistory(db, ctx, limit);
    return { ok: true as const, history };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load shift history";
    return { ok: false as const, error: message };
  }
}
