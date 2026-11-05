/**
 * Centralized guard for accounting period verification.
 * Enforces Model A (Hierarchical scope: Master period is primary; secondary GSTIN period adds restriction).
 * Serializes posting using row-level FOR SHARE locks in deterministic order.
 */
import { and, eq, isNull } from "drizzle-orm";
import type { DbOrTx } from "@/server/db";
import { accountingPeriods, stores } from "@/server/db/schema";
import { calculateIndianFY, formatPeriodKey, getCurrentIndianFY } from "./period-resolver";
import { ensureFinancialYearPeriods } from "./period-generator";
import { PeriodLockedError, type AccountingPeriod } from "./types";

export interface AssertAccountingPeriodOpenParams {
  tenantId: string;
  entryDate: string | Date;
  gstin?: string | null;
  storeId?: string | null;
}

export async function assertAccountingPeriodOpen(
  tx: DbOrTx,
  params: AssertAccountingPeriodOpenParams,
): Promise<{ masterPeriod: AccountingPeriod; gstinPeriod: AccountingPeriod | null }> {
  const periodKey = formatPeriodKey(params.entryDate);
  const fyInfo = calculateIndianFY(params.entryDate);
  const activeFY = getCurrentIndianFY();

  const [currentStartYear] = activeFY.split("-").map(Number);
  const targetStartYear = fyInfo.startYear;

  // Reject historical financial years
  if (targetStartYear < currentStartYear) {
    throw new PeriodLockedError(
      `Accounting period ${periodKey} (FY ${fyInfo.financialYear}) is in a historical financial year. Historical financial years cannot accept postings.`,
      { periodKey, financialYear: fyInfo.financialYear, gstin: null },
    );
  }

  // Reject far-future financial years
  if (targetStartYear > currentStartYear + 1) {
    throw new PeriodLockedError(
      `Accounting period ${periodKey} (FY ${fyInfo.financialYear}) is not configured. Unprovisioned future financial years cannot accept postings.`,
      { periodKey, financialYear: fyInfo.financialYear, gstin: null },
    );
  }

  // 1. Resolve and lock Master Period (gstin IS NULL) first (deterministic order)
  const masterSelect = tx
    .select()
    .from(accountingPeriods)
    .where(
      and(
        eq(accountingPeriods.tenantId, params.tenantId),
        eq(accountingPeriods.periodKey, periodKey),
        isNull(accountingPeriods.gstin),
      ),
    );
  const masterQuery = typeof (masterSelect as { for?: unknown }).for === "function"
    ? (masterSelect as { for: (mode: string) => typeof masterSelect }).for("share")
    : masterSelect;
  const masterRows = await masterQuery;
  let master = Array.isArray(masterRows) ? masterRows[0] : undefined;

  // Lazy provision if missing and in active FY or immediate next FY
  if (!master) {
    if (targetStartYear === currentStartYear || targetStartYear === currentStartYear + 1) {
      const generated = await ensureFinancialYearPeriods(tx, params.tenantId, {
        financialYear: fyInfo.financialYear,
        gstin: null,
      });
      master = generated.find((p) => p.periodKey === periodKey);
      if (!master) {
        const reSelect = tx
          .select()
          .from(accountingPeriods)
          .where(
            and(
              eq(accountingPeriods.tenantId, params.tenantId),
              eq(accountingPeriods.periodKey, periodKey),
              isNull(accountingPeriods.gstin),
            ),
          );
        const reQuery = typeof (reSelect as { for?: unknown }).for === "function"
          ? (reSelect as { for: (mode: string) => typeof reSelect }).for("share")
          : reSelect;
        const reRows = await reQuery;
        master = Array.isArray(reRows) ? reRows[0] : undefined;
      }
    }
  }

  if (!master) {
    throw new PeriodLockedError(
      `Accounting period ${periodKey} (FY ${fyInfo.financialYear}) is not configured. Historical or unprovisioned financial years cannot accept postings.`,
      { periodKey, financialYear: fyInfo.financialYear, gstin: null },
    );
  }

  if (master.status === "locked") {
    throw new PeriodLockedError(
      `Accounting period ${periodKey} (FY ${fyInfo.financialYear}) is locked for this business. No new journal entries or financial modifications may be posted.`,
      {
        periodKey,
        financialYear: fyInfo.financialYear,
        gstin: null,
        lockedAt: master.lockedAt ? master.lockedAt.toISOString() : null,
      },
    );
  }

  // Resolve store GSTIN if not explicitly passed
  let targetGstin = params.gstin ?? null;
  if (!targetGstin && params.storeId) {
    try {
      const storeRows = await tx
        .select({ gstin: stores.gstin })
        .from(stores)
        .where(and(eq(stores.id, params.storeId), eq(stores.tenantId, params.tenantId)));
      targetGstin = Array.isArray(storeRows) ? storeRows[0]?.gstin ?? null : null;
    } catch {
      targetGstin = null;
    }
  }

  // 2. If GSTIN is present, resolve and lock secondary GSTIN Period second
  let gstinPeriod: AccountingPeriod | null = null;
  if (targetGstin) {
    const secSelect = tx
      .select()
      .from(accountingPeriods)
      .where(
        and(
          eq(accountingPeriods.tenantId, params.tenantId),
          eq(accountingPeriods.periodKey, periodKey),
          eq(accountingPeriods.gstin, targetGstin),
        ),
      );
    const secQuery = typeof (secSelect as { for?: unknown }).for === "function"
      ? (secSelect as { for: (mode: string) => typeof secSelect }).for("share")
      : secSelect;
    const secRows = await secQuery;
    const secondary = Array.isArray(secRows) ? secRows[0] : undefined;

    if (secondary) {
      gstinPeriod = secondary;
      if (secondary.status === "locked") {
        throw new PeriodLockedError(
          `Accounting period ${periodKey} for GSTIN ${targetGstin} is locked. No transactions for this GSTIN may be posted.`,
          {
            periodKey,
            financialYear: fyInfo.financialYear,
            gstin: targetGstin,
            lockedAt: secondary.lockedAt ? secondary.lockedAt.toISOString() : null,
          },
        );
      }
    }
  }

  return { masterPeriod: master, gstinPeriod };
}
