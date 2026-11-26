"use client";

import React from "react";
import { Tag } from "lucide-react";
import { generateTsplLabel } from "@/lib/barcode/label-printer";

export function PrintBarcodeLabelButton({
  storeName,
  medicineName,
  batchNo,
  expiryDate,
  mrpPaise,
  barcode,
}: {
  storeName: string;
  medicineName: string;
  batchNo: string;
  expiryDate: string;
  mrpPaise: number;
  barcode: string;
}) {
  function handlePrintLabel() {
    const tspl = generateTsplLabel({
      storeName,
      medicineName,
      batchNo,
      expiryDate,
      mrpPaise,
      barcode: barcode || batchNo,
      copies: 1,
    });
    const blob = new Blob([tspl], { type: "text/plain;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Label_${batchNo}.prn`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={handlePrintLabel}
      className="btn btn-xs btn-ghost text-ink-600 hover:text-brand-700"
      title="Download TSPL Barcode / MRP Label (.prn)"
    >
      <Tag className="w-3.5 h-3.5" /> Label
    </button>
  );
}
