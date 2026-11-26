export type NegativeStockPolicyMode = "block" | "warn" | "allow";
export type ItemNegativeStockOverride = "inherit" | NegativeStockPolicyMode;

export function resolveNegativeStockPolicy(input: {
  storePolicy?: NegativeStockPolicyMode | null;
  itemOverride?: ItemNegativeStockOverride | null;
}): NegativeStockPolicyMode {
  if (input.itemOverride && input.itemOverride !== "inherit") {
    return input.itemOverride;
  }
  return input.storePolicy ?? "block";
}

export interface GoingNegativeCheck {
  goingNegative: boolean;
  projectedBalance: number;
  deficit: number;
  allowed: boolean;
  policy: NegativeStockPolicyMode;
  warningMessage: string | null;
}

export function checkGoingNegative(input: {
  qtyOnHand: number;
  requestedQty: number;
  policy: NegativeStockPolicyMode;
}): GoingNegativeCheck {
  const projectedBalance = input.qtyOnHand - input.requestedQty;
  const goingNegative = projectedBalance < 0;
  const deficit = goingNegative ? Math.abs(projectedBalance) : 0;

  if (!goingNegative) {
    return {
      goingNegative: false,
      projectedBalance,
      deficit: 0,
      allowed: true,
      policy: input.policy,
      warningMessage: null,
    };
  }

  if (input.policy === "block") {
    return {
      goingNegative: true,
      projectedBalance,
      deficit,
      allowed: false,
      policy: input.policy,
      warningMessage: `Insufficient stock: balance would drop to ${projectedBalance}`,
    };
  }

  return {
    goingNegative: true,
    projectedBalance,
    deficit,
    allowed: true,
    policy: input.policy,
    warningMessage: `Going negative by ${deficit} unit(s) (projected balance: ${projectedBalance})`,
  };
}
