"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";
import type { ValidationResult } from "@/server/domain/stores/policies";

interface Props {
  invoicePrefix: string;
  setInvoicePrefix: (v: string) => void;
  sampleInvoiceNo: string;
  invoiceVal: ValidationResult;
}

export function StoreInvoiceSection({
  invoicePrefix,
  setInvoicePrefix,
  sampleInvoiceNo,
  invoiceVal,
}: Props) {
  return (
    <div className="card p-6 space-y-4">
      <h2 className="text-base font-semibold text-ink-900 border-b border-ink-100 pb-3">
        Invoice Numbering Series (CGST Rule 46(b))
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
        <label className="block">
          <span className="text-xs font-medium text-ink-700">Bill Prefix (e.g. INV, BLR) *</span>
          <input
            type="text"
            required
            maxLength={6}
            value={invoicePrefix}
            onChange={(e) => setInvoicePrefix(e.target.value.toUpperCase())}
            className="mt-1 block w-full input font-mono uppercase"
          />
          <span className="text-[11px] text-ink-400 mt-1 block">
            Max 3 characters recommended to guarantee 16-character ceiling with 6-digit sequences.
          </span>
        </label>

        <div className="p-4 rounded-lg bg-ink-50 border border-ink-150">
          <div className="text-xs font-medium text-ink-500 uppercase tracking-wider">Live Invoice Number Preview</div>
          <div className="text-lg font-mono font-semibold text-ink-900 mt-1">{sampleInvoiceNo}</div>
          <div className="flex items-center gap-2 mt-2 text-xs">
            {invoiceVal.valid ? (
              <span className="text-emerald-700 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> Valid length: {sampleInvoiceNo.length}/16 characters
              </span>
            ) : (
              <span className="text-red-600 flex items-center gap-1 font-medium">
                <AlertCircle className="h-3.5 w-3.5" /> {invoiceVal.error}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
