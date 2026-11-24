"use client";

import React, { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { UploadCloud } from "lucide-react";

const BatchCsvImportModal = dynamic(
  () => import("./BatchCsvImportModal").then((m) => m.BatchCsvImportModal),
  { ssr: false }
);
const StockOcrModal = dynamic(
  () => import("./StockOcrModal").then((m) => m.StockOcrModal),
  { ssr: false }
);

function isOcrDocumentFile(file: File): boolean {
  const lower = file.name.toLowerCase();
  const type = (file.type || "").toLowerCase();
  return (
    lower.endsWith(".pdf") ||
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".png") ||
    lower.endsWith(".webp") ||
    type === "application/pdf" ||
    type.startsWith("image/")
  );
}

export function BatchesDropWrapper({ children }: { children: React.ReactNode }) {
  const dragDepthRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const [droppedCsvFile, setDroppedCsvFile] = useState<File | null>(null);
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [droppedOcrFile, setDroppedOcrFile] = useState<File | null>(null);
  const [ocrModalOpen, setOcrModalOpen] = useState(false);

  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");

  return (
    <div
      className="relative"
      onDragEnter={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        dragDepthRef.current += 1;
        setIsDragging(true);
      }}
      onDragOver={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) setIsDragging(false);
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        dragDepthRef.current = 0;
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (!file) return;
        if (isOcrDocumentFile(file)) {
          setDroppedOcrFile(file);
          setOcrModalOpen(true);
        } else {
          setDroppedCsvFile(file);
          setCsvModalOpen(true);
        }
      }}
    >
      {children}

      {isDragging && (
        <div className="fixed inset-0 z-40 bg-brand-950/35 backdrop-blur-xs flex items-center justify-center p-6 pointer-events-none">
          <div className="rounded-3xl border-2 border-dashed border-brand-400 bg-white/95 px-10 py-8 shadow-2xl text-center space-y-2 max-w-md">
            <div className="mx-auto w-14 h-14 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center">
              <UploadCloud className="w-7 h-7" />
            </div>
            <p className="text-base font-bold text-ink-900">Drop Stock CSV, PDF, or Bill Photo</p>
            <p className="text-xs text-ink-500">
              CSVs open inline batch import; PDFs and photos automatically open AI OCR stock scanner (with Schedule H/H1/X detection).
            </p>
          </div>
        </div>
      )}

      {csvModalOpen && (
        <BatchCsvImportModal
          isOpen={csvModalOpen}
          initialFile={droppedCsvFile}
          onClose={() => {
            setCsvModalOpen(false);
            setDroppedCsvFile(null);
          }}
        />
      )}

      {ocrModalOpen && (
        <StockOcrModal
          isOpen={ocrModalOpen}
          initialFile={droppedOcrFile}
          onClose={() => {
            setOcrModalOpen(false);
            setDroppedOcrFile(null);
          }}
        />
      )}
    </div>
  );
}
