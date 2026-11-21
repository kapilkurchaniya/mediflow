"use client";

import { useState } from "react";
import Papa from "papaparse";
import { AlertCircle, CheckCircle2, Package, ArrowRight, Loader2 } from "lucide-react";
import { processInventoryImport, ImportRow } from "@/app/actions/inventory-import";
import { enrichMedicineDetails } from "@/app/actions/ai-enrichment";
import { useRouter } from "next/navigation";
import { CsvDropzone } from "./CsvDropzone";
import { StockOcrButton } from "@/app/dashboard/inventory/batches/_components/StockOcrButton";

type ParsedRow = {
  raw: Record<string, string>;
  mapped: Partial<ImportRow>;
  errors: string[];
  warnings: string[];
};

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

function mapAndValidateRow(row: Record<string, string>): ParsedRow {
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

  const name = getVal(["medicine", "item", "product", "drug", "name", "desc", "item name", "item_name"]).trim();
  const batch = getVal(["batch", "lot", "b.no", "batchno", "batch_no", "batch no"]).trim();
  const exp = getVal(["exp", "expiry", "exp date", "exp_date", "expiry date", "exp.date"]).trim();
  const mfg = getVal(["mfg", "manufacturer", "company", "brand", "mfg by"]).trim();
  const cat = getVal(["category", "group", "type", "schedule"]).trim();

  const rawQty = getVal(["qty", "quantity", "stock", "closing", "cl qty", "balance", "total qty"]);
  const rawMrp = getVal(["mrp", "retail", "sale rate", "salerate", "s.rate", "sale price"]);
  const rawPRate = getVal([
    "ptr", "p.t.r", "purchase rate", "purchase_rate", "purchase price",
    "purchaseprice", "purchaserate", "pur rate", "pur.rate", "pur_rate",
    "p.rate", "prate", "p_rate", "cost price", "cost_price", "cost",
    "unit cost", "buy rate", "buy price", "buying price", "landing cost",
    "landing", "basic rate", "rate",
  ]);

  const qty = parseQtyFromText(rawQty);
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

  if (qty === 0) warnings.push("Quantity is 0");
  if (mrp === 0) warnings.push("MRP is 0");

  return {
    raw: row,
    errors,
    warnings,
    mapped: {
      medicineName: name,
      manufacturer: mfg || undefined,
      category: cat || undefined,
      batchNo: batch,
      expiryDate: formattedExp,
      qty,
      mrp,
      purchaseRate: pRate,
      saleRate,
    },
  };
}

export function QuickStockDropTab() {
  const router = useRouter();
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState("");
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichStats, setEnrichStats] = useState({ enriched: 0, total: 0 });

  const processFile = (file: File) => {
    setIsParsing(true);
    setGlobalError("");
    setFileName(file.name);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: "greedy",
      complete: (results) => {
        const rawRows = (results.data as Record<string, string>[]).filter((r) =>
          Object.values(r).some((v) => v !== null && v !== undefined && String(v).trim().length > 0)
        );
        if (rawRows.length === 0) {
          setGlobalError("The CSV file has no valid data rows.");
          setParsedData([]);
          setIsParsing(false);
          return;
        }
        setParsedData(rawRows.map(mapAndValidateRow));
        setIsParsing(false);
      },
      error: (error) => {
        setGlobalError(error instanceof Error ? error.message : String(error));
        setIsParsing(false);
      },
    });
  };

  const handleImport = async () => {
    const validRows = parsedData.filter((r) => r.errors.length === 0).map((r) => r.mapped as ImportRow);
    if (validRows.length === 0) return;

    setIsImporting(true);
    setGlobalError("");
    const res = await processInventoryImport(validRows);

    if (res.error) {
      setGlobalError(res.error);
      setIsImporting(false);
    } else {
      router.push("/dashboard/inventory/batches");
    }
  };

  const handleEnrichWithAI = async () => {
    setIsEnriching(true);
    let enrichedCount = 0;
    const newData = parsedData.map((r) => ({ ...r, mapped: { ...r.mapped }, warnings: [...r.warnings] }));

    const needsEnrichment = newData.filter(
      (r) =>
        r.mapped.medicineName &&
        (r.mapped.mrp === 0 || !r.mapped.mrp || !r.mapped.manufacturer || r.mapped.manufacturer === "Unknown")
    );

    setEnrichStats({ enriched: 0, total: needsEnrichment.length });
    if (needsEnrichment.length === 0) {
      setIsEnriching(false);
      return;
    }

    for (let i = 0; i < newData.length; i++) {
      const row = newData[i];
      if (
        row.mapped.medicineName &&
        (row.mapped.mrp === 0 || !row.mapped.mrp || !row.mapped.manufacturer || row.mapped.manufacturer === "Unknown")
      ) {
        try {
          const enriched = await enrichMedicineDetails({ medicineName: row.mapped.medicineName });
          if (enriched) {
            newData[i].mapped.manufacturer = enriched.manufacturer;
            newData[i].mapped.category = enriched.category;
            if ((row.mapped.mrp === 0 || !row.mapped.mrp) && enriched.mrp > 0) {
              newData[i].mapped.mrp = enriched.mrp;
              newData[i].mapped.saleRate = enriched.mrp;
              if (!newData[i].mapped.purchaseRate || newData[i].mapped.purchaseRate === 0) {
                newData[i].mapped.purchaseRate = Math.round(enriched.mrp * 0.8);
              }
              newData[i].warnings = newData[i].warnings.filter((w) => w !== "MRP is 0");
            }
            enrichedCount++;
            setEnrichStats((s) => ({ ...s, enriched: enrichedCount }));
          }
        } catch (e) {
          console.error("Enrichment failed for row", i, e);
        }
      }
    }

    setParsedData(newData);
    setIsEnriching(false);
  };

  const validCount = parsedData.filter((r) => r.errors.length === 0).length;
  const invalidCount = parsedData.length - validCount;

  return (
    <div className="space-y-6">
      {globalError && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center gap-2 text-sm">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{globalError}</span>
        </div>
      )}

      {parsedData.length === 0 ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-150 bg-ink-50/60 px-4 py-2.5">
            <p className="text-xs text-ink-600">
              Have a PDF stock sheet or shelf count photo instead of CSV?
            </p>
            <StockOcrButton label="Scan PDF / Image (OCR)" />
          </div>
          <CsvDropzone
            onFileSelected={processFile}
            isLoading={isParsing}
            selectedFileName={fileName}
            title="Drop your stock CSV file here"
            subtitle="Upload flat opening stock CSVs from Marg, Vyapar, or Excel — columns are auto-detected."
            className="p-14"
          />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-500 font-semibold uppercase">Total Rows</div>
                <div className="text-2xl font-bold text-slate-900 mt-1">{parsedData.length}</div>
              </div>
              <div className="h-10 w-10 bg-slate-100 rounded-full flex items-center justify-center">
                <Package className="h-5 w-5 text-slate-600" />
              </div>
            </div>
            <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-200 shadow-2xs flex items-center justify-between">
              <div>
                <div className="text-xs text-emerald-700 font-semibold uppercase">Ready to Import</div>
                <div className="text-2xl font-bold text-emerald-800 mt-1">{validCount}</div>
              </div>
              <div className="h-10 w-10 bg-emerald-100 rounded-full flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
            <div className="bg-red-50/50 p-4 rounded-2xl border border-red-200 shadow-2xs flex items-center justify-between">
              <div>
                <div className="text-xs text-red-700 font-semibold uppercase">Errors Found</div>
                <div className="text-2xl font-bold text-red-800 mt-1">{invalidCount}</div>
              </div>
              <div className="h-10 w-10 bg-red-100 rounded-full flex items-center justify-center">
                <AlertCircle className="h-5 w-5 text-red-600" />
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden flex flex-col max-h-[520px]">
            <div className="overflow-auto flex-1">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50 sticky top-0 shadow-xs z-10">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Status</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Medicine</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Batch</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Expiry</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Qty</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 uppercase">PTR</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 uppercase">MRP</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {parsedData.map((row, idx) => (
                    <tr
                      key={idx}
                      className={
                        row.errors.length > 0
                          ? "bg-red-50/50"
                          : row.warnings.length > 0
                          ? "bg-amber-50/50"
                          : ""
                      }
                    >
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        {row.errors.length > 0 ? (
                          <div className="flex items-center text-red-600 text-xs font-bold" title={row.errors.join(", ")}>
                            <AlertCircle className="h-4 w-4 mr-1" /> Error
                          </div>
                        ) : row.warnings.length > 0 ? (
                          <div className="flex items-center text-amber-600 text-xs font-bold" title={row.warnings.join(", ")}>
                            <AlertCircle className="h-4 w-4 mr-1" /> Warning
                          </div>
                        ) : (
                          <div className="flex items-center text-emerald-600 text-xs font-bold">
                            <CheckCircle2 className="h-4 w-4 mr-1" /> OK
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-sm font-medium text-slate-900">
                        {row.mapped.medicineName || <span className="text-red-400 italic">Missing</span>}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-sm text-slate-600 font-mono">
                        {row.mapped.batchNo || <span className="text-red-400 italic">Missing</span>}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-sm text-slate-600">
                        {row.mapped.expiryDate || <span className="text-red-400 italic">Missing</span>}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-sm text-right font-medium">
                        {row.mapped.qty}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-sm text-right text-slate-600">
                        ₹{((row.mapped.purchaseRate || 0) / 100).toFixed(2)}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-sm text-right text-slate-900 font-medium">
                        ₹{((row.mapped.mrp || 0) / 100).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex flex-wrap gap-3 justify-between items-center">
              <button
                type="button"
                onClick={() => {
                  setParsedData([]);
                  setFileName(null);
                  setGlobalError("");
                }}
                className="btn btn-secondary btn-sm"
                disabled={isImporting}
              >
                Clear / Upload Another
              </button>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleEnrichWithAI}
                  className="px-4 py-2 text-sm font-medium text-brand-700 bg-brand-50 hover:bg-brand-100 rounded-lg transition-colors flex items-center"
                  disabled={isImporting || isEnriching || parsedData.length === 0}
                >
                  {isEnriching ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" /> AI Enriching ({enrichStats.enriched}/{enrichStats.total})…
                    </>
                  ) : (
                    <>Auto-Enrich Missing Data</>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleImport}
                  disabled={validCount === 0 || isImporting || isEnriching}
                  className="btn btn-primary btn-sm px-5 flex items-center gap-1.5"
                >
                  {isImporting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Importing…
                    </>
                  ) : (
                    <>
                      {validCount < parsedData.length ? `Import ${validCount} Valid Rows` : "Import All Data"}
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

