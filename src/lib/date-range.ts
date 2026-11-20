/**
 * Server-side date range utilities.
 * Used by server actions and API routes to resolve date ranges from search params or AI tool arguments.
 */

export interface DateRange {
  from: string | null; // YYYY-MM-DD
  to: string | null;   // YYYY-MM-DD
}

/**
 * Returns today's calendar year, 0-based month, and day in Indian Standard Time (Asia/Kolkata).
 * Ensures server-side reports in UTC runtimes match Indian pharmacy business dates.
 */
function getISTCalendarToday(now: Date = new Date()): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const y = Number.parseInt(parts.find((p) => p.type === "year")?.value ?? "", 10) || now.getFullYear();
  const month1 = Number.parseInt(parts.find((p) => p.type === "month")?.value ?? "", 10) || now.getMonth() + 1;
  const d = Number.parseInt(parts.find((p) => p.type === "day")?.value ?? "", 10) || now.getDate();
  return { y, m: month1 - 1, d };
}

/**
 * Formats a calendar date in UTC without local-timezone midnight shifts (fixes IST 1-day-behind bug).
 */
function fmtYmd(y: number, m: number, d: number): string {
  return new Date(Date.UTC(y, m, d)).toISOString().split("T")[0];
}

/**
 * Returns today's YYYY-MM-DD string in IST.
 */
export function getISTTodayString(now: Date = new Date()): string {
  const { y, m, d } = getISTCalendarToday(now);
  return fmtYmd(y, m, d);
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

  const { y, m, d } = getISTCalendarToday();
  const today = fmtYmd(y, m, d);

  switch (range) {
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const yd = fmtYmd(y, m, d - 1);
      return { from: yd, to: yd };
    }
    case "7d":
      return { from: fmtYmd(y, m, d - 6), to: today };
    case "30d":
      return { from: fmtYmd(y, m, d - 29), to: today };
    case "month":
    case "this_month":
      return { from: fmtYmd(y, m, 1), to: today };
    case "last-month":
      return { from: fmtYmd(y, m - 1, 1), to: fmtYmd(y, m, 0) };
    case "quarter":
      return { from: fmtYmd(y, Math.floor(m / 3) * 3, 1), to: today };
    case "year":
      return { from: fmtYmd(y, 0, 1), to: today };
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

  const { y, m, d } = getISTCalendarToday();
  const todayStr = fmtYmd(y, m, d);

  switch (range) {
    case "expired":
      return { from: null, to: fmtYmd(y, m, d - 1) };
    case "30d":
      return { from: todayStr, to: fmtYmd(y, m, d + 30) };
    case "60d":
      return { from: todayStr, to: fmtYmd(y, m, d + 60) };
    case "90d":
      return { from: todayStr, to: fmtYmd(y, m, d + 90) };
    case "180d":
      return { from: todayStr, to: fmtYmd(y, m, d + 180) };
    case "year":
      return { from: todayStr, to: fmtYmd(y, 11, 31) };
    case "all":
    default:
      return { from: null, to: null };
  }
}

/**
 * Resolves a natural language period to a DateRange for AI tool use.
 */
export function resolveAIPeriod(period: string): DateRange {
  const { y, m, d } = getISTCalendarToday();
  const today = fmtYmd(y, m, d);

  const lower = period.toLowerCase().trim();

  if (lower === "today") return { from: today, to: today };
  if (lower === "yesterday") {
    const yd = fmtYmd(y, m, d - 1);
    return { from: yd, to: yd };
  }
  if (lower.includes("week") || lower === "7d" || lower.includes("last 7"))
    return { from: fmtYmd(y, m, d - 6), to: today };
  if (lower.includes("month") && lower.includes("last"))
    return { from: fmtYmd(y, m - 1, 1), to: fmtYmd(y, m, 0) };
  if (lower.includes("month") || lower === "30d" || lower.includes("last 30"))
    return { from: fmtYmd(y, m, 1), to: today };
  if (lower.includes("quarter"))
    return { from: fmtYmd(y, Math.floor(m / 3) * 3, 1), to: today };
  if (lower.includes("year"))
    return { from: fmtYmd(y, 0, 1), to: today };

  // Default to today
  return { from: today, to: today };
}
