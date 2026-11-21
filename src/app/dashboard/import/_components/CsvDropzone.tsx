"use client";

import React, { useRef, useState } from "react";
import { UploadCloud, Loader2, FileSpreadsheet, AlertCircle } from "lucide-react";
import clsx from "clsx";
import {
  detectBinaryContentMismatch,
  validateStockCsvMetadata,
} from "@/lib/stock-csv-validator";

interface CsvDropzoneProps {
  onFileSelected: (file: File) => void;
  isLoading?: boolean;
  loadingLabel?: string;
  accept?: string;
  maxSizeMb?: number;
  title?: string;
  subtitle?: string;
  selectedFileName?: string | null;
  className?: string;
}

export function CsvDropzone({
  onFileSelected,
  isLoading = false,
  loadingLabel = "Parsing CSV file…",
  accept = ".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain",
  maxSizeMb = 50,
  title = "Drop your CSV file here",
  subtitle = "Supports Marg ERP, GoFrugal, Vyapar, and standard CSV/TSV exports",
  selectedFileName,
  className,
}: CsvDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleFile = async (file: File | undefined | null) => {
    if (!file) return;
    setValidationError(null);

    const metaErr = validateStockCsvMetadata(file, maxSizeMb);
    if (metaErr) {
      setValidationError(metaErr);
      return;
    }

    const binaryErr = await detectBinaryContentMismatch(file);
    if (binaryErr) {
      setValidationError(binaryErr);
      return;
    }

    onFileSelected(file);
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current += 1;
    setIsDragging(true);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = 0;
    setIsDragging(false);
    if (isLoading) return;
    const droppedFile = e.dataTransfer.files?.[0];
    void handleFile(droppedFile);
  };

  return (
    <div className="space-y-2.5">
      <div
        role="button"
        tabIndex={0}
        aria-label={title}
        onClick={() => !isLoading && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !isLoading) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={clsx(
          "border-2 border-dashed rounded-2xl p-10 text-center transition-all cursor-pointer select-none flex flex-col items-center justify-center space-y-3 outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
          isDragging
            ? "border-brand-500 bg-brand-50/70 scale-[1.005] shadow-sm"
            : "border-slate-300 bg-white hover:border-brand-400 hover:bg-brand-50/20",
          isLoading && "opacity-75 cursor-wait",
          className
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const picked = e.target.files?.[0];
            void handleFile(picked);
            // Reset input so re-selecting the same file still fires onChange
            e.target.value = "";
          }}
        />

        <div
          className={clsx(
            "h-14 w-14 rounded-full flex items-center justify-center transition-colors",
            isDragging ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-brand-600"
          )}
        >
          {isLoading ? (
            <Loader2 className="h-7 w-7 animate-spin" />
          ) : selectedFileName ? (
            <FileSpreadsheet className="h-7 w-7" />
          ) : (
            <UploadCloud className="h-7 w-7" />
          )}
        </div>

        <div className="space-y-1">
          <p className="text-sm font-semibold text-ink-900">
            {isLoading ? (
              loadingLabel
            ) : isDragging ? (
              "Release to upload CSV file"
            ) : (
              <>
                <span className="text-brand-600 hover:underline">Click to upload</span>{" "}
                <span className="text-ink-600 font-normal">or drag and drop</span>
              </>
            )}
          </p>
          {selectedFileName && !isLoading && (
            <p className="text-xs font-medium text-emerald-700">
              Loaded: {selectedFileName} (drop another file to replace)
            </p>
          )}
          <p className="text-xs text-ink-400 max-w-md mx-auto">{subtitle}</p>
        </div>
      </div>

      {validationError && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
          <span>{validationError}</span>
        </div>
      )}
    </div>
  );
}

