"use client";

import { useState, useRef } from "react";
import Papa from "papaparse";
import { Upload, AlertCircle, CheckCircle2, Package, ArrowRight, Loader2 } from "lucide-react";
import { processInventoryImport, ImportRow } from "@/app/actions/inventory-import";
import { enrichMedicineDetails } from "@/app/actions/ai-enrichment";
import { useRouter } from "next/navigation";

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
  // Clean currency symbols (₹, Rs., $, etc.), commas, spaces, trailing /-, etc.
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

export default function SmartImportPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedRow[]>([]);
  const [globalError, setGlobalError] = useState("");
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichStats, setEnrichStats] = useState({ enriched: 0, total: 0 });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsing(true);
    setGlobalError("");

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows: ParsedRow[] = (results.data as Record<string, string>[]).map((row) => {
          return mapAndValidateRow(row);
        });
        setParsedData(rows);
        setIsParsing(false);
      },
      error: (error) => {
        setGlobalError((error instanceof Error ? error.message : String(error)));
        setIsParsing(false);
      }
    });
  };

  const mapAndValidateRow = (row: Record<string, string>): ParsedRow => {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Fuzzy matching helpers: try exact match first, then substring
    const getVal = (keys: string[]) => {
      const rowKeys = Object.keys(row);
      for (const k of rowKeys) {
        const cleanK = k.trim().toLowerCase();
        if (keys.some(key => cleanK === key)) return row[k];
      }
      for (const k of rowKeys) {
        const cleanK = k.trim().toLowerCase();
        if (keys.some(key => cleanK.includes(key))) return row[k];
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
      "ptr",
      "p.t.r",
      "purchase rate",
      "purchase_rate",
      "purchase price",
      "purchaseprice",
      "purchaserate",
      "pur rate",
      "pur.rate",
      "pur_rate",
      "p.rate",
      "prate",
      "p_rate",
      "cost price",
      "cost_price",
      "cost",
      "unit cost",
      "buy rate",
      "buy price",
      "buying price",
      "landing cost",
      "landing",
      "basic rate",
      "rate",
    ]);

    const qty = parseQtyFromText(rawQty);
    const mrp = parsePaiseFromText(rawMrp);
    let pRate = parsePaiseFromText(rawPRate);
    // If purchase rate was not in the CSV, calculate standard Indian pharmacy PTR (80% of MRP)
    if (pRate === 0 && mrp > 0) {
      pRate = Math.round(mrp * 0.8);
      warnings.push("PTR estimated at 80% MRP");
    }
    const saleRate = mrp > 0 ? mrp : (pRate > 0 ? Math.round(pRate * 1.25) : 0);
    
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
        saleRate
      }
    };
  };

  const parseDate = (dateStr: string): string => {
    try {
      if (!dateStr) return "";
      let s = dateStr.trim();
      // Strip common prefixes like 'EXP:', 'EXPIRY', 'EXP', 'D.O.E', etc.
      s = s.replace(/^(exp(iry)?\.?|d\.?o\.?e\.?|val(idity)?\.?)\s*[:.-]?\s*/i, "").trim();

      const MONTH_MAP: Record<string, number> = {
        jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
        jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
      };

      // 1. Month name with year: e.g. 'MAY 2027', 'MAY-27', 'MAY/2027', '05-MAY-2027', '27-MAY-2027'
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

      // 2. Full date DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
      const dmy = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
      if (dmy) {
        const d = parseInt(dmy[1], 10);
        const m = parseInt(dmy[2], 10);
        const y = parseInt(dmy[3], 10);
        if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
          return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        }
      }

      // 3. Short full date DD/MM/YY
      const dmyShort = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})$/);
      if (dmyShort) {
        const d = parseInt(dmyShort[1], 10);
        const m = parseInt(dmyShort[2], 10);
        const y = parseInt(dmyShort[3], 10) + 2000;
        if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
          return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        }
      }

      // 4. ISO YYYY-MM-DD
      const iso = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
      if (iso) {
        const y = parseInt(iso[1], 10);
        const m = parseInt(iso[2], 10);
        const d = parseInt(iso[3], 10);
        if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
          return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        }
      }

      // 5. YYYY/MM or YYYY-MM
      const ym = s.match(/^(\d{4})[-/.](\d{1,2})$/);
      if (ym) {
        const y = parseInt(ym[1], 10);
        const m = parseInt(ym[2], 10);
        if (m >= 1 && m <= 12) {
          const lastDay = new Date(y, m, 0).getDate();
          return `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
        }
      }

      // 6. Month & Year: MM/YY or MM/YYYY or MM-YY or MM-YYYY
      const my = s.match(/^(\d{1,2})[-/.](\d{2}|\d{4})$/);
      if (my) {
        let month = parseInt(my[1], 10);
        let year = parseInt(my[2], 10);
        // Handle YY/MM reversal if first number was > 12
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

      // Native JS parse fallback
      const d = new Date(s);
      if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
    } catch {}
    return "";
  };

  const handleImport = async () => {
    const validRows = parsedData.filter(r => r.errors.length === 0).map(r => r.mapped as ImportRow);
    if (validRows.length === 0) return;

    setIsImporting(true);
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
    
    // Create a copy of the data
    const newData = [...parsedData];
    
    // Find rows that need enrichment (e.g. missing MRP or manufacturer)
    const needsEnrichment = newData.filter(r => 
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
      if (row.mapped.medicineName && (row.mapped.mrp === 0 || !row.mapped.mrp || !row.mapped.manufacturer || row.mapped.manufacturer === "Unknown")) {
        try {
          const enriched = await enrichMedicineDetails({ medicineName: row.mapped.medicineName });
          if (enriched) {
            newData[i].mapped.manufacturer = enriched.manufacturer;
            newData[i].mapped.category = enriched.category;
            
            if ((row.mapped.mrp === 0 || !row.mapped.mrp) && enriched.mrp > 0) {
              newData[i].mapped.mrp = enriched.mrp;
              newData[i].mapped.saleRate = enriched.mrp; // Set sale rate to MRP
              if (!newData[i].mapped.purchaseRate || newData[i].mapped.purchaseRate === 0) {
                newData[i].mapped.purchaseRate = Math.round(enriched.mrp * 0.8);
              }
              
              // Remove "MRP is 0" warning
              newData[i].warnings = newData[i].warnings.filter(w => w !== "MRP is 0");
            }
            
            enrichedCount++;
            setEnrichStats(s => ({ ...s, enriched: enrichedCount }));
          }
        } catch (e) {
          console.error("Enrichment failed for row", i, e);
        }
      }
    }
    
    setParsedData(newData);
    setIsEnriching(false);
  };

  const validCount = parsedData.filter(r => r.errors.length === 0).length;
  const invalidCount = parsedData.length - validCount;

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Smart Stock Import</h1>
          <p className="text-slate-500 mt-1">Upload CSV from Marg, Vyapar, or any custom format.</p>
        </div>
      </div>

      {globalError && (
        <div className="p-4 bg-red-50 text-red-600 rounded-xl flex items-center">
          <AlertCircle className="h-5 w-5 mr-2" />
          {globalError}
        </div>
      )}

      {parsedData.length === 0 ? (
        <div 
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-brand-200 rounded-3xl p-16 text-center hover:bg-brand-50 hover:border-brand-300 transition-all cursor-pointer bg-white"
        >
          <input 
            type="file" 
            accept=".csv" 
            ref={fileInputRef} 
            className="hidden" 
            onChange={handleFileUpload}
          />
          <div className="mx-auto h-16 w-16 bg-brand-100 rounded-full flex items-center justify-center mb-6">
            {isParsing ? <Loader2 className="h-8 w-8 text-brand-600 animate-spin" /> : <Upload className="h-8 w-8 text-brand-600" />}
          </div>
          <h3 className="text-xl font-bold text-slate-800 mb-2">Drop your CSV file here</h3>
          <p className="text-slate-500 max-w-sm mx-auto">
            Don&apos;t worry about templates. Our AI-driven parser will auto-detect your columns.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
              <div>
                <div className="text-sm text-slate-500 font-medium">Total Rows</div>
                <div className="text-2xl font-bold text-slate-900 mt-1">{parsedData.length}</div>
              </div>
              <div className="h-10 w-10 bg-slate-100 rounded-full flex items-center justify-center">
                <Package className="h-5 w-5 text-slate-600" />
              </div>
            </div>
            <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 shadow-sm flex items-center justify-between">
              <div>
                <div className="text-sm text-emerald-600 font-medium">Ready to Import</div>
                <div className="text-2xl font-bold text-emerald-700 mt-1">{validCount}</div>
              </div>
              <div className="h-10 w-10 bg-emerald-100 rounded-full flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
            <div className="bg-red-50 p-4 rounded-2xl border border-red-100 shadow-sm flex items-center justify-between">
              <div>
                <div className="text-sm text-red-600 font-medium">Errors Found</div>
                <div className="text-2xl font-bold text-red-700 mt-1">{invalidCount}</div>
              </div>
              <div className="h-10 w-10 bg-red-100 rounded-full flex items-center justify-center">
                <AlertCircle className="h-5 w-5 text-red-600" />
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col h-[500px]">
            <div className="overflow-x-auto flex-1">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50 sticky top-0 shadow-sm z-10">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Medicine</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Batch</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Expiry</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Qty</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase">PTR</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase">MRP</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {parsedData.map((row, idx) => (
                    <tr key={idx} className={row.errors.length > 0 ? "bg-red-50/50" : row.warnings.length > 0 ? "bg-amber-50/50" : ""}>
                      <td className="px-6 py-4 whitespace-nowrap">
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
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                        {row.mapped.medicineName || <span className="text-red-400 italic">Missing</span>}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                        {row.mapped.batchNo || <span className="text-red-400 italic">Missing</span>}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                        {row.mapped.expiryDate || <span className="text-red-400 italic">Missing</span>}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium">
                        {row.mapped.qty}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-slate-600">
                        ₹{((row.mapped.purchaseRate || 0)/100).toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-slate-900 font-medium">
                        ₹{((row.mapped.mrp || 0)/100).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-between items-center">
              <button 
                onClick={() => setParsedData([])}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                disabled={isImporting}
              >
                Cancel
              </button>
              
              <button 
                onClick={handleEnrichWithAI}
                className="px-4 py-2 text-sm font-medium text-brand-600 bg-brand-50 hover:bg-brand-100 rounded-lg transition-colors flex items-center"
                disabled={isImporting || isEnriching || parsedData.length === 0}
              >
                {isEnriching ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> AI Enriching ({enrichStats.enriched}/{enrichStats.total})...</>
                ) : (
                  <>✨ Auto-Enrich Missing Data</>
                )}
              </button>
              
              <button
                onClick={handleImport}
                disabled={validCount === 0 || isImporting}
                className="px-6 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg shadow-sm flex items-center transition-colors disabled:opacity-50"
              >
                {isImporting ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Importing...</>
                ) : (
                  <>{validCount < parsedData.length ? `Import ${validCount} Valid Rows` : "Import All Data"} <ArrowRight className="h-4 w-4 ml-2" /></>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
