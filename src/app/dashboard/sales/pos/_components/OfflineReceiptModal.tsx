"use client";

import React, { useRef } from "react";
import { Printer, X, CheckCircle2 } from "lucide-react";
import type { OfflinePendingSale } from "@/offline/types";

interface OfflineReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  bill: OfflinePendingSale | null;
  storeName?: string;
  storeCode?: string;
}

export function OfflineReceiptModal({
  isOpen,
  onClose,
  bill,
  storeName = "MediFlow Pharmacy",
  storeCode = "STORE",
}: OfflineReceiptModalProps) {
  const printAreaRef = useRef<HTMLDivElement>(null);

  if (!isOpen || !bill) return null;

  const totalPaise = (bill.payload.payments || []).reduce((sum, p) => sum + p.amount, 0);
  const totalRs = (totalPaise / 100).toFixed(2);
  const createdDate = new Date(bill.createdAt).toLocaleString();

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col border border-ink-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="p-4 border-b border-ink-100 flex items-center justify-between bg-ink-50 print:hidden">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <h2 className="text-sm font-bold text-ink-900">Offline Sale Recorded</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary btn-icon"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Printable Receipt Body */}
        <div
          ref={printAreaRef}
          className="p-6 overflow-y-auto max-h-[70vh] font-mono text-xs text-ink-900 bg-white space-y-4"
        >
          {/* Pharmacy Details */}
          <div className="text-center border-b border-dashed border-ink-300 pb-3">
            <h1 className="text-base font-bold uppercase tracking-wider">{storeName}</h1>
            <p className="text-[11px] text-ink-600">Branch Code: [{storeCode}]</p>
            <div className="mt-1.5 py-0.5 px-2 bg-amber-100 text-amber-900 border border-amber-300 rounded text-[10px] font-bold uppercase inline-block">
              Offline Invoice — Pending Central Sync
            </div>
          </div>

          {/* Invoice Metadata */}
          <div className="text-[11px] space-y-1 border-b border-dashed border-ink-300 pb-3">
            <div className="flex justify-between">
              <span className="text-ink-600">Invoice No:</span>
              <span className="font-bold">{bill.invoiceNo}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-600">Date/Time:</span>
              <span>{createdDate}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-600">Counter Device:</span>
              <span>{bill.deviceId}</span>
            </div>
            {bill.payload.compliance?.doctorName && (
              <div className="flex justify-between">
                <span className="text-ink-600">Doctor:</span>
                <span>{bill.payload.compliance.doctorName}</span>
              </div>
            )}
            {bill.payload.compliance?.prescriptionRef && (
              <div className="flex justify-between">
                <span className="text-ink-600">Rx Ref:</span>
                <span>{bill.payload.compliance.prescriptionRef}</span>
              </div>
            )}
          </div>

          {/* Items Table */}
          <div className="space-y-2 border-b border-dashed border-ink-300 pb-3">
            <div className="flex justify-between font-bold text-[10px] uppercase text-ink-500 border-b border-ink-200 pb-1">
              <span>Item / Batch</span>
              <span>Qty</span>
            </div>
            {bill.payload.lines.map((l, idx) => (
              <div key={idx} className="space-y-0.5 text-[11px]">
                <div className="flex justify-between font-semibold">
                  <span className="truncate max-w-[240px]">Med #{l.medicineId ? l.medicineId.slice(0, 8) : "item"}</span>
                  <span>{l.qty}</span>
                </div>
                <div className="text-[10px] text-ink-500 flex justify-between">
                  <span>Batch: #{l.batchId ? l.batchId.slice(0, 8) : "N/A"}</span>
                  {l.discountBp ? <span>Disc: {l.discountBp / 100}%</span> : null}
                </div>
              </div>
            ))}
          </div>

          {/* Totals & Tenders */}
          <div className="space-y-1.5 text-xs pt-1">
            <div className="flex justify-between text-base font-bold">
              <span>Total Amount:</span>
              <span>₹{totalRs}</span>
            </div>
            <div className="border-t border-ink-200 pt-2 space-y-1 text-[11px]">
              <span className="font-semibold text-ink-700">Tender Details:</span>
              {(bill.payload.payments || []).map((p, idx) => (
                <div key={idx} className="flex justify-between text-ink-600">
                  <span className="capitalize">{p.method}:</span>
                  <span>₹{(p.amount / 100).toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="text-center text-[10px] text-ink-500 border-t border-dashed border-ink-300 pt-3">
            Thank you for your visit. Please retain this offline tax invoice.
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 border-t border-ink-100 bg-ink-50 flex items-center justify-between gap-3 print:hidden">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary text-xs flex-1"
          >
            Done (F2 New Bill)
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="btn btn-primary text-xs flex-1 flex items-center justify-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" /> Print Receipt
          </button>
        </div>
      </div>
    </div>
  );
}
