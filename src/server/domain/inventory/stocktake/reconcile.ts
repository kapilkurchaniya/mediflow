import type { ReconciliationCalculation } from "./types";

/**
 * Pure, deterministic calculation of movement-aware inventory reconciliation.
 *
 * Industry-standard formula:
 * Final Balance: F = Math.max(0, C + M_after)
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

  const finalBalance = Math.max(0, countedQty + netMovementsAfterCount);
  const adjustmentDelta = finalBalance - currentQtyOnHand;
  const varianceCostPaise = adjustmentDelta * unitCostPaise;

  return {
    finalBalance,
    adjustmentDelta,
    varianceCostPaise,
  };
}
