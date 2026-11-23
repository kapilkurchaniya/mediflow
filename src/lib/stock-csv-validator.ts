import Papa from "papaparse";
import type { ImportRow } from "@/app/actions/inventory-import";
import { parsePackaging } from "@/lib/packaging";

export type ParsedStockRow = {
  raw: Record<string, string>;
  mapped: Partial<ImportRow>;
  errors: string[];
  warnings: string[];
  isSolidDoseCandidate?: boolean;
};

const CSV_EXTENSIONS = [".csv", ".tsv", ".txt"];
const MEDIA_OR_PDF_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".heic"];
const BINARY_SPREADSHEET_EXTENSIONS = [".xlsx", ".xls", ".xlsm", ".ods", ".numbers"];

export function validateStockCsvMetadata(file: File, maxSizeMb = 50): string | null {
  const lower = file.name.toLowerCase();
  if (MEDIA_OR_PDF_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    return `"${file.name}" is an image or PDF. Use "Scan PDF / Image (OCR)" instead of CSV import.`;
  }
  if (BINARY_SPREADSHEET_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    return `"${file.name}" is a binary spreadsheet. Please save/export it as a .csv file first.`;
  }
  const hasAllowedExt = CSV_EXTENSIONS.some((ext) => lower.endsWith(ext));
  const hasAllowedMime =
    file.type === "text/csv" ||
    file.type === "text/tab-separated-values" ||
    file.type === "text/plain" ||
    file.type === "application/vnd.ms-excel";

  if (!hasAllowedExt && !hasAllowedMime) {
    return `Unsupported file "${file.name}". Please drop a valid .csv, .tsv, or .txt stock file.`;
  }
  if (file.size === 0) {
    return `"${file.name}" is empty.`;
  }
  if (file.size > maxSizeMb * 1024 * 1024) {
    return `File "${file.name}" exceeds the ${maxSizeMb} MB limit.`;
  }
  return null;
}

export async function detectBinaryContentMismatch(file: File): Promise<string | null> {
  try {
    const buf = await file.slice(0, 4096).arrayBuffer();
    const bytes = new Uint8Array(buf);
    if (bytes.length === 0) return `"${file.name}" is empty.`;

    // %PDF
    if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
      return `"${file.name}" is actually a PDF document. Use "Scan PDF / Image (OCR)" instead.`;
    }
    // ZIP / XLSX / DOCX (PK\x03\x04)
    if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
      return `"${file.name}" is a binary ZIP/Excel (.xlsx) file. Please export it as plain-text .csv first.`;
    }
    // PNG
    if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
      return `"${file.name}" is a PNG image. Use "Scan PDF / Image (OCR)" instead.`;
    }
    // JPEG
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return `"${file.name}" is a JPEG image. Use "Scan PDF / Image (OCR)" instead.`;
    }
    // GIF / WEBP
    if (bytes.length >= 4 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
      return `"${file.name}" is an image file, not a CSV.`;
    }
    if (
      bytes.length >= 12 &&
      bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
    ) {
      return `"${file.name}" is a WebP image. Use "Scan PDF / Image (OCR)" instead.`;
    }
    // Null bytes indicate a binary file (e.g. .xls, executable, etc.)
    for (let i = 0; i < bytes.length; i++) {
      if (bytes[i] === 0x00) {
        return `"${file.name}" appears to be a binary file, not a plain-text CSV.`;
      }
    }
  } catch {
    // ignore slice errors and let PapaParse validate text
  }
  return null;
}

function parsePaiseFromText(raw: unknown): number {
  if (raw === null || raw === undefined) return 0;
  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw >= 0 ? Math.round(raw * 100) : 0;
  }
  const str = String(raw).trim();
  if (!str) return 0;
  const cleaned = str
    .replace(/[₹$€£\s]/g, "")
    .replace(/Rs\.?/gi, "")
    .replace(/\/-\s*$/, "")
    .replace(/,/g, "");
  const num = parseFloat(cleaned);
  return Number.isFinite(num) && num >= 0 ? Math.round(num * 100) : 0;
}

function parseQtyFromText(raw: unknown): number {
  if (raw === null || raw === undefined) return 0;
  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw >= 0 ? Math.round(raw) : 0;
  }
  const str = String(raw).trim().replace(/,/g, "");
  const num = parseInt(str, 10);
  return Number.isFinite(num) && num >= 0 ? num : 0;
}

function parseDate(dateStr: string): string {
  try {
    if (!dateStr) return "";
    let s = dateStr.trim();
    s = s.replace(/^(exp(iry)?\.?|d\.?o\.?e\.?|val(idity)?\.?)\s*[:.-]?\s*/i, "").trim();

    const MONTH_MAP: Record<string, number> = {
      jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
      jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
    };

    const monthNameMatch = s.match(/(?:(\d{1,2})[-/.\s]+)?([a-zA-Z]{3,9})[-/.\s]+(\d{2,4})/);
    if (monthNameMatch) {
      const dStr = monthNameMatch[1];
      const mStr = monthNameMatch[2].slice(0, 3).toLowerCase();
      let y = parseInt(monthNameMatch[3], 10);
      if (y < 100) y += 2000;
      const m = MONTH_MAP[mStr];
      if (m) {
        let d = dStr ? parseInt(dStr, 10) : new Date(y, m, 0).getDate();
        if (d > 31) d = new Date(y, m, 0).getDate();
        return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      }
    }

    const dmy = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
    if (dmy) {
      const d = parseInt(dmy[1], 10);
      const m = parseInt(dmy[2], 10);
      const y = parseInt(dmy[3], 10);
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      }
    }

    const dmyShort = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})$/);
    if (dmyShort) {
      const d = parseInt(dmyShort[1], 10);
      const m = parseInt(dmyShort[2], 10);
      const y = parseInt(dmyShort[3], 10) + 2000;
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      }
    }

    const iso = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (iso) {
      const y = parseInt(iso[1], 10);
      const m = parseInt(iso[2], 10);
      const d = parseInt(iso[3], 10);
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      }
    }

    const ym = s.match(/^(\d{4})[-/.](\d{1,2})$/);
    if (ym) {
      const y = parseInt(ym[1], 10);
      const m = parseInt(ym[2], 10);
      if (m >= 1 && m <= 12) {
        const lastDay = new Date(y, m, 0).getDate();
        return `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      }
    }

    const my = s.match(/^(\d{1,2})[-/.](\d{2}|\d{4})$/);
    if (my) {
      let month = parseInt(my[1], 10);
      let year = parseInt(my[2], 10);
      if (month > 12 && year <= 12) {
        const tmp = month;
        month = year;
        year = tmp;
      }
      if (year < 100) year += 2000;
      if (month >= 1 && month <= 12) {
        const lastDay = new Date(year, month, 0).getDate();
        return `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      }
    }

    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  } catch {
    // ignore parse failure
  }
  return "";
}

const MEDICINE_NAME_KEYS = ["medicine", "item", "product", "drug", "name", "desc", "item name", "item_name"];
const STOCK_SIGNAL_KEYS = [
  "batch", "lot", "b.no", "batchno", "batch_no", "batch no",
  "exp", "expiry", "exp date", "exp_date", "expiry date", "exp.date",
  "qty", "quantity", "stock", "closing", "cl qty", "balance", "total qty",
  "mrp", "ptr", "p.t.r", "purchase rate", "purchase_rate", "rate",
];

function matchesAnyHeaderKey(headers: string[], keys: string[]): boolean {
  return headers.some((h) => {
    const clean = h.trim().toLowerCase();
    return keys.some((key) => clean === key || clean.includes(key));
  });
}

export function mapAndValidateStockRow(row: Record<string, string>): ParsedStockRow {
  const errors: string[] = [];
  const warnings: string[] = [];

  const getVal = (keys: string[]) => {
    const rowKeys = Object.keys(row);
    for (const k of rowKeys) {
      const cleanK = k.trim().toLowerCase();
      if (keys.some((key) => cleanK === key)) return row[k] ?? "";
    }
    for (const k of rowKeys) {
      const cleanK = k.trim().toLowerCase();
      if (keys.some((key) => cleanK.includes(key))) return row[k] ?? "";
    }
    return "";
  };

  const name = getVal(MEDICINE_NAME_KEYS).trim();
  const batch = getVal(["batch", "lot", "b.no", "batchno", "batch_no", "batch no"]).trim();
  const exp = getVal(["exp", "expiry", "exp date", "exp_date", "expiry date", "exp.date"]).trim();
  const mfg = getVal(["mfg", "manufacturer", "company", "brand", "mfg by"]).trim();
  const cat = getVal(["category", "group", "type", "schedule"]).trim();
  const rawPack = getVal([
    "units_per_pack", "units per pack", "unitsperpack",
    "pack_size", "pack size", "packing", "strip size", "u/p", "conv", "pack",
  ]).trim();
  const packaging = parsePackaging({ packRaw: rawPack, medicineName: name });
  const parsedUpp = packaging.unitsPerPack;
  if (packaging.warning) {
    warnings.push(packaging.warning);
  }

  const rawQty = getVal(["qty", "quantity", "stock", "closing", "cl qty", "balance", "total qty", "strips", "packs"]);
  const rawLoose = getVal(["loose", "loose_qty", "loose qty", "loose_units", "loose units", "tablets"]);
  const rawMrp = getVal(["mrp", "retail", "sale rate", "salerate", "s.rate", "sale price"]);
  const rawPRate = getVal([
    "ptr", "p.t.r", "purchase rate", "purchase_rate", "purchase price",
    "purchaseprice", "purchaserate", "pur rate", "pur.rate", "pur_rate",
    "p.rate", "prate", "p_rate", "cost price", "cost_price", "cost",
    "unit cost", "buy rate", "buy price", "buying price", "landing cost",
    "landing", "basic rate", "rate",
  ]);

  const rawQtyText = String(rawQty ?? "").trim().replace(/,/g, "");
  const qty = parseQtyFromText(rawQty);
  const looseQty = parseQtyFromText(rawLoose);
  const mrp = parsePaiseFromText(rawMrp);
  let pRate = parsePaiseFromText(rawPRate);
  if (pRate === 0 && mrp > 0) {
    pRate = Math.round(mrp * 0.8);
    warnings.push("PTR estimated at 80% MRP");
  }
  const saleRate = mrp > 0 ? mrp : pRate > 0 ? Math.round(pRate * 1.25) : 0;

  if (!name) errors.push("Missing Medicine Name");
  if (!batch) errors.push("Missing Batch Number");

  let formattedExp = "";
  if (!exp) {
    errors.push("Missing Expiry Date");
  } else {
    formattedExp = parseDate(exp);
    if (!formattedExp) errors.push(`Invalid Expiry Format: ${exp}`);
  }

  if (qty === 0 && looseQty === 0) warnings.push("Quantity is 0");
  if (mrp === 0) warnings.push("MRP is 0");

  return {
    raw: row,
    errors,
    warnings,
    isSolidDoseCandidate: packaging.isSolidDoseCandidate,
    mapped: {
      medicineName: name,
      unitsPerPack: parsedUpp,
      packUnit: packaging.packUnit,
      looseUnit: packaging.looseUnit,
      ...(packaging.packSize ? { packSize: packaging.packSize } : {}),
      manufacturer: mfg || undefined,
      category: cat || undefined,
      batchNo: batch,
      expiryDate: formattedExp,
      qty,
      ...(rawQtyText ? { rawQtyText } : {}),
      ...(looseQty > 0 ? { looseQty } : {}),
      mrp,
      purchaseRate: pRate,
      saleRate,
    },
  };
}

export async function validateAndParseStockCsvFile(file: File): Promise<{
  rows: ParsedStockRow[];
  error?: string;
}> {
  const metaErr = validateStockCsvMetadata(file);
  if (metaErr) return { rows: [], error: metaErr };

  const binaryErr = await detectBinaryContentMismatch(file);
  if (binaryErr) return { rows: [], error: binaryErr };

  const text = await file.text();
  return validateAndParseStockCsvText(text, file.name);
}

export function validateAndParseStockCsvText(
  csvText: string,
  fileName = "file.csv"
): { rows: ParsedStockRow[]; error?: string } {
  const trimmed = csvText.trim();
  if (!trimmed) {
    return { rows: [], error: `"${fileName}" is empty.` };
  }

  const results = Papa.parse<Record<string, string>>(trimmed, {
    header: true,
    skipEmptyLines: "greedy",
  });

  const fields = (results.meta.fields ?? []).map((f) => f.trim()).filter(Boolean);
  if (fields.length < 2) {
    return {
      rows: [],
      error: `"${fileName}" does not appear to be a valid delimited CSV/TSV file (found ${fields.length} column).`,
    };
  }

  const hasMedicineCol = matchesAnyHeaderKey(fields, MEDICINE_NAME_KEYS);
  const hasStockSignalCol = matchesAnyHeaderKey(fields, STOCK_SIGNAL_KEYS);
  if (!hasMedicineCol || !hasStockSignalCol) {
    const previewCols = fields.slice(0, 6).join(", ");
    return {
      rows: [],
      error: `"${fileName}" does not look like a stock/batch CSV (found columns: ${previewCols}). Expected a medicine/item column plus batch, expiry, quantity, or MRP columns.`,
    };
  }

  const rawRows = (results.data ?? []).filter((r) =>
    Object.values(r).some((v) => v !== null && v !== undefined && String(v).trim().length > 0)
  );
  if (rawRows.length === 0) {
    return { rows: [], error: `"${fileName}" has headers but no data rows.` };
  }

  const mapped = rawRows.map(mapAndValidateStockRow);
  const hasAnyMedicine = mapped.some((r) => Boolean(r.mapped.medicineName));
  if (!hasAnyMedicine) {
    return {
      rows: [],
      error: `"${fileName}" did not contain any valid medicine names.`,
    };
  }

  return { rows: mapped };
}
