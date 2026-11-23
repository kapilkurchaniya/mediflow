"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FileSpreadsheet,
  X,
  AlertCircle,
  CheckCircle2,
  Package,
  ArrowRight,
  Loader2,
  Sparkles,
} from "lucide-react";
import { CsvDropzone } from "@/app/dashboard/import/_components/CsvDropzone";
import { processInventoryImport, type ImportRow } from "@/app/actions/inventory-import";
import { validateAndParseStockCsvFile, type ParsedStockRow } from "@/lib/stock-csv-validator";
import type { QtyMode } from "@/lib/packaging";
import {
  StockCsvToolbar,
  applyBulkUnitsPerPack,
  enrichStockRows,
  getRowBaseQtyPreview,
  updateRowUnitsPerPack,
} from "@/app/dashboard/import/_components/StockCsvPreviewControls";

export function BatchCsvImportModal({
  isOpen,
  onClose,
  initialFile,
}: {
  isOpen: boolean;
  onClose: () => void;
  initialFile?: File | null;
}) {
  const router = useRouter();
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichStats, setEnrichStats] = useState({ enriched: 0, total: 0 });
  const [parsedData, setParsedData] = useState<ParsedStockRow[]>([]);
  const [qtyMode, setQtyMode] = useState<QtyMode>("packs");
  const [updateExistingPackSizes, setUpdateExistingPackSizes] = useState(true);
  const [fileName, setFileName] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const processFile = async (file: File) => {
    setIsParsing(true);
    setGlobalError("");
    setSuccessMsg("");
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

  useEffect(() => {
    if (!isOpen || !initialFile) return;
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void processFile(initialFile);
    });
    return () => {
      active = false;
    };
  }, [isOpen, initialFile]);

  if (!isOpen) return null;

  const validRows = parsedData.filter((r) => r.errors.length === 0);
  const validCount = validRows.length;
  const invalidCount = parsedData.length - validCount;
  const unconfiguredSolidCount = parsedData.filter(
    (r) => r.isSolidDoseCandidate && (r.mapped.unitsPerPack ?? 1) === 1
  ).length;

  const handleImport = async () => {
    if (validCount === 0) return;
    setIsImporting(true);
    setGlobalError("");

    const res = await processInventoryImport(
      validRows.map((r) => r.mapped as ImportRow),
      { qtyMode, updateExistingPackSizes }
    );
    if (res.error) {
      setGlobalError(res.error);
      setIsImporting(false);
      return;
    }

    setSuccessMsg(`Imported ${res.count ?? validCount} stock batches successfully.`);
    setIsImporting(false);
    router.refresh();
    setTimeout(() => {
      setParsedData([]);
      setFileName(null);
      setSuccessMsg("");
      onClose();
    }, 650);
  };

  const handleEnrichWithAI = async () => {
    setIsEnriching(true);
    const nextRows = await enrichStockRows(parsedData, (enriched, total) => {
      setEnrichStats({ enriched, total });
    });
    setParsedData(nextRows);
    setIsEnriching(false);
  };

  const resetAndClose = () => {
    setParsedData([]);
    setFileName(null);
    setGlobalError("");
    setSuccessMsg("");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white border border-ink-200 rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-ink-150 flex items-center justify-between bg-ink-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-50 border border-brand-200 flex items-center justify-center text-brand-600">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-ink-900 text-base">Import Stock Batches (CSV)</h3>
              <p className="text-xs text-ink-500">
                Drop a validated CSV/TSV stock file here — batches import directly into this store.
              </p>
            </div>
          </div>
          <button type="button" onClick={resetAndClose} className="btn btn-ghost btn-icon">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
          {globalError && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{globalError}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {parsedData.length === 0 ? (
            <CsvDropzone
              onFileSelected={processFile}
              isLoading={isParsing}
              selectedFileName={fileName}
              title="Drop your stock CSV file here"
              subtitle="Supports Marg, Vyapar, or custom CSVs with medicine, batch, expiry, qty, and MRP/PTR columns."
              className="p-12"
            />
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl border border-ink-200 bg-ink-50/40 flex items-center justify-between">
                  <div>
                    <div className="text-[11px] text-ink-500 font-semibold uppercase">Total Rows</div>
                    <div className="text-xl font-bold text-ink-900">{parsedData.length}</div>
                  </div>
                  <Package className="h-5 w-5 text-ink-400" />
                </div>
                <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/50 flex items-center justify-between">
                  <div>
                    <div className="text-[11px] text-emerald-700 font-semibold uppercase">Ready to Import</div>
                    <div className="text-xl font-bold text-emerald-800">{validCount}</div>
                  </div>
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                </div>
                <div className="p-3.5 rounded-xl border border-rose-200 bg-rose-50/50 flex items-center justify-between">
                  <div>
                    <div className="text-[11px] text-rose-700 font-semibold uppercase">Errors Found</div>
                    <div className="text-xl font-bold text-rose-800">{invalidCount}</div>
                  </div>
                  <AlertCircle className="h-5 w-5 text-rose-600" />
                </div>
              </div>

              <StockCsvToolbar
                qtyMode={qtyMode}
                onQtyModeChange={setQtyMode}
                updateExistingPackSizes={updateExistingPackSizes}
                onUpdateExistingPackSizesChange={setUpdateExistingPackSizes}
                unconfiguredSolidCount={unconfiguredSolidCount}
                onBulkSetUpp={(upp) => setParsedData((prev) => applyBulkUnitsPerPack(prev, upp))}
              />

              <div className="border border-ink-200 rounded-xl overflow-hidden max-h-[380px] overflow-y-auto">
                <table className="min-w-full divide-y divide-ink-150 text-xs">
                  <thead className="bg-ink-50 sticky top-0 z-10 text-ink-600 font-semibold uppercase">
                    <tr>
                      <th className="px-4 py-2.5 text-left">Status</th>
                      <th className="px-4 py-2.5 text-left">Medicine</th>
                      <th className="px-4 py-2.5 text-left">Batch</th>
                      <th className="px-4 py-2.5 text-left">Expiry</th>
                      <th className="px-3 py-2.5 text-center">Units/Pack</th>
                      <th className="px-4 py-2.5 text-right">CSV Qty</th>
                      <th className="px-4 py-2.5 text-right">Total Base</th>
                      <th className="px-4 py-2.5 text-right">PTR</th>
                      <th className="px-4 py-2.5 text-right">MRP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100 bg-white">
                    {parsedData.map((row, idx) => {
                      const { upp, baseQty } = getRowBaseQtyPreview(row, qtyMode);
                      return (
                        <tr
                          key={idx}
                          className={
                            row.errors.length > 0
                              ? "bg-rose-50/50"
                              : row.warnings.length > 0
                              ? "bg-amber-50/40"
                              : ""
                          }
                        >
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            {row.errors.length > 0 ? (
                              <span className="text-rose-600 font-semibold" title={row.errors.join(", ")}>
                                Error: {row.errors[0]}
                              </span>
                            ) : row.warnings.length > 0 ? (
                              <span className="text-amber-600 font-semibold" title={row.warnings.join(", ")}>
                                Warning
                              </span>
                            ) : (
                              <span className="text-emerald-600 font-semibold">OK</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 font-medium text-ink-900">
                            {row.mapped.medicineName || <span className="text-rose-400 italic">Missing</span>}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-ink-700">
                            {row.mapped.batchNo || <span className="text-rose-400 italic">Missing</span>}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-ink-700">
                            {row.mapped.expiryDate || <span className="text-rose-400 italic">Missing</span>}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <input
                              type="number"
                              min={1}
                              max={1000}
                              value={upp}
                              onChange={(e) => {
                                const nextUpp = parseInt(e.target.value, 10) || 1;
                                setParsedData((prev) =>
                                  prev.map((r, i) => (i === idx ? updateRowUnitsPerPack(r, nextUpp) : r))
                                );
                              }}
                              className={`input !h-7 !py-0.5 !px-1.5 w-14 text-center font-mono text-xs ${
                                row.isSolidDoseCandidate && upp === 1
                                  ? "border-amber-400 bg-amber-50"
                                  : ""
                              }`}
                            />
                          </td>
                          <td className="px-4 py-2.5 text-right num font-medium">
                            {row.mapped.rawQtyText || row.mapped.qty}
                            {row.mapped.looseQty ? ` (+${row.mapped.looseQty})` : ""}
                          </td>
                          <td className="px-4 py-2.5 text-right num font-mono font-semibold text-brand-700">
                            {baseQty} {row.mapped.looseUnit || "unit"}s
                          </td>
                          <td className="px-4 py-2.5 text-right num text-ink-600">
                            ₹{((row.mapped.purchaseRate || 0) / 100).toFixed(2)}
                          </td>
                          <td className="px-4 py-2.5 text-right num font-medium text-ink-900">
                            ₹{((row.mapped.mrp || 0) / 100).toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-ink-150 bg-ink-50/50 flex flex-wrap gap-2 justify-between items-center">
          <div>
            {parsedData.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setParsedData([]);
                  setFileName(null);
                  setGlobalError("");
                }}
                className="btn btn-secondary btn-sm text-xs"
                disabled={isImporting}
              >
                Upload Different File
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={resetAndClose} className="btn btn-secondary btn-sm text-xs">
              Cancel
            </button>
            {parsedData.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleEnrichWithAI}
                  disabled={isImporting || isEnriching}
                  className="btn btn-secondary btn-sm text-xs flex items-center gap-1.5"
                >
                  {isEnriching ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 text-brand-600" />
                  )}
                  {isEnriching ? `Enriching (${enrichStats.enriched}/${enrichStats.total})…` : "Auto-Enrich"}
                </button>
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={validCount === 0 || isImporting || isEnriching}
                  className="btn btn-primary btn-sm text-xs flex items-center gap-1.5"
                >
                  {isImporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  {isImporting
                    ? "Importing…"
                    : validCount < parsedData.length
                    ? `Import ${validCount} Valid Rows`
                    : `Import ${validCount} Rows`}
                  {!isImporting && <ArrowRight className="h-3.5 w-3.5" />}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
