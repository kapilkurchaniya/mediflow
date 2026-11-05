/**
 * Period date math and Indian Financial Year resolution (Asia/Kolkata).
 * Indian FY runs from April 1 to March 31.
 */

export interface IndianFYInfo {
  financialYear: string;
  startYear: number;
  endYear: number;
}

/**
 * Extracts Asia/Kolkata calendar parts (year, month 1-12, day 1-31) from Date or string.
 */
export function getISTDateParts(input: Date | string): { year: number; month: number; day: number } {
  const d = typeof input === "string" ? new Date(input.includes("T") ? input : `${input}T00:00:00+05:30`) : input;
  // Format in Asia/Kolkata timezone
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(d);
  let year = d.getFullYear();
  let month = d.getMonth() + 1;
  let day = d.getDate();

  for (const part of parts) {
    if (part.type === "year") year = Number.parseInt(part.value, 10);
    if (part.type === "month") month = Number.parseInt(part.value, 10);
    if (part.type === "day") day = Number.parseInt(part.value, 10);
  }

  return { year, month, day };
}

/**
 * Calculates Indian Financial Year string (e.g. "2026-2027") for a date in IST.
 */
export function calculateIndianFY(input: Date | string): IndianFYInfo {
  const { year, month } = getISTDateParts(input);
  if (month >= 4) {
    return {
      financialYear: `${year}-${year + 1}`,
      startYear: year,
      endYear: year + 1,
    };
  }
  return {
    financialYear: `${year - 1}-${year}`,
    startYear: year - 1,
    endYear: year,
  };
}

/**
 * Returns current Indian FY for now (IST).
 */
export function getCurrentIndianFY(): string {
  return calculateIndianFY(new Date()).financialYear;
}

/**
 * Formats a Date or date-string into period key "YYYY-MM" in IST.
 */
export function formatPeriodKey(input: Date | string): string {
  const { year, month } = getISTDateParts(input);
  return `${year}-${String(month).padStart(2, "0")}`;
}

/**
 * Returns start and end date strings (YYYY-MM-DD) for a given "YYYY-MM" period key.
 */
export function getPeriodDateRange(periodKey: string): { startDate: string; endDate: string } {
  const [yearStr, monthStr] = periodKey.split("-");
  const year = Number.parseInt(yearStr, 10);
  const month = Number.parseInt(monthStr, 10);

  const startDate = `${yearStr}-${monthStr}-01`;
  // Last day of month
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const endDate = `${yearStr}-${monthStr}-${String(lastDay).padStart(2, "0")}`;

  return { startDate, endDate };
}

/**
 * Generates all 12 period keys and date ranges for a given Indian FY (e.g. "2026-2027").
 */
export function getMonthsForIndianFY(financialYear: string): Array<{
  periodKey: string;
  startDate: string;
  endDate: string;
  monthIndex: number; // 1 to 12 (Apr=1, Mar=12)
}> {
  const [startYearStr, endYearStr] = financialYear.split("-");
  const startYear = Number.parseInt(startYearStr, 10);
  const endYear = Number.parseInt(endYearStr, 10);

  const months: Array<{ periodKey: string; startDate: string; endDate: string; monthIndex: number }> = [];

  // April through December of startYear (months 4..12)
  for (let m = 4; m <= 12; m++) {
    const periodKey = `${startYear}-${String(m).padStart(2, "0")}`;
    const range = getPeriodDateRange(periodKey);
    months.push({
      periodKey,
      startDate: range.startDate,
      endDate: range.endDate,
      monthIndex: m - 3,
    });
  }

  // January through March of endYear (months 1..3)
  for (let m = 1; m <= 3; m++) {
    const periodKey = `${endYear}-${String(m).padStart(2, "0")}`;
    const range = getPeriodDateRange(periodKey);
    months.push({
      periodKey,
      startDate: range.startDate,
      endDate: range.endDate,
      monthIndex: m + 9,
    });
  }

  return months;
}
