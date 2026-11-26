export interface ParsedPackBarcode {
  format: "gs1" | "h2_qr" | "plain";
  gtin: string | null;
  batchNo: string | null;
  expiryDate: string | null; // YYYY-MM-DD
  serialNo: string | null;
  raw: string;
}

function parseGs1Expiry(yymmdd: string): string | null {
  if (!/^\d{6}$/.test(yymmdd)) return null;
  const yy = parseInt(yymmdd.slice(0, 2), 10);
  const mm = yymmdd.slice(2, 4);
  const dd = yymmdd.slice(4, 6);
  const year = yy >= 70 ? 1900 + yy : 2000 + yy;
  if (dd === "00") {
    const lastDay = new Date(year, parseInt(mm, 10), 0).getDate();
    return `${year}-${mm}-${String(lastDay).padStart(2, "0")}`;
  }
  return `${year}-${mm}-${dd}`;
}

/**
 * Parses Schedule H2 QR codes (JSON or query-param URL) and GS1-128 / DataMatrix strings
 * containing AIs (01) GTIN, (10) Batch, (17) Expiry YYMMDD, (21) Serial (B10).
 */
export function parsePackBarcode(rawInput: string): ParsedPackBarcode {
  const raw = rawInput.trim();
  if (!raw) {
    return { format: "plain", gtin: null, batchNo: null, expiryDate: null, serialNo: null, raw };
  }

  // 1. Schedule H2 QR JSON payload
  if (raw.startsWith("{")) {
    try {
      const obj = JSON.parse(raw) as Record<string, unknown>;
      const batchNo = typeof obj.batch === "string" ? obj.batch : typeof obj.batchNo === "string" ? obj.batchNo : null;
      const gtin = typeof obj.gtin === "string" ? obj.gtin : null;
      const expiryDate = typeof obj.expiry === "string" ? obj.expiry : typeof obj.exp === "string" ? obj.exp : null;
      const serialNo = typeof obj.serial === "string" ? obj.serial : null;
      return { format: "h2_qr", gtin, batchNo, expiryDate, serialNo, raw };
    } catch {
      // fall through
    }
  }

  // 2. Schedule H2 URL payload (e.g. https://.../verify?gtin=...&batch=...&exp=...)
  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      const gtin = url.searchParams.get("gtin") || url.searchParams.get("01");
      const batchNo = url.searchParams.get("batch") || url.searchParams.get("bn") || url.searchParams.get("10");
      const expRaw = url.searchParams.get("exp") || url.searchParams.get("expiry") || url.searchParams.get("17");
      const serialNo = url.searchParams.get("serial") || url.searchParams.get("sn") || url.searchParams.get("21");
      const expiryDate = expRaw && /^\d{6}$/.test(expRaw) ? parseGs1Expiry(expRaw) : expRaw;
      if (gtin || batchNo) {
        return { format: "h2_qr", gtin, batchNo, expiryDate, serialNo, raw };
      }
    } catch {
      // fall through
    }
  }

  // 3. GS1 human-readable with parentheses: (01)08901234567890(17)271231(10)B123(21)S99
  if (raw.includes("(01)") || raw.includes("(10)") || raw.includes("(17)")) {
    const gtinMatch = raw.match(/\(01\)(\d{14})/);
    const expMatch = raw.match(/\(17\)(\d{6})/);
    const batchMatch = raw.match(/\(10\)([^\(]{1,20})/);
    const serialMatch = raw.match(/\(21\)([^\(]{1,20})/);
    return {
      format: "gs1",
      gtin: gtinMatch?.[1] ?? null,
      batchNo: batchMatch?.[1]?.trim() ?? null,
      expiryDate: expMatch ? parseGs1Expiry(expMatch[1]) : null,
      serialNo: serialMatch?.[1]?.trim() ?? null,
      raw,
    };
  }

  // 4. GS1 raw FNC1 (\x1d) or unbracketed starting with 01 + 14 digits
  const gs1RawMatch = raw.match(/^01(\d{14})(?:17(\d{6}))?(?:10([^\x1d]{1,20}))?(?:\x1d?21([^\x1d]{1,20}))?/);
  if (gs1RawMatch) {
    return {
      format: "gs1",
      gtin: gs1RawMatch[1],
      expiryDate: gs1RawMatch[2] ? parseGs1Expiry(gs1RawMatch[2]) : null,
      batchNo: gs1RawMatch[3]?.trim() ?? null,
      serialNo: gs1RawMatch[4]?.trim() ?? null,
      raw,
    };
  }

  return { format: "plain", gtin: null, batchNo: null, expiryDate: null, serialNo: null, raw };
}
