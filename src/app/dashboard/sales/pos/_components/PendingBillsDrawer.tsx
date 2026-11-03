"use client";

import React, { useState } from "react";
import { X, RefreshCw, Download, Printer, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { getPosDB } from "@/offline/db";
import { useLiveQuery } from "@/offline/useLiveQuery";
import type { OfflinePendingSale } from "@/offline/types";

interface PendingBillsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  storeId: string;
  storeCode?: string;
  isOffline: boolean;
  isSyncing: boolean;
  onTriggerSync: () => Promise<void>;
  onReprintBill: (sale: OfflinePendingSale) => void;
}

export function PendingBillsDrawer({
  isOpen,
  onClose,
  storeId,
  storeCode = "STORE",
  isOffline,
  isSyncing,
  onTriggerSync,
  onReprintBill,
}: PendingBillsDrawerProps) {
  const [isExporting, setIsExporting] = useState(false);
  const db = typeof window !== "undefined" ? getPosDB() : null;

  // Reactively query all pending/syncing/rejected/synced bills for this store
  const bills = useLiveQuery<OfflinePendingSale[]>(
    async () => {
      if (!db || !storeId) return [];
      const list = await db.pendingSales
        .where("storeId")
        .equals(storeId)
        .reverse()
        .sortBy("createdAt");
      return list;
    },
    [db, storeId],
    [],
  );

  const pendingCount = bills.filter((b) => b.status === "pending" || b.status === "syncing").length;

  const handleExportJson = () => {
    if (bills.length === 0) return;
    const ok = window.confirm(
      "Exporting pending bills generates a disaster recovery backup file. Do not share this file publicly. Proceed with export?",
    );
    if (!ok) return;

    setIsExporting(true);
    try {
      // Strict allowlist: exclude device credentials, token hashes, or session cookies
      const sanitized = bills.map((b) => ({
        clientSaleId: b.clientSaleId,
        invoiceNo: b.invoiceNo,
        createdAt: b.createdAt,
        storeId: b.storeId,
        deviceId: b.deviceId,
        status: b.status,
        itemCount: b.payload.lines?.length || 0,
        payments: (b.payload.payments || []).map((p) => ({
          method: p.method,
          amountPaise: p.amount,
          reference: p.reference,
        })),
        lines: b.payload.lines.map((l) => ({
          batchId: l.batchId,
          medicineId: l.medicineId,
          qty: l.qty,
          discountBp: l.discountBp,
        })),
        compliance: b.payload.compliance ? {
          doctorName: b.payload.compliance.doctorName,
          doctorRegNo: b.payload.compliance.doctorRegNo,
          prescriptionRef: b.payload.compliance.prescriptionRef,
        } : undefined,
      }));

      const dump = {
        version: "mediflow-offline-outbox-v1",
        exportedAt: new Date().toISOString(),
        storeId,
        storeCode,
        count: sanitized.length,
        pendingSales: sanitized,
      };

      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mediflow-pending-bills-${storeCode.toLowerCase()}-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-xs flex justify-end">
      <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col border-l border-ink-200">
        {/* Header */}
        <div className="p-4 border-b border-ink-100 flex items-center justify-between bg-ink-50">
          <div>
            <h2 className="text-base font-bold text-ink-900 flex items-center gap-2">
              Pending Bills Outbox
              {pendingCount > 0 && (
                <span className="badge badge-warning text-xs font-mono">
                  {pendingCount} waiting
                </span>
              )}
            </h2>
            <p className="text-xs text-ink-500 mt-0.5">
              Branch: <span className="font-semibold">{storeCode}</span> · Offline sales queue
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary btn-icon"
            title="Close Drawer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {bills.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-ink-400">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mb-2 opacity-80" />
              <p className="text-sm font-semibold text-ink-700">Outbox is clear</p>
              <p className="text-xs text-ink-500 mt-1">
                All bills have been synced with the central server.
              </p>
            </div>
          ) : (
            bills.map((bill) => {
              const totalPaise = (bill.payload.payments || []).reduce((sum, p) => sum + p.amount, 0);
              const totalRs = (totalPaise / 100).toFixed(2);
              const methods = (bill.payload.payments || []).map((p) => p.method).join(", ");
              const createdDate = new Date(bill.createdAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              });

              return (
                <div
                  key={bill.clientSaleId}
                  className="p-3.5 bg-white border border-ink-200 rounded-xl shadow-2xs hover:border-brand-300 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-brand-700">
                      {bill.invoiceNo}
                    </span>
                    <span
                      className={`badge text-[11px] font-medium capitalize flex items-center gap-1 ${
                        bill.status === "synced"
                          ? "badge-success text-emerald-800 bg-emerald-50"
                          : bill.status === "rejected"
                          ? "badge-danger text-red-800 bg-red-50"
                          : bill.status === "syncing"
                          ? "badge-brand text-brand-800 bg-brand-50"
                          : "badge-warning text-amber-800 bg-amber-50"
                      }`}
                    >
                      {bill.status === "syncing" ? (
                        <RefreshCw className="w-3 h-3 animate-spin" />
                      ) : bill.status === "synced" ? (
                        <CheckCircle2 className="w-3 h-3" />
                      ) : bill.status === "rejected" ? (
                        <AlertCircle className="w-3 h-3" />
                      ) : (
                        <Clock className="w-3 h-3" />
                      )}
                      {bill.status}
                    </span>
                  </div>

                  <div className="mt-2 flex items-center justify-between text-xs text-ink-600">
                    <span>
                      {createdDate} · {bill.payload.lines?.length || 0} items
                    </span>
                    <span className="font-bold text-ink-900 font-mono text-sm">
                      ₹{totalRs}
                    </span>
                  </div>

                  <div className="mt-2 flex items-center justify-between border-t border-ink-100 pt-2 text-[11px] text-ink-500">
                    <span className="capitalize">Tender: {methods}</span>
                    <button
                      type="button"
                      onClick={() => onReprintBill(bill)}
                      className="text-brand-600 hover:text-brand-800 font-medium inline-flex items-center gap-1"
                      title="Reprint receipt"
                    >
                      <Printer className="w-3.5 h-3.5" /> Reprint
                    </button>
                  </div>

                  {bill.lastError && (
                    <div className="mt-2 text-[11px] text-red-600 bg-red-50 p-1.5 rounded border border-red-200">
                      {bill.lastError}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-ink-200 bg-ink-50 flex items-center gap-2">
          <button
            type="button"
            onClick={onTriggerSync}
            disabled={isSyncing || isOffline || pendingCount === 0}
            className="btn btn-primary flex-1 flex items-center justify-center gap-1.5 text-xs py-2"
            title={
              isOffline
                ? "Connect to internet to sync"
                : pendingCount === 0
                ? "No bills waiting"
                : "Sync outbox with server"
            }
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
            {isSyncing ? "Syncing..." : "Sync Now"}
          </button>

          <button
            type="button"
            onClick={handleExportJson}
            disabled={isExporting || bills.length === 0}
            className="btn btn-secondary flex items-center justify-center gap-1.5 text-xs py-2 px-3"
            title="Download pending bills JSON for support or backup"
          >
            <Download className="w-3.5 h-3.5" /> Export JSON
          </button>
        </div>
      </div>
    </div>
  );
}
