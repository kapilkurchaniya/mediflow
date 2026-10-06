/** Presentation helpers. All monetary values in the DB are stored in paise. */

const inr = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const inrCompact = new Intl.NumberFormat("en-IN", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/** 123456 (paise) -> "₹1,234.56" */
export function formatINR(paise: number | null | undefined): string {
  return `₹${inr.format((paise ?? 0) / 100)}`;
}

/** 12345600 (paise) -> "₹1.2L" style compact figure */
export function formatINRCompact(paise: number | null | undefined): string {
  return `₹${inrCompact.format((paise ?? 0) / 100)}`;
}

export function formatNumber(n: number | null | undefined): string {
  return new Intl.NumberFormat("en-IN").format(n ?? 0);
}

export function initials(name: string | null | undefined): string {
  if (!name) return "—";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/** Days from today until the given date (negative if past). */
export function daysUntil(date: string | Date): number {
  const d = typeof date === "string" ? new Date(date) : date;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}
