/**
 * Types & Domain Errors for Accounting Period Management.
 * Follows Indian Financial Year (April 1 to March 31).
 */
import type { accountingPeriods, accountingPeriodEvents } from "@/server/db/schema";

export type PeriodStatus = "open" | "locked";
export type PeriodEventType = "lock" | "reopen";

export interface PeriodSnapshot {
  totalJournalEntries: number; // distinct count of journal entries
  totalDebitPaise: number;
  totalCreditPaise: number;
  lockedAt: string;
  lockedBy: string;
  periodKey: string;
  financialYear: string;
  gstin: string | null;
  scope: "master" | "gstin";
}

export type AccountingPeriod = typeof accountingPeriods.$inferSelect;
export type NewAccountingPeriod = typeof accountingPeriods.$inferInsert;

export type AccountingPeriodEvent = typeof accountingPeriodEvents.$inferSelect;
export type NewAccountingPeriodEvent = typeof accountingPeriodEvents.$inferInsert;

export interface PeriodValidationResult {
  canClose: boolean;
  blockers: string[];
  warnings: string[];
  snapshot: PeriodSnapshot;
  unpostedDraftSalesCount: number;
  openCashSessionsCount: number;
}

export class PeriodLockedError extends Error {
  public readonly periodKey: string;
  public readonly financialYear: string;
  public readonly gstin: string | null;
  public readonly lockedAt: string | null;

  constructor(
    message: string,
    details: {
      periodKey: string;
      financialYear: string;
      gstin?: string | null;
      lockedAt?: string | null;
    },
  ) {
    super(message);
    this.name = "PeriodLockedError";
    this.periodKey = details.periodKey;
    this.financialYear = details.financialYear;
    this.gstin = details.gstin ?? null;
    this.lockedAt = details.lockedAt ?? null;
    Object.setPrototypeOf(this, PeriodLockedError.prototype);
  }
}
