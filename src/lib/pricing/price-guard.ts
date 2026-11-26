export type BelowCostPolicy = "off" | "warn" | "block";

export interface LinePriceGuardInput {
  medicineName: string;
  /** Gross pack/unit rate before discount (paise) */
  saleRatePaise: number;
  /** Discount in basis points (0..10000) */
  discountBp: number;
  /** Printed MRP in paise (0 if not set) */
  mrpPaise: number;
  /** Landed/purchase cost in paise (0 if unknown) */
  costPaise: number;
  belowCostPolicy?: BelowCostPolicy;
}

export interface LinePriceGuardResult {
  netUnitRatePaise: number;
  aboveMrp: boolean;
  belowCost: boolean;
  blocked: boolean;
  reason?: string;
}

/**
 * Enforces Legal Metrology (never sell above MRP) and Marg-style
 * below-cost policy (`off | warn | block`).
 */
export function evaluateLinePriceGuard(input: LinePriceGuardInput): LinePriceGuardResult {
  const netUnitRatePaise = Math.round(
    input.saleRatePaise * (1 - Math.max(0, Math.min(10000, input.discountBp)) / 10000)
  );
  const aboveMrp = input.mrpPaise > 0 && netUnitRatePaise > input.mrpPaise;
  const belowCost = input.costPaise > 0 && netUnitRatePaise < input.costPaise;
  const policy = input.belowCostPolicy ?? "off";

  if (aboveMrp) {
    return {
      netUnitRatePaise,
      aboveMrp: true,
      belowCost,
      blocked: true,
      reason: `Sale rate for "${input.medicineName}" exceeds printed MRP.`,
    };
  }

  if (belowCost && policy === "block") {
    return {
      netUnitRatePaise,
      aboveMrp: false,
      belowCost: true,
      blocked: true,
      reason: `Sale rate for "${input.medicineName}" is below purchase cost.`,
    };
  }

  return {
    netUnitRatePaise,
    aboveMrp: false,
    belowCost,
    blocked: false,
    reason:
      belowCost && policy === "warn"
        ? `Sale rate for "${input.medicineName}" is below purchase cost.`
        : undefined,
  };
}
