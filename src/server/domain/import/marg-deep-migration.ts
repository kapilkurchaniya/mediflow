/**
 * Deeper Marg ERP Migration Parsers (N4):
 * Parses open party bills (receivables/payables), PDC register rows, and pending expiry/breakage claims.
 */
export interface MigratedOpenBill {
  partyType: "customer" | "supplier";
  partyName: string;
  billNo: string;
  billDate: string;
  pendingAmountPaise: number;
}

export interface MigratedPdcRow {
  direction: "inward" | "outward";
  partyName: string;
  chequeNo: string;
  chequeDate: string;
  bankName: string;
  amountPaise: number;
}

function toPaise(raw: string | undefined): number {
  const cleaned = (raw ?? "").replace(/[^\d.-]/g, "");
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? Math.round(num * 100) : 0;
}

export function parseMargOpenBillsCsv(csvText: string): MigratedOpenBill[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const results: MigratedOpenBill[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    if (cols.length < 5) continue;
    const typeNorm = cols[0].toLowerCase().includes("sup") || cols[0].toLowerCase().includes("pay")
      ? "supplier"
      : "customer";
    const pendingAmountPaise = toPaise(cols[4]);
    if (pendingAmountPaise <= 0) continue;
    results.push({
      partyType: typeNorm,
      partyName: cols[1],
      billNo: cols[2],
      billDate: cols[3],
      pendingAmountPaise,
    });
  }
  return results;
}

export function parseMargPdcCsv(csvText: string): MigratedPdcRow[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const results: MigratedPdcRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    if (cols.length < 6) continue;
    const amountPaise = toPaise(cols[5]);
    if (amountPaise <= 0) continue;
    results.push({
      direction: cols[0].toLowerCase().includes("out") ? "outward" : "inward",
      partyName: cols[1],
      chequeNo: cols[2],
      chequeDate: cols[3],
      bankName: cols[4],
      amountPaise,
    });
  }
  return results;
}
