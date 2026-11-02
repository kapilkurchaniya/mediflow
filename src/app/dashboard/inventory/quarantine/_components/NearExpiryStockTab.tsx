"use client";

import React from "react";
import { formatINR, formatNumber } from "@/lib/format";
import { ShieldAlert } from "lucide-react";
import type { NearExpiryBatch } from "./types";

interface Props {
  nearExpiry: NearExpiryBatch[];
  onOpenQuarantine: (batch: NearExpiryBatch) => void;
}

export function NearExpiryStockTab({ nearExpiry, onOpenQuarantine }: Props) {
  return (
    <div className="space-y-4">
      <div className="text-xs text-ink-500">
        Batches expiring within 90 days or already expired sitting in active inventory.
        Click <strong>Quarantine</strong> to immediately isolate a batch so it cannot be billed in POS.
      </div>

      <div className="card overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>Medicine & Salt</th>
              <th>Batch #</th>
              <th>Expiry Date</th>
              <th>Distributor</th>
              <th className="text-right">On Hand Qty</th>
              <th className="text-right">Cost Value</th>
              <th className="text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {nearExpiry.map((b) => (
              <tr key={b.id}>
                <td>
                  <div className="cell-primary">{b.medicineName}</div>
                  {b.genericName && (
                    <div className="cell-sub">{b.genericName}</div>
                  )}
                </td>
                <td className="font-mono text-xs font-semibold text-ink-800">
                  {b.batchNo}
                </td>
                <td>
                  <span
                    className={
                      b.isExpired
                        ? "badge badge-danger text-[11px]"
                        : "badge badge-warning text-[11px]"
                    }
                  >
                    {b.expiryDate} {b.isExpired ? "(EXPIRED)" : ""}
                  </span>
                </td>
                <td className="text-ink-600 text-xs">
                  {b.supplierName || "Direct / Unassigned"}
                </td>
                <td className="text-right font-bold text-ink-900 num">
                  {formatNumber(b.qtyOnHand)} {b.looseUnit || "units"}
                </td>
                <td className="text-right text-ink-600 num">
                  {formatINR(b.purchaseRatePaise * b.qtyOnHand)}
                </td>
                <td className="text-right">
                  <button
                    onClick={() => onOpenQuarantine(b)}
                    className="btn btn-sm text-white bg-rose-600 hover:bg-rose-700"
                  >
                    <ShieldAlert className="w-3.5 h-3.5" />
                    Quarantine
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
