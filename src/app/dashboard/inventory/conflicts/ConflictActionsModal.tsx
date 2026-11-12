"use client";

import React, { useState, useEffect } from "react";
import { X, Clock, AlertCircle } from "lucide-react";
import { getConflictDetailsAction } from "@/app/actions/conflicts";
import { ConflictModalTabs } from "./ConflictModalTabs";
import type { ConflictDetailsData, ConflictContributionItem } from "./types";

interface ConflictActionsModalProps {
  conflictCaseId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function ConflictActionsModal({
  conflictCaseId,
  onClose,
  onSuccess,
}: ConflictActionsModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ConflictDetailsData | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      const res = await getConflictDetailsAction(conflictCaseId);
      if (res.success && res.data) {
        setData(res.data);
      } else {
        setError(res.error || "Failed to load conflict details");
      }
      setLoading(false);
    }
    load();
  }, [conflictCaseId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white border border-ink-150 rounded-2xl w-full max-w-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-ink-150">
          <div>
            <h2 className="text-lg font-bold text-ink-900">
              Resolve Stock Conflict
            </h2>
            {data?.conflictCase && (
              <p className="text-xs text-ink-500 mt-0.5">
                {data.conflictCase.medicineName} · Batch #{data.conflictCase.batchNo} (Exp:{" "}
                {data.conflictCase.expiryDate})
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-ink-400 hover:text-ink-600 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="py-12 text-center text-sm text-ink-500">
              Loading conflict details...
            </div>
          ) : !data ? (
            <div className="py-12 text-center text-sm text-ink-500">
              No conflict details available.
            </div>
          ) : (
            <>
              {/* Conflict Status Banner */}
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-amber-800 uppercase">
                    Status: {data.conflictCase.status.replace("_", " ")}
                  </span>
                  <p className="text-xs text-ink-600 mt-0.5">
                    Required reconciliation: <strong>{data.conflictCase.requiredReconciliationQty}</strong> · Reconciled: <strong>{data.conflictCase.reconciledQty}</strong>
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs text-ink-500">Outstanding Deficit</span>
                  <p className="text-base font-bold text-rose-600">
                    {data.conflictCase.outstandingQty} units
                  </p>
                </div>
              </div>

              {/* Resolution Action Tabs */}
              <ConflictModalTabs
                conflictCaseId={conflictCaseId}
                data={data}
                onSuccess={onSuccess}
                onError={(err) => setError(err)}
              />

              {/* Contributing Sales Section */}
              <div className="border-t border-ink-150 pt-3">
                <p className="text-xs font-semibold text-ink-900 mb-1.5 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-ink-400" />
                  Contributing Offline Sales
                </p>
                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                  {data.contributions.map((c: ConflictContributionItem) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between text-xs p-2 bg-ink-50 rounded-lg border border-ink-100"
                    >
                      <div>
                        <span className="font-mono font-medium text-ink-800">
                          {c.invoiceNo}
                        </span>
                        <span className="text-ink-400 ml-2">Device #{c.deviceId.slice(0, 8)}</span>
                      </div>
                      <span className="font-semibold text-rose-600">-{c.contributedQty} units</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
