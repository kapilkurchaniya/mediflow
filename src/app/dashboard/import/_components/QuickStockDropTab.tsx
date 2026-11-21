"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, Package, ArrowRight, Loader2 } from "lucide-react";
import { processInventoryImport, ImportRow } from "@/app/actions/inventory-import";
import { enrichMedicineDetails } from "@/app/actions/ai-enrichment";
import { useRouter } from "next/navigation";
import { CsvDropzone } from "./CsvDropzone";
import { StockOcrButton } from "@/app/dashboard/inventory/batches/_components/StockOcrButton";
import { validateAndParseStockCsvFile, type ParsedStockRow } from "@/lib/stock-csv-validator";

export function QuickStockDropTab() {
  const router = useRouter();
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedStockRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState("");
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichStats, setEnrichStats] = useState({ enriched: 0, total: 0 });

  const processFile = async (file: File) => {
    setIsParsing(true);
    setGlobalError("");
    setFileName(file.name);
    try {
      const { rows, error } = await validateAndParseStockCsvFile(file);
      if (error) {
        setGlobalError(error);
        setParsedData([]);
      } else {
        setParsedData(rows);
      }
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : String(err));
      setParsedData([]);
    } finally {
      setIsParsing(false);
    }
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
