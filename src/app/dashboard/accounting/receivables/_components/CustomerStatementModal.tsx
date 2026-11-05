"use client";

import { formatINR } from "@/lib/format";
import { FileText, Calendar, Building2, AlertTriangle, Users, X } from "lucide-react";
import type { CustomerExposure } from "@/server/domain/receivables";

interface CustomerStatementModalProps {
  customer: CustomerExposure | null;
  isOpen: boolean;
  onClose: () => void;
}

export function CustomerStatementModal({
  customer,
  isOpen,
  onClose,
}: CustomerStatementModalProps) {
  if (!isOpen || !customer) return null;

  const invoices = customer.openInvoices ?? [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Customer Statement"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-950/40 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[85vh] flex flex-col p-6 rounded-xl border border-ink-150 bg-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-ink-150">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2 text-ink-900 leading-none">
                {customer.customerName}
                {customer.groupName && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 font-normal border border-purple-200 flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {customer.groupName}
                  </span>
                )}
              </h2>
              <p className="text-xs text-ink-500 mt-1">
                Phone: {customer.phone || "N/A"} • Credit Terms: {customer.creditDays} days • Credit Limit: {formatINR(customer.creditLimit)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-xs text-ink-500">Net Outstanding</div>
              <div className="text-xl font-bold text-rose-600">{formatINR(customer.netExposure)}</div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-600"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Financial Overview Metrics */}
        <div className="grid grid-cols-4 gap-3 py-3 border-b border-neutral-100 my-2">
          <div className="bg-neutral-50 p-2.5 rounded-lg border border-neutral-200">
            <div className="text-[11px] text-neutral-500 uppercase font-medium">Gross Bills Due</div>
            <div className="text-sm font-semibold text-neutral-800">{formatINR(customer.grossReceivables)}</div>
          </div>
          <div className="bg-neutral-50 p-2.5 rounded-lg border border-neutral-200">
            <div className="text-[11px] text-neutral-500 uppercase font-medium">Advances / Credits</div>
            <div className="text-sm font-semibold text-emerald-600">{formatINR(customer.availableCredits)}</div>
          </div>
          <div className="bg-neutral-50 p-2.5 rounded-lg border border-neutral-200">
            <div className="text-[11px] text-neutral-500 uppercase font-medium">Max Overdue</div>
            <div className="text-sm font-semibold text-amber-600 flex items-center gap-1">
              {customer.maxDaysOverdue > 0 && <AlertTriangle className="w-3.5 h-3.5" />}
              {customer.maxDaysOverdue} days
            </div>
          </div>
          <div className="bg-neutral-50 p-2.5 rounded-lg border border-neutral-200">
            <div className="text-[11px] text-neutral-500 uppercase font-medium">Open Bills Count</div>
            <div className="text-sm font-semibold text-neutral-800">{invoices.length} bill(s)</div>
          </div>
        </div>

        {/* Open Invoices Table */}
        <div className="flex-1 overflow-auto border border-neutral-200 rounded-lg">
          <table className="w-full text-xs text-left">
            <thead className="bg-neutral-50 text-neutral-600 border-b border-neutral-200 sticky top-0">
              <tr>
                <th className="py-2 px-3 font-medium">Invoice Date</th>
                <th className="py-2 px-3 font-medium">Invoice No</th>
                <th className="py-2 px-3 font-medium">Store</th>
                <th className="py-2 px-3 font-medium text-right">Total Bill</th>
                <th className="py-2 px-3 font-medium text-right">Paid</th>
                <th className="py-2 px-3 font-medium text-right">Balance Due</th>
                <th className="py-2 px-3 font-medium">Due Date</th>
                <th className="py-2 px-3 font-medium text-center">Bucket</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-neutral-400">
                    No open invoices pending settlement.
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.saleId} className="hover:bg-neutral-50">
                    <td className="py-2 px-3 text-neutral-600 flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-neutral-400" />
                      {inv.completedAt}
                    </td>
                    <td className="py-2 px-3 font-mono font-medium text-neutral-800">{inv.invoiceNo}</td>
                    <td className="py-2 px-3 text-neutral-600 flex items-center gap-1">
                      <Building2 className="w-3 h-3 text-neutral-400" />
                      {inv.storeName || "Store"}
                    </td>
                    <td className="py-2 px-3 text-right text-neutral-600">{formatINR(inv.totalAmount)}</td>
                    <td className="py-2 px-3 text-right text-emerald-600">{formatINR(inv.paidAmount)}</td>
                    <td className="py-2 px-3 text-right font-semibold text-rose-600">{formatINR(inv.openBalance)}</td>
                    <td className="py-2 px-3 text-neutral-600">
                      {inv.dueDate}
                      {inv.daysOverdue > 0 && (
                        <span className="ml-1 text-[10px] text-rose-500 font-medium">({inv.daysOverdue}d over)</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          inv.bucket === "current"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : inv.bucket === "days1to30"
                            ? "bg-amber-50 text-amber-700 border border-amber-200"
                            : inv.bucket === "days31to60"
                            ? "bg-orange-50 text-orange-700 border border-orange-200"
                            : "bg-rose-50 text-rose-700 border border-rose-200"
                        }`}
                      >
                        {inv.bucket === "current"
                          ? "Not Due"
                          : inv.bucket === "days1to30"
                          ? "1-30d"
                          : inv.bucket === "days31to60"
                          ? "31-60d"
                          : inv.bucket === "days61to90"
                          ? "61-90d"
                          : "90d+"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
