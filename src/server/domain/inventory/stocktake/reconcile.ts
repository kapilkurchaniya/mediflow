import { DomainError } from "@/server/errors";
import type { ReconciliationCalculation } from "./types";

/**
 * Pure, deterministic calculation of movement-aware inventory reconciliation.
 *
 * Industry-standard formula:
 * Final Balance: F = C + M_after
 * Adjustment Delta: Δ = F - currentBalance
 *
 * where:
 * C = physically counted quantity observed at shelf
 * M_after = net legitimate inventory movements (sales, purchases, returns, transfers)
 *           occurring strictly after physical observation time
 * currentBalance = current live batch quantity in database
 */
export function calculateReconciliationDelta(params: {
  countedQty: number;
  systemQtyAtSnapshot: number;
  netMovementsAfterCount: number;
  currentQtyOnHand: number;
  unitCostPaise: number;
}): ReconciliationCalculation {
  const {
    countedQty,
    netMovementsAfterCount,
    currentQtyOnHand,
    unitCostPaise,
  } = params;

  const rawBalance = countedQty + netMovementsAfterCount;
  if (rawBalance < 0) {
    throw new DomainError(
      "RECONCILIATION_ANOMALY",
      `Physical count (${countedQty}) plus subsequent movements (${netMovementsAfterCount}) results in negative balance (${rawBalance}). Audit reconciliation aborted for investigation.`
    );
  }

  const finalBalance = rawBalance;
  const adjustmentDelta = finalBalance - currentQtyOnHand;
  const varianceCostPaise = adjustmentDelta * unitCostPaise;

  return {
    finalBalance,
    adjustmentDelta,
    varianceCostPaise,
  };
}
