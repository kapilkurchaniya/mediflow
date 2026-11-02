/**
 * Server-side date range utilities.
 * Used by server actions and API routes to resolve date ranges from search params or AI tool arguments.
 */

export interface DateRange {
  from: string | null; // YYYY-MM-DD
  to: string | null;   // YYYY-MM-DD
}

/**
 * Resolves a preset key or custom dates into a { from, to } date pair.
 * Works identically to the client-side resolvePreset but runs on the server.
 */
export function resolveDateRange(opts: {
  range?: string | null;
  from?: string | null;
  to?: string | null;
}): DateRange {
  const { range, from, to } = opts;

  // If custom dates are provided directly
  if (range === "custom" || (!range && (from || to))) {
    return { from: from || null, to: to || null };
  }

  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();

  function fmt(dt: Date) {
    return dt.toISOString().split("T")[0];
  }

  switch (range) {
    case "today":
      return { from: fmt(new Date(y, m, d)), to: fmt(new Date(y, m, d)) };
    case "yesterday": {
      const yd = new Date(y, m, d - 1);
      return { from: fmt(yd), to: fmt(yd) };
    }
    case "7d":
      return { from: fmt(new Date(y, m, d - 6)), to: fmt(now) };
    case "30d":
      return { from: fmt(new Date(y, m, d - 29)), to: fmt(now) };
    case "month":
      return { from: fmt(new Date(y, m, 1)), to: fmt(now) };
    case "last-month":
      return { from: fmt(new Date(y, m - 1, 1)), to: fmt(new Date(y, m, 0)) };
    case "quarter": {
      const qStart = new Date(y, Math.floor(m / 3) * 3, 1);
      return { from: fmt(qStart), to: fmt(now) };
    }
    case "year":
      return { from: fmt(new Date(y, 0, 1)), to: fmt(now) };
    case "all":
    default:
      return { from: null, to: null };
  }
}

/**
 * Resolves date range specifically for forward-looking expiry dates.
 */
export function resolveExpiryDateRange(opts: {
  range?: string | null;
  from?: string | null;
  to?: string | null;
}): DateRange {
  const { range, from, to } = opts;

  if (range === "custom" || (!range && (from || to))) {
    return { from: from || null, to: to || null };
  }

  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();

  function fmt(dt: Date) {
    return dt.toISOString().split("T")[0];
  }

  const todayStr = fmt(now);

  switch (range) {
    case "expired":
      return { from: null, to: fmt(new Date(y, m, d - 1)) };
    case "30d":
      return { from: todayStr, to: fmt(new Date(y, m, d + 30)) };
    case "60d":
      return { from: todayStr, to: fmt(new Date(y, m, d + 60)) };
    case "90d":
      return { from: todayStr, to: fmt(new Date(y, m, d + 90)) };
    case "180d":
      return { from: todayStr, to: fmt(new Date(y, m, d + 180)) };
    case "year":
      return { from: todayStr, to: fmt(new Date(y, 11, 31)) };
    case "all":
    default:
      return { from: null, to: null };
  }
}

/**
 * Resolves a natural language period to a DateRange for AI tool use.
 */
export function resolveAIPeriod(period: string): DateRange {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();

  function fmt(dt: Date) {
    return dt.toISOString().split("T")[0];
  }

  const lower = period.toLowerCase().trim();

  if (lower === "today") return { from: fmt(new Date(y, m, d)), to: fmt(new Date(y, m, d)) };
  if (lower === "yesterday") {
    const yd = new Date(y, m, d - 1);
    return { from: fmt(yd), to: fmt(yd) };
  }
  if (lower.includes("week") || lower === "7d" || lower.includes("last 7"))
    return { from: fmt(new Date(y, m, d - 6)), to: fmt(now) };
  if (lower.includes("month") && lower.includes("last"))
    return { from: fmt(new Date(y, m - 1, 1)), to: fmt(new Date(y, m, 0)) };
  if (lower.includes("month") || lower === "30d" || lower.includes("last 30"))
    return { from: fmt(new Date(y, m, 1)), to: fmt(now) };
  if (lower.includes("quarter"))
    return { from: fmt(new Date(y, Math.floor(m / 3) * 3, 1)), to: fmt(now) };
  if (lower.includes("year"))
    return { from: fmt(new Date(y, 0, 1)), to: fmt(now) };

  // Default to today
  return { from: fmt(new Date(y, m, d)), to: fmt(new Date(y, m, d)) };
}
