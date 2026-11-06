"use server";

import crypto from "node:crypto";
import { db } from "@/server/db";
import { sql } from "drizzle-orm";
import { requirePermission } from "@/server/rbac";
import { revalidatePath } from "next/cache";
import {
  generateYearEndSnapshotSchema,
  overrideNrvSchema,
  finalizeYearEndSchema,
  getSequenceRolloverPreview,
  generateDraftYearEndSnapshot,
  overrideItemNrv,
  finalizeYearEndSnapshotWithToken,
  evaluateYearEndReadiness,
  exportYearEndClosingStockCsv,
} from "@/server/domain/accounting-year-end";

export async function getSequenceRolloverPreviewAction(storeId: string, closingFy?: string) {
  const ctx = await requirePermission("accounting.view");
  try {
    const preview = await getSequenceRolloverPreview(ctx.tenantId, storeId, closingFy);
    return { success: true, data: preview };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to load sequence rollover preview" };
  }
}

export async function generateDraftSnapshotAction(storeId: string, fiscalYear: string) {
  const ctx = await requirePermission("accounting.period.lock");
  const parsed = generateYearEndSnapshotSchema.safeParse({ tenantId: ctx.tenantId, storeId, fiscalYear });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    const snapshotId = await generateDraftYearEndSnapshot(ctx.tenantId, parsed.data.storeId, parsed.data.fiscalYear);
    revalidatePath("/dashboard/accounting/year-end");
    return { success: true, snapshotId };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to generate draft snapshot" };
  }
}

export async function overrideNrvAction(storeId: string, itemId: string, overrideNrvPaise: number, reason: string) {
  const ctx = await requirePermission("accounting.period.lock");
  const parsed = overrideNrvSchema.safeParse({
    tenantId: ctx.tenantId, storeId, itemId, overrideNrvPaise, reason,
  });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    const result = await overrideItemNrv(
      ctx.tenantId, parsed.data.storeId, parsed.data.itemId,
      parsed.data.overrideNrvPaise, parsed.data.reason, ctx.userId,
    );
    revalidatePath("/dashboard/accounting/year-end");
    return { success: true, data: result };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to override NRV" };
  }
}

export async function finalizeYearEndSnapshotAction(storeId: string, fiscalYear: string) {
  const ctx = await requirePermission("accounting.period.lock");
  const parsed = finalizeYearEndSchema.safeParse({ tenantId: ctx.tenantId, storeId, fiscalYear });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    // 1. Generate 256-bit single-use random authorization token
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    // 2. Issue grant using server connection
    await db.execute(sql`
      SELECT public.issue_year_end_authorization_grant(
        ${ctx.tenantId}::uuid,
        ${parsed.data.storeId}::uuid,
        ${parsed.data.fiscalYear},
        ${ctx.userId}::uuid,
        ${tokenHash},
        60
      )
    `);

    // 3. Finalize snapshot with single-use raw token
    const snapshotId = await finalizeYearEndSnapshotWithToken(
      ctx.tenantId, parsed.data.storeId, parsed.data.fiscalYear, rawToken,
    );

    revalidatePath("/dashboard/accounting/year-end");
    revalidatePath("/dashboard/accounting/trial-balance");
    revalidatePath("/dashboard/accounting/opening-balances");
    return { success: true, snapshotId };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to finalize year-end snapshot" };
  }
}

export async function getYearEndReadinessAction(storeId: string, fiscalYear: string) {
  const ctx = await requirePermission("accounting.view");
  try {
    const readiness = await evaluateYearEndReadiness(ctx.tenantId, storeId, fiscalYear);
    return { success: true, data: readiness };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to evaluate year-end readiness" };
  }
}

export async function exportYearEndCsvAction(storeId: string, snapshotId: string) {
  const ctx = await requirePermission("report.export");
  try {
    const csvContent = await exportYearEndClosingStockCsv(ctx.tenantId, storeId, snapshotId);
    return { success: true, csvContent };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to export year-end CSV" };
  }
}
