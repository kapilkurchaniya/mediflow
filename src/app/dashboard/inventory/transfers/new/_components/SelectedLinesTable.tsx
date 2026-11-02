"use client";

import { Trash2 } from "lucide-react";
import { formatINR } from "@/lib/format";

export interface SelectedLine {
  medicineId: string;
  medicineName: string;
  fromBatchId: string;
  batchNo: string;
  expiryDate: string;
  qtyOnHand: number;
  qty: number;
  unitCost: number;
  mrp: number;
}

interface SelectedLinesTableProps {
  lines: SelectedLine[];
  onUpdateQty: (batchId: string, qty: number) => void;
  onRemoveLine: (batchId: string) => void;
  totalValuePaise: number;
}

export function SelectedLinesTable({
  lines,
  onUpdateQty,
  onRemoveLine,
  totalValuePaise,
}: SelectedLinesTableProps) {
  if (lines.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-lg border border-ink-200">
      <table className="min-w-full divide-y divide-ink-200 text-left text-xs">
        <thead className="bg-ink-50/50 text-ink-600 font-medium">
          <tr>
            <th className="py-2.5 px-3">Medicine</th>
            <th className="py-2.5 px-3">Batch & Expiry</th>
            <th className="py-2.5 px-3 text-right">Available</th>
            <th className="py-2.5 px-3 text-center w-28">Transfer Qty</th>
            <th className="py-2.5 px-3 text-right">Cost Rate</th>
            <th className="py-2.5 px-3 text-right">Total Cost</th>
            <th className="py-2.5 px-3 text-right"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100 text-ink-700">
          {lines.map((line) => (
            <tr key={line.fromBatchId}>
              <td className="py-2.5 px-3 font-medium text-ink-900">{line.medicineName}</td>
              <td className="py-2.5 px-3">
                <span className="font-mono">{line.batchNo}</span>
                <span className="text-ink-400 ml-1.5 text-[11px]">({line.expiryDate})</span>
              </td>
              <td className="py-2.5 px-3 text-right font-medium">{line.qtyOnHand}</td>
              <td className="py-2.5 px-3 text-center">
                <input
                  type="number"
                  min={1}
                  max={line.qtyOnHand}
                  value={line.qty}
                  onChange={(e) => onUpdateQty(line.fromBatchId, parseInt(e.target.value) || 1)}
                  className="w-20 rounded border border-ink-200 py-1 px-2 text-center text-xs font-medium focus:border-brand-500 focus:outline-none"
                />
              </td>
              <td className="py-2.5 px-3 text-right">{formatINR(line.unitCost)}</td>
              <td className="py-2.5 px-3 text-right font-semibold text-ink-900">
                {formatINR(line.qty * line.unitCost)}
              </td>
              <td className="py-2.5 px-3 text-right">
                <button
                  type="button"
                  onClick={() => onRemoveLine(line.fromBatchId)}
                  className="text-ink-400 hover:text-rose-600 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-ink-50/50 font-semibold text-ink-900">
          <tr>
            <td colSpan={5} className="py-2.5 px-3 text-right">Consignment Valuation:</td>
            <td className="py-2.5 px-3 text-right text-brand-700">{formatINR(totalValuePaise)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
