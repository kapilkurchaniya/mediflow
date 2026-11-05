import { db, type DbOrTx } from "@/server/db";
import { format } from "date-fns";
import type { ReceivablesReconciliationResult, ReportStoreScope } from "./types";
import { getReceivablesAgeingReport } from "./ageing";
import { getPartyControlReconciliation } from "../accounting-reports/reconciliation";

/**
 * Reconciles invoice-level open receivables and available credits with the
 * General Ledger Debtors Control Account (1050) under the specified store scope.
 */
export async function reconcileReceivablesWithControlAccount(
  tenantId: string,
  storeScope: ReportStoreScope,
  asOfDate: string = format(new Date(), "yyyy-MM-dd"),
  d: DbOrTx = db,
): Promise<ReceivablesReconciliationResult> {
  // 1. Fetch subledger open receivables and available credits
  const ageingReport = await getReceivablesAgeingReport(
    tenantId,
    {
      asOfDate,
      mode: "due_date",
      storeScope,
      limit: 10000,
      offset: 0,
    },
    d,
  );

  const totalOpenInvoiceBalances = ageingReport.totalGrossReceivables;
  const totalAvailableCustomerCredits = ageingReport.totalAvailableCredits;
  const netSubledgerReceivables = ageingReport.totalNetExposure;

  // 2. Fetch Debtors control account (1050) balance from General Ledger
  const controlReport = await getPartyControlReconciliation(
    tenantId,
    "customer",
    storeScope,
    null,
    d,
  );

  const debtorsControlAccountBalance = controlReport.controlNet;
  const unattributedControlDebit = controlReport.unattributedNet;

  // 3. Compute variance between subledger net exposure and control account
  const variance = netSubledgerReceivables - debtorsControlAccountBalance;
  const isReconciled = variance === 0 && unattributedControlDebit === 0;

  return {
    storeScope,
    asOfDate,
    totalOpenInvoiceBalances,
    totalAvailableCustomerCredits,
    netSubledgerReceivables,
    debtorsControlAccountBalance,
    unattributedControlDebit,
    variance,
    isReconciled,
  };
}
