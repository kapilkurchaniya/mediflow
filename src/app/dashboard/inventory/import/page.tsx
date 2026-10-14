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
    
    // Fuzzy matching helpers
    const getVal = (keys: string[]) => {
      const foundKey = Object.keys(row).find(k => keys.some(key => k.toLowerCase().includes(key)));
      return foundKey ? row[foundKey] : "";
    };

    const name = getVal(["medicine", "item", "product", "name"]);
    const batch = getVal(["batch", "lot"]);
    const exp = getVal(["exp", "expiry"]);
    const qty = parseInt(getVal(["qty", "quantity", "stock"]) || "0");
    const mrp = parseFloat(getVal(["mrp", "retail"]) || "0") * 100; // to paise
    const pRate = parseFloat(getVal(["purchase", "cost", "prate"]) || "0") * 100;
    
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
        batchNo: batch,
        expiryDate: formattedExp,
        qty,
        mrp,
        purchaseRate: pRate,
        saleRate: mrp // Defaulting sale rate to MRP for bulk
      }
    };
  };

  const parseDate = (dateStr: string): string => {
    try {
      // Handles MM/YY or MM/YYYY
      if (dateStr.includes("/")) {
        const parts = dateStr.split("/");
        if (parts.length === 2) {
          const month = parts[0].padStart(2, '0');
          let year = parts[1];
          if (year.length === 2) year = `20${year}`;
          // Set to last day of month
          return new Date(parseInt(year), parseInt(month), 0).toISOString().split("T")[0];
        }
      }
      // Native JS parse fallback
      const d = new Date(dateStr);
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
      (r.mapped.mrp === 0 || !r.mapped.manufacturer || r.mapped.manufacturer === "Unknown")
    );
    
    setEnrichStats({ enriched: 0, total: needsEnrichment.length });

    if (needsEnrichment.length === 0) {
      setIsEnriching(false);
      return;
    }

    for (let i = 0; i < newData.length; i++) {
      const row = newData[i];
      if (row.mapped.medicineName && (row.mapped.mrp === 0 || !row.mapped.manufacturer || row.mapped.manufacturer === "Unknown")) {
        try {
          const enriched = await enrichMedicineDetails({ medicineName: row.mapped.medicineName });
          if (enriched) {
            newData[i].mapped.manufacturer = enriched.manufacturer;
            newData[i].mapped.category = enriched.category;
            
            if (row.mapped.mrp === 0 && enriched.mrp > 0) {
              newData[i].mapped.mrp = enriched.mrp;
              newData[i].mapped.saleRate = enriched.mrp; // Set sale rate to MRP
              
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
