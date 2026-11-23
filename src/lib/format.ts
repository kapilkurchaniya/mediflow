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

export interface QuantityBreakdown {
  qty: number;
  packQty?: number | null;
  looseQty?: number | null;
  unitsPerPack?: number | null;
  packUnit?: string | null;
  looseUnit?: string | null;
}

/** Formats pharmacy pack & loose unit quantities clearly for invoices and receipts (e.g. "3 Tablets", "1 Strip + 4 Tablets", "2 Strips"). */
export function formatItemQuantity(item: QuantityBreakdown): string {
  const upp = Math.max(1, item.unitsPerPack ?? 1);
  const pUnit = (item.packUnit || "strip").trim();
  const lUnit = (item.looseUnit || "tablet").trim();

  if (upp === 1) {
    const unitName = pUnit.toLowerCase() === "strip" ? "unit" : pUnit;
    return `${item.qty} ${item.qty === 1 ? unitName : unitName + "s"}`;
  }

  const pQty = item.packQty !== undefined && item.packQty !== null ? item.packQty : Math.floor(item.qty / upp);
  const lQty = item.looseQty !== undefined && item.looseQty !== null ? item.looseQty : item.qty % upp;

  if (pQty > 0 && lQty > 0) {
    const packStr = `${pQty} ${pQty === 1 ? pUnit : pUnit + "s"}`;
    const looseStr = `${lQty} ${lQty === 1 ? lUnit : lUnit + "s"}`;
    return `${packStr} + ${looseStr}`;
  }

  if (pQty > 0) {
    return `${pQty} ${pQty === 1 ? pUnit : pUnit + "s"}`;
  }

  return `${lQty} ${lQty === 1 ? lUnit : lUnit + "s"}`;
}

/** Compact format for 80mm thermal slips (e.g. "3 Tab", "1 Str + 4 Tab", "2 Str") */
export function formatItemQuantityCompact(item: QuantityBreakdown): string {
  const upp = Math.max(1, item.unitsPerPack ?? 1);
  const pUnit = (item.packUnit || "Str").slice(0, 3);
  const lUnit = (item.looseUnit || "Tab").slice(0, 3);

  if (upp === 1) {
    return `${item.qty} ${pUnit}`;
  }

  const pQty = item.packQty !== undefined && item.packQty !== null ? item.packQty : Math.floor(item.qty / upp);
  const lQty = item.looseQty !== undefined && item.looseQty !== null ? item.looseQty : item.qty % upp;

  if (pQty > 0 && lQty > 0) {
    return `${pQty} ${pUnit} + ${lQty} ${lUnit}`;
  }
  if (pQty > 0) {
    return `${pQty} ${pUnit}`;
  }
  return `${lQty} ${lUnit}`;
}

const IST_TZ = "Asia/Kolkata";

function toValidDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value);
}

function normalizeMeridiem(str: string): string {
  return str.replace(/\b(am|pm)\b/gi, (m) => m.toUpperCase());
}

/** Formats a date/time deterministically in Indian Standard Time (Asia/Kolkata). */
export function formatISTDateTime(
  value: Date | string | number,
  style: "long" | "short" | "compact" | "numeric" = "short"
): string {
  const d = toValidDate(value);
  if (Number.isNaN(d.getTime())) return "—";

  if (style === "compact") {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: IST_TZ,
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
    return parts.replace(",", "");
  }

  if (style === "numeric") {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: IST_TZ,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
    return parts.replace(",", "");
  }

  const dateFormatted = new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TZ,
    day: style === "long" ? "numeric" : "2-digit",
    month: style === "long" ? "long" : "short",
    year: "numeric",
  }).format(d);

  return `${dateFormatted}, ${formatISTTime(d)}`;
}

/** Formats a calendar date deterministically in Indian Standard Time (Asia/Kolkata). */
export function formatISTDate(
  value: Date | string | number,
  style: "medium" | "numeric" | "compact" = "medium"
): string {
  const d = toValidDate(value);
  if (Number.isNaN(d.getTime())) return "—";

  if (style === "numeric") {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: IST_TZ,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(d);
  }

  if (style === "compact") {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: IST_TZ,
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    }).format(d);
  }

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

/** Formats a time of day deterministically in Indian Standard Time (Asia/Kolkata). */
export function formatISTTime(value: Date | string | number): string {
  const d = toValidDate(value);
  if (Number.isNaN(d.getTime())) return "—";

  const formatted = new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(d);

  return normalizeMeridiem(formatted);
}
