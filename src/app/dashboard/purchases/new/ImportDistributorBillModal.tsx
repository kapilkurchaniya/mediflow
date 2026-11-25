"use client";

import { useEffect, useRef, useState } from "react";
import {
  X,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  PlusCircle,
  UserPlus,
} from "lucide-react";
import {
  parseDistributorInvoiceAction,
  quickCreateDistributorMedicinesAction,
} from "@/app/actions/distributor-invoice";
import type { ParseDistributorInvoiceResult } from "@/server/domain/import/distributor-invoice";
import type { PurchaseItemInput } from "@/server/domain/purchases";
import { formatINR } from "@/lib/format";
import type { SupplierCheckResult } from "@/server/domain/import/supplier-matcher";
import type { PendingSupplierMeta } from "@/lib/pending-supplier";
import { detectBinaryContentMismatch } from "@/lib/stock-csv-validator";
import { parseApiJsonResponse, splitPdfIntoChunks } from "@/lib/pdf-chunker";
import { QuickRegisterSupplierModal } from "@/app/components/QuickRegisterSupplierModal";
import { PhysicalScannerButton } from "@/app/components/PhysicalScannerButton";

interface ImportDistributorBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (items: PurchaseItemInput[]) => void;
  initialFile?: File | null;
  selectedSupplierId?: string;
  onSelectSupplier?: (supplierId: string) => void;
  onPendingSupplier?: (meta: PendingSupplierMeta | null) => void;
  onFillHeader?: (header: { invoiceNo?: string; invoiceDate?: string }) => void;
  onCatalogRefresh?: () => Promise<void> | void;
  onSuppliersRefresh?: () => Promise<void> | void;
}

export function ImportDistributorBillModal({
  isOpen,
  onClose,
  onImport,
  initialFile,
  selectedSupplierId,
  onSelectSupplier,
  onPendingSupplier,
  onFillHeader,
  onCatalogRefresh,
  onSuppliersRefresh,
}: ImportDistributorBillModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isCreatingMedicines, setIsCreatingMedicines] = useState(false);
  const [parseResult, setParseResult] = useState<ParseDistributorInvoiceResult | null>(null);
  const [supplierCheck, setSupplierCheck] = useState<SupplierCheckResult | null>(null);
  const [mismatchOverrideConfirmed, setMismatchOverrideConfirmed] = useState(false);
  const [registeredSupplierId, setRegisteredSupplierId] = useState<string | null>(null);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [pendingImportAfterRegister, setPendingImportAfterRegister] = useState(false);
  const [showSupplierPromptOnImport, setShowSupplierPromptOnImport] = useState(false);
  const [ocrHeader, setOcrHeader] = useState<{ invoiceNo?: string; invoiceDate?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handledInitialFileRef = useRef<File | null>(null);

  const processFile = async (fileToProcess: File, isOcr: boolean) => {
    setIsParsing(true);
    setError(null);
    try {
      if (isOcr) {
        const chunks = await splitPdfIntoChunks(fileToProcess, 1);
        let mergedResult: ParseDistributorInvoiceResult | null = null;
        let firstSupplierCheck: SupplierCheckResult | null = null;
        let firstHeader: { invoiceNo?: string; invoiceDate?: string } | null = null;

        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          let parsed: Awaited<
            ReturnType<
              typeof parseApiJsonResponse<{
                parseResult?: ParseDistributorInvoiceResult;
                supplierCheck?: SupplierCheckResult | null;
                header?: { invoiceNo?: string; invoiceDate?: string } | null;
                error?: string;
              }>
            >
          > | null = null;

          for (let attempt = 0; attempt < 3; attempt++) {
            const fd = new FormData();
            fd.append("file", chunk.file);
            if (selectedSupplierId) fd.append("selectedSupplierId", selectedSupplierId);
            const res = await fetch("/api/ocr/grn-invoice", { method: "POST", body: fd });
            parsed = await parseApiJsonResponse(res);
            const transient = !parsed.ok && (parsed.status === 429 || parsed.status >= 502);
            if (!transient || attempt === 2) break;
            await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
          }

          if (!parsed || !parsed.ok || !parsed.data?.parseResult) {
            const pageHint =
              chunk.totalPages > 1 ? ` (page ${chunk.startPage} of ${chunk.totalPages})` : "";
            setError(`${parsed?.errorMessage || "Failed to scan distributor bill."}${pageHint}`);
            setParseResult(mergedResult);
            return;
          }

          const pageResult = parsed.data.parseResult;
          if (!mergedResult) {
            mergedResult = { ...pageResult };
          } else {
            const prev: ParseDistributorInvoiceResult = mergedResult;
            const baseRow = prev.items.length;
            const shiftedItems = pageResult.items.map((it, idx) => ({
              ...it,
              rowNo: baseRow + idx + 1,
            }));
            mergedResult = {
              ...prev,
              items: [...prev.items, ...shiftedItems],
              purchaseItems: [...prev.purchaseItems, ...pageResult.purchaseItems],
              totalLines: prev.totalLines + pageResult.totalLines,
              validLines: prev.validLines + pageResult.validLines,
              unmatchedMedicinesCount:
                prev.unmatchedMedicinesCount + pageResult.unmatchedMedicinesCount,
              totalInvoiceAmountPaise:
                prev.totalInvoiceAmountPaise + pageResult.totalInvoiceAmountPaise,
            };
          }

          if (!firstSupplierCheck && parsed.data.supplierCheck) {
            firstSupplierCheck = parsed.data.supplierCheck;
          }
          if (!firstHeader && parsed.data.header) {
            firstHeader = parsed.data.header;
          }
        }

        setParseResult(mergedResult);
        setSupplierCheck(firstSupplierCheck);
        setOcrHeader(firstHeader);
        if (
          firstSupplierCheck?.status === "auto_matched" &&
          firstSupplierCheck.matchedSupplier &&
          onSelectSupplier
        ) {
          onSelectSupplier(firstSupplierCheck.matchedSupplier.id);
        }
      } else {
        const binaryErr = await detectBinaryContentMismatch(fileToProcess);
        if (binaryErr) {
          setError(binaryErr);
          setParseResult(null);
          return;
        }
        const text = await fileToProcess.text();
        const res = await parseDistributorInvoiceAction(text, selectedSupplierId);
        if (!res.success || !res.result) {
          setError(res.error || "Failed to parse distributor invoice.");
          setParseResult(null);
        } else {
          setParseResult(res.result);
          setSupplierCheck(res.supplierCheck ?? null);
          setOcrHeader(res.header ?? null);
          if (res.supplierCheck?.status === "auto_matched" && res.supplierCheck.matchedSupplier && onSelectSupplier) {
            onSelectSupplier(res.supplierCheck.matchedSupplier.id);
          }
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error reading invoice file.");
      setParseResult(null);
    } finally {
      setIsParsing(false);
    }
  };

  const handleFileSelect = (selectedFile: File) => {
    const lower = selectedFile.name.toLowerCase();
    const isCsv = lower.endsWith(".csv") || lower.endsWith(".txt");
    const isOcr =
      lower.endsWith(".pdf") ||
      lower.endsWith(".jpg") ||
      lower.endsWith(".jpeg") ||
      lower.endsWith(".png") ||
      lower.endsWith(".webp");

    if (!isCsv && !isOcr) {
      setError("Please select a CSV (.csv/.txt) or bill scan (.pdf, .jpg, .png, .webp).");
      return;
    }
    setFile(selectedFile);
    setError(null);
    setSuccessMessage(null);
    setSupplierCheck(null);
    setMismatchOverrideConfirmed(false);
    setRegisteredSupplierId(null);
    setShowSupplierPromptOnImport(false);
    setOcrHeader(null);
    void processFile(selectedFile, isOcr);
  };

  useEffect(() => {
    if (isOpen && initialFile && handledInitialFileRef.current !== initialFile) {
      handledInitialFileRef.current = initialFile;
      handleFileSelect(initialFile);
    }
    if (!isOpen) {
      handledInitialFileRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialFile]);

  if (!isOpen) return null;

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
        schedule: i.schedule,
      }));

      const res = await quickCreateDistributorMedicinesAction(itemsToCreate);
      if (!res.success || !res.createdMap) {
        setError(res.error || "Failed to create missing medicines.");
      } else {
        const createdMap = res.createdMap;
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
        await onCatalogRefresh?.();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error creating medicines.");
    } finally {
      setIsCreatingMedicines(false);
    }
  };

  const isUnknownSupplier =
    supplierCheck?.status === "unknown_supplier" &&
    !registeredSupplierId &&
    !selectedSupplierId;

  const isMismatchBlocked = supplierCheck?.status === "mismatch" && !mismatchOverrideConfirmed;

  const extractedMeta: PendingSupplierMeta | null = supplierCheck?.extracted?.name?.trim()
    ? {
        name: supplierCheck.extracted.name.trim(),
        gstin: supplierCheck.extracted.gstin ?? null,
        phone: supplierCheck.extracted.phone ?? null,
        drugLicenseNo: supplierCheck.extracted.drugLicenseNo ?? null,
        address: supplierCheck.extracted.address ?? null,
      }
    : null;

  const handleUnitsPerPackChange = (idx: number, nextUppRaw: number) => {
    if (!parseResult) return;
    const nextUpp = Math.max(1, Math.min(1000, Math.round(nextUppRaw || 1)));
    const updatedItems = parseResult.items.map((it, i) =>
      i === idx ? { ...it, unitsPerPack: nextUpp } : it
    );
    const updatedPurchaseItems = parseResult.purchaseItems.map((pi) => {
      const target = updatedItems[idx];
      if (
        target?.matchedMedicineId &&
        pi.medicineId === target.matchedMedicineId &&
        pi.batchNo === target.batchNo
      ) {
        return { ...pi, unitsPerPack: nextUpp };
      }
      return pi;
    });
    setParseResult({
      ...parseResult,
      items: updatedItems,
      purchaseItems: updatedPurchaseItems,
    });
  };

  const finalizeImport = (pendingMeta: PendingSupplierMeta | null) => {
    if (!parseResult || parseResult.purchaseItems.length === 0) return;
    if (ocrHeader && onFillHeader) {
      onFillHeader(ocrHeader);
    }
    if (onPendingSupplier) {
      onPendingSupplier(pendingMeta);
    }
    onImport(parseResult.purchaseItems);
    onClose();
  };

  const handleApplyToPurchase = () => {
    if (!parseResult || parseResult.purchaseItems.length === 0 || isMismatchBlocked) return;
    if (isUnknownSupplier && extractedMeta) {
      setShowSupplierPromptOnImport(true);
      return;
    }
    finalizeImport(null);
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
                Import Distributor Bill
                <span className="text-xs px-2 py-0.5 rounded-full bg-brand-100 text-brand-800 dark:bg-brand-900/60 dark:text-brand-300 font-mono">
                  Pharmarack · Retailio · Marg · OCR
                </span>
              </h3>
              <p className="text-xs text-muted-foreground">
                Drop a CSV, PDF, or photo. Auto-fills supplier, invoice details, batches, and landed rates for verification.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <PhysicalScannerButton
              channel="invoices"
              label="Physical Scanner"
              onScannedFile={(scanned) => handleFileSelect(scanned)}
            />
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
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
                accept=".csv,.txt,.pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) handleFileSelect(e.target.files[0]);
                  e.target.value = "";
                }}
              />
              <div className="w-14 h-14 mx-auto rounded-full bg-brand-50 dark:bg-brand-950/50 border border-brand-200 dark:border-brand-800 flex items-center justify-center text-brand-600 dark:text-brand-400 mb-4 group-hover:scale-105 transition-transform">
                <Upload className="w-7 h-7" />
              </div>
              <p className="font-medium text-foreground text-sm sm:text-base">
                Click or drag &amp; drop distributor invoice (CSV, PDF, or Bill Photo)
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Supports Pharmarack/Retailio/Marg CSVs AND AI Vision OCR for scanned PDFs &amp; bill photos with supplier verification
              </p>
            </div>
          )}

          {/* Parsing Spinner */}
          {isParsing && (
            <div className="py-16 text-center space-y-3">
              <RefreshCw className="w-8 h-8 mx-auto text-brand-600 animate-spin" />
              <p className="text-sm font-medium text-foreground">
                Analyzing {file?.name || "invoice"} &amp; extracting supplier, header &amp; line items...
              </p>
              <p className="text-xs text-muted-foreground">Checking supplier directory, barcodes, batch numbers, and landed costs</p>
            </div>
          )}

          {/* Parsed Result Display */}
          {parseResult && (
            <div className="space-y-4">
              {/* Auto-Extracted Header Preview */}
              {(ocrHeader?.invoiceNo || ocrHeader?.invoiceDate || extractedMeta) && (
                <div className="p-3 rounded-xl border border-ink-200 bg-ink-50/60 flex flex-wrap items-center gap-x-6 gap-y-1.5 text-xs">
                  {extractedMeta?.name && (
                    <div>
                      <span className="text-ink-500">Extracted Supplier: </span>
                      <span className="font-semibold text-ink-900">{extractedMeta.name}</span>
                      {extractedMeta.gstin && (
                        <span className="ml-1.5 font-mono text-ink-600">({extractedMeta.gstin})</span>
                      )}
                    </div>
                  )}
                  {ocrHeader?.invoiceNo && (
                    <div>
                      <span className="text-ink-500">Invoice No.: </span>
                      <span className="font-mono font-semibold text-ink-900">{ocrHeader.invoiceNo}</span>
                    </div>
                  )}
                  {ocrHeader?.invoiceDate && (
                    <div>
                      <span className="text-ink-500">Invoice Date: </span>
                      <span className="font-mono font-semibold text-ink-900">{ocrHeader.invoiceDate}</span>
                    </div>
                  )}
                </div>
              )}

              {supplierCheck && (
                <div
                  className={`p-3.5 rounded-xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    supplierCheck.status === "mismatch"
                      ? "bg-rose-50 border-rose-300 text-rose-900"
                      : supplierCheck.status === "matched" ||
                        supplierCheck.status === "auto_matched" ||
                        registeredSupplierId
                      ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                      : "bg-amber-50 border-amber-200 text-amber-900"
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    {supplierCheck.status === "matched" ||
                    supplierCheck.status === "auto_matched" ||
                    registeredSupplierId ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <div className="font-bold">
                        {registeredSupplierId
                          ? "Supplier Registered & Selected"
                          : supplierCheck.status === "mismatch"
                          ? "Wrong Supplier Bill Detected!"
                          : supplierCheck.status === "matched"
                          ? "Supplier Verified"
                          : supplierCheck.status === "auto_matched"
                          ? "Supplier Auto-Detected"
                          : "Supplier Verification Notice"}
                      </div>
                      <p className="mt-0.5">
                        {registeredSupplierId
                          ? `"${extractedMeta?.name || "Supplier"}" has been added to your directory and linked to this purchase bill.`
                          : supplierCheck.reason}
                      </p>
                    </div>
                  </div>

                  {isUnknownSupplier && extractedMeta && (
                    <button
                      type="button"
                      onClick={() => {
                        setPendingImportAfterRegister(false);
                        setShowRegisterModal(true);
                      }}
                      className="btn btn-primary btn-xs shrink-0 flex items-center gap-1"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      Add &ldquo;{extractedMeta.name}&rdquo; to Directory
                    </button>
                  )}

                  {supplierCheck.status === "mismatch" && (
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {supplierCheck.matchedSupplier && onSelectSupplier && (
                        <button
                          type="button"
                          onClick={() => {
                            onSelectSupplier(supplierCheck.matchedSupplier!.id);
                            setMismatchOverrideConfirmed(true);
                          }}
                          className="btn btn-primary btn-xs"
                        >
                          Switch to {supplierCheck.matchedSupplier.name}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setMismatchOverrideConfirmed((v) => !v)}
                        className="btn btn-secondary btn-xs"
                      >
                        {mismatchOverrideConfirmed ? "Override Confirmed" : "Keep Selected Anyway"}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Prompt when clicking Import while supplier is not registered */}
              {showSupplierPromptOnImport && isUnknownSupplier && extractedMeta && (
                <div className="p-4 rounded-xl border-2 border-amber-300 bg-amber-50/90 text-amber-950 space-y-2.5 text-xs">
                  <div className="flex items-start gap-2">
                    <UserPlus className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-sm">
                        Register &ldquo;{extractedMeta.name}&rdquo; before importing?
                      </p>
                      <p className="text-amber-900 mt-0.5">
                        We retrieved supplier details from this invoice{extractedMeta.gstin ? ` (GSTIN: ${extractedMeta.gstin})` : ""}. Register them in one click with pre-filled details, or skip for now (a reminder warning will stay visible until you register them).
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pl-6">
                    <button
                      type="button"
                      onClick={() => {
                        setPendingImportAfterRegister(true);
                        setShowRegisterModal(true);
                      }}
                      className="btn btn-primary btn-xs flex items-center gap-1"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      Register Supplier (Pre-filled) &amp; Import Lines
                    </button>
                    <button
                      type="button"
                      onClick={() => finalizeImport(extractedMeta)}
                      className="btn btn-secondary btn-xs"
                    >
                      Import Lines Anyway (Register Later)
                    </button>
                  </div>
                </div>
              )}

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
                        <th className="py-2.5 px-3 text-center">Units/Pack</th>
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
                          <td className="py-2 px-3 text-center">
                            <input
                              type="number"
                              min={1}
                              max={1000}
                              value={item.unitsPerPack}
                              onChange={(e) =>
                                handleUnitsPerPackChange(idx, parseInt(e.target.value, 10) || 1)
                              }
                              className="input input-sm !h-7 !py-0.5 !px-1.5 w-14 text-center font-mono text-xs"
                            />
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
                  setSupplierCheck(null);
                  setShowSupplierPromptOnImport(false);
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
                disabled={parseResult.purchaseItems.length === 0 || isMismatchBlocked}
                className="btn btn-primary btn-sm text-xs flex items-center gap-1.5 disabled:opacity-50"
              >
                <span>Import {parseResult.purchaseItems.length} Lines to Purchase Bill</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {extractedMeta && (
        <QuickRegisterSupplierModal
          isOpen={showRegisterModal}
          onClose={() => {
            setShowRegisterModal(false);
            setPendingImportAfterRegister(false);
          }}
          initialMeta={extractedMeta}
          submitLabel={pendingImportAfterRegister ? "Save Supplier & Import Lines" : "Save Supplier"}
          onRegistered={async (sup) => {
            setRegisteredSupplierId(sup.id);
            onSelectSupplier?.(sup.id);
            onPendingSupplier?.(null);
            await onSuppliersRefresh?.();
            setShowSupplierPromptOnImport(false);
            if (pendingImportAfterRegister) {
              finalizeImport(null);
            }
          }}
        />
      )}
    </div>
  );
}
