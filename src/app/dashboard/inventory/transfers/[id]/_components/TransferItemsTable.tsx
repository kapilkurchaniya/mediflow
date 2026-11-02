"use client";

import { formatINR } from "@/lib/format";

export interface TransferTableItem {
  id: string;
  medicineName: string;
  batchNo: string;
  expiryDate: string;
  unitCost: number | null;
  qtyDispatched: number;
  receivedQty: number;
  qtyDamaged: number;
  qtyShortage: number;
}

interface TransferItemsTableProps {
  items: TransferTableItem[];
  totalValuePaise: number;
}

export function TransferItemsTable({ items, totalValuePaise }: TransferItemsTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-ink-200 bg-white shadow-xs">
      <div className="p-4 border-b border-ink-100 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink-900">Transfer Line Items</h2>
        <span className="text-xs text-ink-500">{items?.length ?? 0} batches</span>
      </div>

      <table className="min-w-full divide-y divide-ink-200 text-left text-xs">
        <thead className="bg-ink-50/50 text-ink-600 font-medium">
          <tr>
            <th className="py-2.5 px-4">Medicine</th>
            <th className="py-2.5 px-4">Batch</th>
            <th className="py-2.5 px-4">Expiry</th>
            <th className="py-2.5 px-4 text-right">Unit Cost</th>
            <th className="py-2.5 px-4 text-right">Dispatched</th>
            <th className="py-2.5 px-4 text-right">Received</th>
            <th className="py-2.5 px-4 text-right">Damaged</th>
            <th className="py-2.5 px-4 text-right">Shortage</th>
            <th className="py-2.5 px-4 text-right">Total Value</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100 text-ink-700">
          {items?.map((item) => (
            <tr key={item.id} className="hover:bg-ink-50/50 transition-colors">
              <td className="py-2.5 px-4 font-medium text-ink-900">{item.medicineName}</td>
              <td className="py-2.5 px-4 font-mono">{item.batchNo}</td>
              <td className="py-2.5 px-4 text-ink-500">{item.expiryDate}</td>
              <td className="py-2.5 px-4 text-right">{formatINR(item.unitCost)}</td>
              <td className="py-2.5 px-4 text-right font-medium">{item.qtyDispatched}</td>
              <td className="py-2.5 px-4 text-right text-emerald-700 font-semibold">{item.receivedQty}</td>
              <td className="py-2.5 px-4 text-right text-amber-700">{item.qtyDamaged}</td>
              <td className="py-2.5 px-4 text-right text-rose-700">{item.qtyShortage}</td>
              <td className="py-2.5 px-4 text-right font-semibold text-ink-900">
                {formatINR(item.qtyDispatched * (item.unitCost ?? 0))}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-ink-50/50 font-semibold text-ink-900 text-xs">
          <tr>
            <td colSpan={8} className="py-3 px-4 text-right">Total Valuation:</td>
            <td className="py-3 px-4 text-right text-brand-700">
              {formatINR(totalValuePaise)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
