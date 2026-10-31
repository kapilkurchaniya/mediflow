/**
 * Standard Indian currency denominations (banknotes and rupee coins).
 */
export const INDIAN_CURRENCY_DENOMINATIONS = [500, 200, 100, 50, 20, 10, 5, 2, 1] as const;
export type Denomination = (typeof INDIAN_CURRENCY_DENOMINATIONS)[number];

/**
 * Calculates total paise from Indian currency denomination counts.
 */
export function calculateDenominationTotalPaise(denominations?: Record<string, number>): number {
  if (!denominations) return 0;
  let totalPaise = 0;
  for (const [denomStr, count] of Object.entries(denominations)) {
    const denom = Number(denomStr);
    if (!isNaN(denom) && denom > 0 && typeof count === "number" && count > 0) {
      totalPaise += Math.round(denom * 100) * Math.floor(count);
    }
  }
  return totalPaise;
}

/**
 * Formats a denomination breakdown map into a human-readable summary string.
 */
export function formatDenominationSummary(denominations: Record<string, number>): string {
  const parts: string[] = [];
  for (const denom of INDIAN_CURRENCY_DENOMINATIONS) {
    const count = denominations[String(denom)];
    if (typeof count === "number" && count > 0) {
      parts.push(`₹${denom}×${count}`);
    }
  }
  const coins = denominations["coins"] ?? denominations["coin"] ?? 0;
  if (typeof coins === "number" && coins > 0) {
    parts.push(`Coins=₹${coins}`);
  }
  return parts.join(", ");
}
