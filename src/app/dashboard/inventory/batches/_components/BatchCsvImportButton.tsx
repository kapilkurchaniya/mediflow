"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { BatchCsvImportModal } from "./BatchCsvImportModal";

export function BatchCsvImportButton({
  variant = "secondary",
  size = "md",
  label = "Import CSV",
}: {
  variant?: "primary" | "secondary";
  size?: "sm" | "md";
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`btn ${variant === "primary" ? "btn-primary" : "btn-secondary"} ${size === "sm" ? "btn-sm" : ""}`}
        data-tooltip="Upload or drag-and-drop a stock CSV file directly without leaving Batches & Stock"
      >
        <Upload className="w-4 h-4" />
        {label}
      </button>
      <BatchCsvImportModal isOpen={open} onClose={() => setOpen(false)} />
    </>
  );
}
