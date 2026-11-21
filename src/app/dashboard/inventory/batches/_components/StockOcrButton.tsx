"use client";

import { useState } from "react";
import { Camera } from "lucide-react";
import { StockOcrModal } from "./StockOcrModal";

export function StockOcrButton({
  variant = "secondary",
  label = "Scan PDF / Image (OCR)",
}: {
  variant?: "primary" | "secondary";
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={variant === "primary" ? "btn btn-primary" : "btn btn-secondary"}
        data-tooltip="Scan a distributor stock sheet, shelf count photo, or PDF bill with AI OCR to update batch quantities"
      >
        <Camera className="w-4 h-4" />
        {label}
      </button>
      <StockOcrModal isOpen={open} onClose={() => setOpen(false)} />
    </>
  );
}
