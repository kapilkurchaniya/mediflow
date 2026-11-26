export interface PurchaseRateDiffResult {
  hasDiff: boolean;
  direction: "higher" | "lower" | "equal";
  diffPaise: number;
  diffPercent: number;
  alertLevel: "none" | "info" | "warn";
  message: string | null;
}

/**
 * Compares incoming distributor purchase rate against last/master purchase rate (C6).
 */
export function evaluatePurchaseRateDiff(input: {
  currentRatePaise: number;
  previousRatePaise?: number | null;
  thresholdBp?: number; // default 200 = 2%
}): PurchaseRateDiffResult {
  const prev = input.previousRatePaise ?? 0;
  if (prev <= 0 || input.currentRatePaise <= 0) {
    return {
      hasDiff: false,
      direction: "equal",
      diffPaise: 0,
      diffPercent: 0,
      alertLevel: "none",
      message: null,
    };
  }

  const diffPaise = input.currentRatePaise - prev;
  const absDiffBp = Math.round((Math.abs(diffPaise) / prev) * 10000);
  const diffPercent = Number(((diffPaise / prev) * 100).toFixed(2));
  const thresholdBp = input.thresholdBp ?? 200;

  if (diffPaise === 0 || absDiffBp < thresholdBp) {
    return {
      hasDiff: false,
      direction: "equal",
      diffPaise,
      diffPercent,
      alertLevel: "none",
      message: null,
    };
  }

  const direction = diffPaise > 0 ? "higher" : "lower";
  const alertLevel = diffPaise > 0 ? "warn" : "info";
  const sign = diffPaise > 0 ? "+" : "";
  return {
    hasDiff: true,
    direction,
    diffPaise,
    diffPercent,
    alertLevel,
    message: `Rate ${direction} by ${sign}${diffPercent}% vs last PTR (₹${(prev / 100).toFixed(2)} → ₹${(input.currentRatePaise / 100).toFixed(2)})`,
  };
}
