"use client";

import React from "react";
import { formatINR } from "@/lib/format";
import { FileText } from "lucide-react";
import type { ExpiryClaimItem } from "./types";

interface Props {
  claims: ExpiryClaimItem[];
  onOpenSettleModal: (claim: ExpiryClaimItem) => void;
}

export function DistributorClaimsTab({ claims, onOpenSettleModal }: Props) {
  if (claims.length === 0) {
    return (
      <div className="card p-12 text-center">
        <FileText className="w-10 h-10 text-ink-400 mx-auto mb-2" />
        <h4 className="font-semibold text-ink-900 text-sm">
          No Distributor Claims Found
        </h4>
        <p className="text-xs text-ink-500 mt-1 max-w-sm mx-auto">
          Generate formal debit note claims (DN/EXP/...) from the Quarantined Dump Stock tab.
        </p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <table className="data-table">
        <thead>
          <tr>
            <th>Claim #</th>
            <th>Distributor</th>
            <th>Claim Date</th>
            <th className="text-right">Debit Amount</th>
            <th>Status</th>
            <th>Settlement Info</th>
            <th className="text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {claims.map((claim) => (
            <tr key={claim.id}>
              <td className="font-bold text-brand-700 font-mono">
                {claim.claimNo}
              </td>
              <td className="font-medium text-ink-900">
                {claim.supplierName}
              </td>
              <td className="text-ink-500">
                {typeof claim.createdAt === "string"
                  ? claim.createdAt.slice(0, 10)
                  : new Date(claim.createdAt).toLocaleDateString()}
              </td>
              <td className="text-right font-bold text-ink-900 num">
                {formatINR(claim.totalPaise)}
              </td>
              <td>
                <span
                  className={
                    claim.status === "settled"
                      ? "badge badge-success uppercase text-[10px]"
                      : claim.status === "submitted"
                      ? "badge badge-warning uppercase text-[10px]"
                      : "badge badge-danger uppercase text-[10px]"
                  }
                >
                  {claim.status}
                </span>
              </td>
              <td className="text-ink-600">
                {claim.settlementType ? (
                  <span>
                    {claim.settlementType.replace("_", " ")}
                    {claim.supplierCreditNoteNo ? ` (${claim.supplierCreditNoteNo})` : ""}
                  </span>
                ) : (
                  <span className="text-ink-400 italic">Pending distributor resolution</span>
                )}
              </td>
              <td className="text-right">
                {claim.status === "submitted" && (
                  <button
                    onClick={() => onOpenSettleModal(claim)}
                    className="btn btn-secondary btn-sm"
                  >
                    Settle Claim
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
