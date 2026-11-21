"use client";

import React, { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, FileSpreadsheet, AlertCircle } from "lucide-react";
import {
  isSupportedPurchaseBillFile,
  setPendingPurchaseImportFile,
} from "@/lib/pending-purchase-file";

export function PurchasesDropWrapper({
  canCreate,
  children,
}: {
  canCreate: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const dragDepthRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);

  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");

  const handleSelectedFile = (file: File | undefined | null) => {
    if (!file || !canCreate) return;
    if (!isSupportedPurchaseBillFile(file)) {
      setDropError(
        `Unsupported file "${file.name}". Drop a distributor bill PDF, photo (.jpg, .png, .webp), or CSV (.csv, .txt).`
      );
      return;
    }
    setDropError(null);
    setPendingPurchaseImportFile(file);
    router.push("/dashboard/purchases/new?autoImport=1");
  };

  return (
    <div
      className="relative"
      onDragEnter={(e) => {
        if (!canCreate || !hasFiles(e)) return;
        e.preventDefault();
        dragDepthRef.current += 1;
        setIsDragging(true);
      }}
      onDragOver={(e) => {
        if (!canCreate || !hasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(e) => {
        if (!canCreate || !hasFiles(e)) return;
        e.preventDefault();
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) setIsDragging(false);
      }}
      onDrop={(e) => {
        if (!canCreate || !hasFiles(e)) return;
        e.preventDefault();
        dragDepthRef.current = 0;
        setIsDragging(false);
        handleSelectedFile(e.dataTransfer.files?.[0]);
      }}
    >
      {canCreate && (
        <div className="mb-4 space-y-2">
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
            className="rounded-xl border border-dashed border-brand-300 bg-brand-50/40 hover:bg-brand-50/70 px-4 py-3 flex flex-wrap items-center justify-between gap-3 cursor-pointer transition-colors"
          >
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.csv,.txt,application/pdf,image/jpeg,image/png,image/webp,text/csv"
              className="hidden"
              onChange={(e) => {
                handleSelectedFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-white border border-brand-200 text-brand-600 flex items-center justify-center shrink-0">
                <FileSpreadsheet className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs sm:text-sm font-semibold text-ink-900">
                  Drag &amp; drop a supplier invoice anywhere on this page (PDF, Photo, or CSV)
                </p>
                <p className="text-[11.5px] text-ink-500">
                  Automatically extracts supplier details, invoice no., date, batches &amp; GST for quick verification.
                </p>
              </div>
            </div>
            <span className="btn btn-secondary btn-sm text-xs shrink-0">
              <UploadCloud className="w-3.5 h-3.5" /> Drop / Upload Bill
            </span>
          </div>

          {dropError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{dropError}</span>
            </div>
          )}
        </div>
      )}

      {children}

      {isDragging && canCreate && (
        <div className="fixed inset-0 z-40 bg-brand-950/35 backdrop-blur-xs flex items-center justify-center p-6 pointer-events-none">
          <div className="rounded-3xl border-2 border-dashed border-brand-400 bg-white/95 px-10 py-8 shadow-2xl text-center space-y-2 max-w-md">
            <div className="mx-auto w-14 h-14 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center">
              <UploadCloud className="w-7 h-7" />
            </div>
            <p className="text-base font-bold text-ink-900">Drop Supplier Bill to Auto-Create GRN</p>
            <p className="text-xs text-ink-500">
              Supports invoice PDF, photo (.jpg, .png, .webp), or Pharmarack/Retailio/Marg CSV.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
