"use client";

import { useState } from "react";
import { formatINR } from "@/lib/format";
import {
  FileText,
  MessageSquare,
  Users,
  AlertTriangle,
} from "lucide-react";
import type { CustomerExposure } from "@/server/domain/receivables";
import { CustomerStatementModal } from "./CustomerStatementModal";
import { PaymentReminderModal } from "./PaymentReminderModal";

interface ReceivablesTableProps {
  customers: CustomerExposure[];
  onRefresh?: () => void;
}

export function ReceivablesTable({ customers, onRefresh }: ReceivablesTableProps) {
  const [statementCustomer, setStatementCustomer] = useState<CustomerExposure | null>(null);
  const [reminderCustomer, setReminderCustomer] = useState<CustomerExposure | null>(null);

  if (customers.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-neutral-200 p-12 text-center text-neutral-500">
        <p className="text-base font-medium text-neutral-700">No Receivables Found</p>
        <p className="text-xs text-neutral-400 mt-1">
          All customer accounts are settled or no customers match the current filter criteria.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-neutral-50 text-neutral-600 border-b border-neutral-200">
              <tr>
                <th className="py-3 px-4 font-semibold">Customer</th>
                <th className="py-3 px-4 font-semibold">Credit Limit</th>
                <th className="py-3 px-4 font-semibold text-right">Gross Dues</th>
                <th className="py-3 px-4 font-semibold text-right">Advances</th>
                <th className="py-3 px-4 font-semibold text-right">Net Exposure</th>
                <th className="py-3 px-3 font-semibold text-right">Current</th>
                <th className="py-3 px-3 font-semibold text-right">1–30d</th>
                <th className="py-3 px-3 font-semibold text-right">31–60d</th>
                <th className="py-3 px-3 font-semibold text-right">61–90d</th>
                <th className="py-3 px-3 font-semibold text-right">90d+</th>
                <th className="py-3 px-4 font-semibold text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {customers.map((c) => {
                const utilPercent =
                  c.creditLimit > 0
                    ? Math.min(100, Math.round((c.netExposure / c.creditLimit) * 100))
                    : 0;

                return (
                  <tr key={c.customerId} className="hover:bg-neutral-50/80 transition-colors">
                    {/* Customer Info */}
                    <td className="py-3 px-4">
                      <div className="font-medium text-neutral-900 flex items-center gap-1.5">
                        {c.customerName}
                        {c.isLimitExceeded && (
                          <span
                            title="Credit Limit Exceeded"
                            className="text-rose-500 inline-flex items-center"
                          >
                            <AlertTriangle className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-neutral-500 font-mono flex items-center gap-2 mt-0.5">
                        <span>{c.phone || "No phone"}</span>
                        {c.groupName && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[10px] bg-purple-50 text-purple-700 border border-purple-200">
                            <Users className="w-2.5 h-2.5" />
                            {c.groupName}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Credit Limit & Utilization */}
                    <td className="py-3 px-4">
                      <div className="text-neutral-700 font-medium">
                        {c.creditLimit > 0 ? formatINR(c.creditLimit) : "No Limit"}
                      </div>
                      {c.creditLimit > 0 && (
                        <div className="mt-1 w-24">
                          <div className="h-1.5 w-full bg-neutral-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                utilPercent >= 100
                                  ? "bg-rose-500"
                                  : utilPercent >= 75
                                  ? "bg-amber-500"
                                  : "bg-emerald-500"
                              }`}
                              style={{ width: `${utilPercent}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-neutral-400">{utilPercent}% used</span>
                        </div>
                      )}
                    </td>

                    {/* Gross Receivables */}
                    <td className="py-3 px-4 text-right font-medium text-neutral-700">
                      {formatINR(c.grossReceivables)}
                    </td>

                    {/* Available Credits */}
                    <td className="py-3 px-4 text-right font-medium text-emerald-600">
                      {c.availableCredits > 0 ? `-${formatINR(c.availableCredits)}` : "₹0.00"}
                    </td>

                    {/* Net Exposure */}
                    <td className="py-3 px-4 text-right">
                      <div className={`font-semibold ${c.isLimitExceeded ? "text-rose-600" : "text-neutral-900"}`}>
                        {formatINR(c.netExposure)}
                      </div>
                      {c.maxDaysOverdue > 0 && (
                        <div className="text-[10px] text-amber-600 font-medium">
                          {c.maxDaysOverdue}d overdue
                        </div>
                      )}
                    </td>

                    {/* Ageing Buckets */}
                    <td className="py-3 px-3 text-right text-neutral-600">
                      {c.buckets.current > 0 ? formatINR(c.buckets.current) : "—"}
                    </td>
                    <td className="py-3 px-3 text-right text-neutral-600 font-medium">
                      {c.buckets.days1to30 > 0 ? (
                        <span className="text-amber-700">{formatINR(c.buckets.days1to30)}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-3 px-3 text-right text-neutral-600 font-medium">
                      {c.buckets.days31to60 > 0 ? (
                        <span className="text-orange-700">{formatINR(c.buckets.days31to60)}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-3 px-3 text-right text-neutral-600 font-medium">
                      {c.buckets.days61to90 > 0 ? (
                        <span className="text-rose-600">{formatINR(c.buckets.days61to90)}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-3 px-3 text-right text-neutral-600 font-medium">
                      {c.buckets.over90 > 0 ? (
                        <span className="text-rose-700 font-semibold">{formatINR(c.buckets.over90)}</span>
                      ) : (
                        "—"
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setStatementCustomer(c)}
                          className="inline-flex items-center gap-1 h-7 px-2 text-neutral-600 hover:text-blue-600 hover:bg-blue-50 rounded text-xs"
                          title="View Customer Statement"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          Statement
                        </button>
                        <button
                          type="button"
                          onClick={() => setReminderCustomer(c)}
                          disabled={!c.phone || c.netExposure <= 0}
                          className="inline-flex items-center gap-1 h-7 px-2 text-neutral-600 hover:text-emerald-600 hover:bg-emerald-50 rounded text-xs disabled:opacity-40"
                          title="Send WhatsApp Payment Reminder"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          Remind
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <CustomerStatementModal
        customer={statementCustomer}
        isOpen={Boolean(statementCustomer)}
        onClose={() => setStatementCustomer(null)}
      />

      <PaymentReminderModal
        customer={reminderCustomer}
        isOpen={Boolean(reminderCustomer)}
        onClose={() => setReminderCustomer(null)}
        onSuccess={onRefresh}
      />
    </>
  );
}
