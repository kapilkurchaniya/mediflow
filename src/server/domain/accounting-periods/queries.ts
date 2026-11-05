/**
 * Read queries for Accounting Periods and Audit Event History.
 */
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import type { DbOrTx } from "@/server/db";
import { accountingPeriods, accountingPeriodEvents, stores } from "@/server/db/schema";
import { getCurrentIndianFY } from "./period-resolver";
import { ensureFinancialYearPeriods } from "./period-generator";
import type { AccountingPeriod, AccountingPeriodEvent } from "./types";

export interface ListAccountingPeriodsFilter {
  financialYear?: string;
  gstin?: string | null;
}

export async function listAccountingPeriods(
  db: DbOrTx,
  tenantId: string,
  filter: ListAccountingPeriodsFilter = {},
): Promise<AccountingPeriod[]> {
  const fy = filter.financialYear ?? getCurrentIndianFY();

  // Lazy ensure active FY periods exist
  await ensureFinancialYearPeriods(db, tenantId, {
    financialYear: fy,
    gstin: filter.gstin ?? null,
  }).catch(() => {
    // If not current FY, might throw; ignore to simply query existing
  });

  const conditions = [
    eq(accountingPeriods.tenantId, tenantId),
    eq(accountingPeriods.financialYear, fy),
  ];

  if (filter.gstin !== undefined) {
    if (filter.gstin === null) {
      conditions.push(isNull(accountingPeriods.gstin));
    } else {
      conditions.push(eq(accountingPeriods.gstin, filter.gstin));
    }
  }

  const periods = await db
    .select()
    .from(accountingPeriods)
    .where(and(...conditions));

  return periods.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

export async function getAccountingPeriodById(
  db: DbOrTx,
  tenantId: string,
  periodId: string,
): Promise<AccountingPeriod | null> {
  const [period] = await db
    .select()
    .from(accountingPeriods)
    .where(and(eq(accountingPeriods.id, periodId), eq(accountingPeriods.tenantId, tenantId)));
  return period ?? null;
}

export async function getPeriodAuditHistory(
  db: DbOrTx,
  tenantId: string,
  periodId: string,
): Promise<AccountingPeriodEvent[]> {
  return db
    .select()
    .from(accountingPeriodEvents)
    .where(and(eq(accountingPeriodEvents.periodId, periodId), eq(accountingPeriodEvents.tenantId, tenantId)))
    .orderBy(desc(accountingPeriodEvents.eventSequence));
}

export async function getDistinctGSTINs(db: DbOrTx, tenantId: string): Promise<string[]> {
  const storeRows = await db
    .select({ gstin: stores.gstin })
    .from(stores)
    .where(and(eq(stores.tenantId, tenantId), isNotNull(stores.gstin)));

  const unique = new Set<string>();
  for (const s of storeRows) {
    if (s.gstin?.trim()) {
      unique.add(s.gstin.trim());
    }
  }
  return Array.from(unique);
}
