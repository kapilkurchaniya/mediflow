"use client";

import { useState, useRef } from "react";
import {
  X,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  RefreshCw,
  PlusCircle,
  HelpCircle,
} from "lucide-react";
import {
  parseDistributorInvoiceAction,
  quickCreateDistributorMedicinesAction,
} from "@/app/actions/distributor-invoice";
import type {
  ParseDistributorInvoiceResult,
  ParsedDistributorInvoiceItem,
} from "@/server/domain/import/distributor-invoice";
import type { PurchaseItemInput } from "@/server/domain/purchases";
import { formatINR } from "@/lib/format";

interface ImportDistributorBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (items: PurchaseItemInput[]) => void;
}

export function ImportDistributorBillModal({
  isOpen,
  onClose,
  onImport,
}: ImportDistributorBillModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isCreatingMedicines, setIsCreatingMedicines] = useState(false);
  const [parseResult, setParseResult] = useState<ParseDistributorInvoiceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileSelect = (selectedFile: File) => {
    if (!selectedFile.name.endsWith(".csv") && !selectedFile.name.endsWith(".txt")) {
      setError("Please select a valid CSV file (.csv or .txt).");
      return;
    }
    setFile(selectedFile);
    setError(null);
    setSuccessMessage(null);
    processFile(selectedFile);
  };

  const processFile = async (fileToProcess: File) => {
    setIsParsing(true);
    setError(null);
    try {
      const text = await fileToProcess.text();
      const res = await parseDistributorInvoiceAction(text);
      if (!res.success || !res.result) {
        setError(res.error || "Failed to parse distributor invoice.");
        setParseResult(null);
      } else {
        setParseResult(res.result);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error reading invoice file.");
      setParseResult(null);
    } finally {
      setIsParsing(false);
    }
  };

  const handleQuickCreateAllMissing = async () => {
    if (!parseResult) return;
    const unmatched = parseResult.items.filter((i) => !i.matchedMedicineId);
    if (unmatched.length === 0) return;

    setIsCreatingMedicines(true);
    setError(null);
    try {
      const itemsToCreate = unmatched.map((i) => ({
        name: i.name,
        pack: i.pack,
        unitsPerPack: i.unitsPerPack,
        hsn: i.hsn,
        gstRateBp: i.gstRateBp,
        mrpPaise: i.mrpPaise,
        ptrPaise: i.ptrPaise,
        barcode: i.barcode,
      }));

      const res = await quickCreateDistributorMedicinesAction(itemsToCreate);
      if (!res.success || !res.createdMap) {
        setError(res.error || "Failed to create missing medicines.");
      } else {
        const createdMap = res.createdMap;
        // Update local items with newly created medicine IDs
        const updatedItems = parseResult.items.map((item) => {
          if (!item.matchedMedicineId) {
            const key = item.name.trim().toLowerCase();
            const newId = createdMap[key];
            if (newId) {
              return {
                ...item,
                matchedMedicineId: newId,
                matchType: "exact_name" as const,
                matchConfidence: 1.0,
                matchedMedicineName: item.name,
              };
            }
          }
          return item;
        });

        // Rebuild purchaseItems
        const newPurchaseItems: PurchaseItemInput[] = [];
        for (const it of updatedItems) {
          if (it.matchedMedicineId && it.errors.length === 0) {
            newPurchaseItems.push({
              medicineId: it.matchedMedicineId,
              batchNo: it.batchNo,
              expiryDate: it.expiryDate,
              qty: it.billedQty,
              freeQty: it.freeQty,
              rate: it.ptrPaise,
              mrp: it.mrpPaise,
              saleRate: it.saleRatePaise,
              discountBp: it.discountBp,
              tradeDiscountBp: it.discountBp,
              cashDiscountBp: 0,
              unitsPerPack: it.unitsPerPack,
              packUnit: "strip",
              looseUnit: "tablet",
              gstRateBp: it.gstRateBp,
            });
          }
        }

        setParseResult({
          ...parseResult,
          unmatchedMedicinesCount: 0,
          items: updatedItems,
          purchaseItems: newPurchaseItems,
        });

        setSuccessMessage(`Successfully created ${Object.keys(createdMap).length} medicines in your catalog.`);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error creating medicines.");
    } finally {
      setIsCreatingMedicines(false);
    }
  };

  const handleApplyToPurchase = () => {
    if (!parseResult || parseResult.purchaseItems.length === 0) return;
    onImport(parseResult.purchaseItems);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-card text-card-foreground border border-border rounded-xl shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between gap-4 bg-muted/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-brand-50 dark:bg-brand-950/50 border border-brand-200 dark:border-brand-800 flex items-center justify-center text-brand-600 dark:text-brand-400 shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground text-base sm:text-lg flex items-center gap-2">
                Import Electronic Distributor Bill
                <span className="text-xs px-2 py-0.5 rounded-full bg-brand-100 text-brand-800 dark:bg-brand-900/60 dark:text-brand-300 font-mono">
                  Pharmarack · Retailio · Marg
                </span>
              </h3>
              <p className="text-xs text-muted-foreground">
                Drop your distributor CSV invoice. Automatically matches catalog medicines, extracts batches, and calculates landed rates.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-sm flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Upload Dropzone */}
          {!parseResult && !isParsing && (
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files?.[0]) handleFileSelect(e.dataTransfer.files[0]);
              }}
              className="border-2 border-dashed border-border hover:border-brand-500 hover:bg-brand-50/20 dark:hover:bg-brand-950/10 rounded-xl p-8 sm:p-12 text-center cursor-pointer transition-colors group"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) handleFileSelect(e.target.files[0]);
                }}
              />
              <div className="w-14 h-14 mx-auto rounded-full bg-brand-50 dark:bg-brand-950/50 border border-brand-200 dark:border-brand-800 flex items-center justify-center text-brand-600 dark:text-brand-400 mb-4 group-hover:scale-105 transition-transform">
                <Upload className="w-7 h-7" />
              </div>
              <p className="font-medium text-foreground text-sm sm:text-base">
                Click or drag & drop distributor invoice file here
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Supports standard Pharmarack (.csv), Retailio (.csv), and Marg Bill Export (.csv)
              </p>
            </div>
          )}

          {/* Parsing Spinner */}
          {isParsing && (
            <div className="py-16 text-center space-y-3">
              <RefreshCw className="w-8 h-8 mx-auto text-brand-600 animate-spin" />
              <p className="text-sm font-medium text-foreground">
                Analyzing invoice lines & matching medicines against catalog...
              </p>
              <p className="text-xs text-muted-foreground">Checking barcodes, batch numbers, and landed costs</p>
            </div>
          )}

          {/* Parsed Result Display */}
          {parseResult && (
            <div className="space-y-4">
              {/* Summary Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="card p-3 bg-muted/30 border border-border">
                  <div className="text-xs text-muted-foreground">Format Detected</div>
                  <div className="font-semibold text-sm capitalize flex items-center gap-1.5 mt-0.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    {parseResult.detectedSource}
                    <span className="text-xs font-normal text-muted-foreground font-mono">
                      ({Math.round(parseResult.confidence * 100)}%)
                    </span>
                  </div>
                </div>

                <div className="card p-3 bg-muted/30 border border-border">
                  <div className="text-xs text-muted-foreground">Total Lines</div>
                  <div className="font-semibold text-sm mt-0.5">
                    {parseResult.totalLines} lines
                    <span className="text-xs font-normal text-emerald-600 dark:text-emerald-400 ml-1">
                      ({parseResult.validLines} valid)
                    </span>
                  </div>
                </div>

                <div className="card p-3 bg-muted/30 border border-border">
                  <div className="text-xs text-muted-foreground">Medicine Matches</div>
                  <div className="font-semibold text-sm mt-0.5 flex items-center gap-1.5">
                    {parseResult.unmatchedMedicinesCount === 0 ? (
                      <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> 100% Matched
                      </span>
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" /> {parseResult.unmatchedMedicinesCount} Unmatched
                      </span>
                    )}
                  </div>
                </div>

                <div className="card p-3 bg-muted/30 border border-border">
                  <div className="text-xs text-muted-foreground">Estimated Taxable</div>
                  <div className="font-semibold text-sm mt-0.5 font-mono text-brand-600 dark:text-brand-400">
                    {formatINR(parseResult.totalInvoiceAmountPaise)}
                  </div>
                </div>
              </div>

              {/* Unmatched Action Warning Banner */}
              {parseResult.unmatchedMedicinesCount > 0 && (
                <div className="p-3.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      <strong>{parseResult.unmatchedMedicinesCount} medicines</strong> in this distributor bill do not
                      exist in your catalog. You can create them instantly with one click:
                    </span>
                  </div>
                  <button
                    onClick={handleQuickCreateAllMissing}
                    disabled={isCreatingMedicines}
                    className="btn btn-sm bg-amber-600 hover:bg-amber-700 text-white font-medium flex items-center gap-1.5 shrink-0"
                  >
                    {isCreatingMedicines ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <PlusCircle className="w-3.5 h-3.5" />
                    )}
                    One-Click Create All Missing ({parseResult.unmatchedMedicinesCount})
                  </button>
                </div>
              )}

              {/* Items Table */}
              <div className="border border-border rounded-lg overflow-hidden bg-card">
                <div className="max-h-[380px] overflow-y-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-muted/70 text-muted-foreground font-semibold uppercase tracking-wider sticky top-0 z-10 border-b border-border">
                      <tr>
                        <th className="py-2.5 px-3 w-10">#</th>
                        <th className="py-2.5 px-3">Product Name</th>
                        <th className="py-2.5 px-3">Catalog Match</th>
                        <th className="py-2.5 px-3">Batch & Exp</th>
                        <th className="py-2.5 px-3 text-right">Billed + Free</th>
                        <th className="py-2.5 px-3 text-right">PTR (₹)</th>
                        <th className="py-2.5 px-3 text-right">Disc %</th>
                        <th className="py-2.5 px-3 text-right">Landed / Pack</th>
                        <th className="py-2.5 px-3 text-right">GST</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border font-sans">
                      {parseResult.items.map((item, idx) => (
                        <tr
                          key={idx}
                          className={
                            !item.matchedMedicineId
                              ? "bg-amber-50/40 dark:bg-amber-950/20"
                              : "hover:bg-muted/30"
                          }
                        >
                          <td className="py-2 px-3 text-muted-foreground font-mono">{item.rowNo}</td>
                          <td className="py-2 px-3">
                            <div className="font-medium text-foreground">{item.name}</div>
                            <div className="text-[11px] text-muted-foreground font-mono">
                              Pack: {item.pack} {item.barcode ? `· EAN: ${item.barcode}` : ""}
                            </div>
                          </td>
                          <td className="py-2 px-3">
                            {item.matchedMedicineId ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                                <CheckCircle2 className="w-3 h-3" />
                                {item.matchType === "exact_barcode"
                                  ? "Barcode"
                                  : item.matchType === "exact_name_pack"
                                  ? "Name+Pack"
                                  : "Name Match"}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                                <AlertTriangle className="w-3 h-3" />
                                Missing
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 font-mono">
                            <div>{item.batchNo}</div>
                            <div className="text-[11px] text-muted-foreground">{item.expiryDate}</div>
                          </td>
                          <td className="py-2 px-3 text-right font-mono">
                            <span className="font-semibold text-foreground">{item.billedQty}</span>
                            {item.freeQty > 0 && (
                              <span className="text-emerald-600 dark:text-emerald-400 ml-1">
                                +{item.freeQty} Free
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-muted-foreground">
                            {formatINR(item.ptrPaise)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono">
                            {item.discountPct > 0 ? `${item.discountPct}%` : "—"}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-semibold text-brand-600 dark:text-brand-400">
                            {formatINR(item.effectiveUnitCostPaise)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-muted-foreground">
                            {item.gstRateBp / 100}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-border flex flex-wrap items-center justify-between gap-3 bg-muted/40">
          <div className="flex items-center gap-2">
            {parseResult && (
              <button
                onClick={() => {
                  setParseResult(null);
                  setFile(null);
                  setError(null);
                  setSuccessMessage(null);
                }}
                className="btn btn-secondary btn-sm text-xs"
              >
                Upload Different File
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button onClick={onClose} className="btn btn-secondary btn-sm text-xs">
              Cancel
            </button>
            {parseResult && (
              <button
                onClick={handleApplyToPurchase}
                disabled={parseResult.purchaseItems.length === 0}
                className="btn btn-primary btn-sm text-xs flex items-center gap-1.5"
              >
                <span>Import {parseResult.purchaseItems.length} Lines to Purchase Bill</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
