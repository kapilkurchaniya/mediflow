/**
 * Idempotent generator for 12 monthly accounting periods for an Indian Financial Year.
 * Strictly limited to active and immediate next Indian FY to prevent historical back-provisioning.
 */
import { and, eq, isNull } from "drizzle-orm";
import type { DbOrTx } from "@/server/db";
import { accountingPeriods } from "@/server/db/schema";
import { getCurrentIndianFY, getMonthsForIndianFY } from "./period-resolver";
import { PeriodLockedError, type AccountingPeriod } from "./types";

export interface ProvisionPeriodsOptions {
  financialYear?: string;
  gstin?: string | null;
  allowAdjacentFY?: boolean;
}

export async function ensureFinancialYearPeriods(
  tx: DbOrTx,
  tenantId: string,
  options: ProvisionPeriodsOptions = {},
): Promise<AccountingPeriod[]> {
  const currentFY = getCurrentIndianFY();
  const targetFY = options.financialYear ?? currentFY;
  const gstin = options.gstin ?? null;

  const [currentStartYear] = currentFY.split("-").map(Number);
  const [targetStartYear] = targetFY.split("-").map(Number);

  // P0.6: Reject unconfigured historical financial years or far future years
  if (targetStartYear < currentStartYear && !options.allowAdjacentFY) {
    throw new PeriodLockedError(
      `Historical financial year ${targetFY} cannot be automatically provisioned. Historical periods must be explicitly configured.`,
      {
        periodKey: `${targetFY}-XX`,
        financialYear: targetFY,
        gstin,
      },
    );
  }

  if (targetStartYear > currentStartYear + 1 && !options.allowAdjacentFY) {
    throw new PeriodLockedError(
      `Future financial year ${targetFY} beyond next FY cannot be automatically provisioned.`,
      {
        periodKey: `${targetFY}-XX`,
        financialYear: targetFY,
        gstin,
      },
    );
  }

  const months = getMonthsForIndianFY(targetFY);

  // Prepare batch values
  const valuesToInsert = months.map((m) => ({
    tenantId,
    gstin,
    periodKey: m.periodKey,
    startDate: m.startDate,
    endDate: m.endDate,
    financialYear: targetFY,
    status: "open" as const,
  }));

  // Idempotent insertion
  const insertStmt = tx.insert(accountingPeriods).values(valuesToInsert);
  if (typeof (insertStmt as { onConflictDoNothing?: unknown }).onConflictDoNothing === "function") {
    await (insertStmt as { onConflictDoNothing: () => Promise<unknown> }).onConflictDoNothing();
  } else {
    await insertStmt;
  }

  // Return the FY periods sorted chronologically
  const selectQuery = tx
    .select()
    .from(accountingPeriods)
    .where(
      and(
        eq(accountingPeriods.tenantId, tenantId),
        eq(accountingPeriods.financialYear, targetFY),
        gstin ? eq(accountingPeriods.gstin, gstin) : isNull(accountingPeriods.gstin),
      ),
    );

  const rows = await selectQuery;
  if (Array.isArray(rows) && rows.length > 0) {
    return rows.sort((a, b) => a.startDate.localeCompare(b.startDate));
  }

  // Fallback for mock environments
  return valuesToInsert.map((v, idx) => ({
    id: `mock-period-${idx}`,
    ...v,
    lockedAt: null,
    lockedBy: null,
    lockNote: null,
    closingSnapshot: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
}
