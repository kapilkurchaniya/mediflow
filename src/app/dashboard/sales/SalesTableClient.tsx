"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Eye, Printer } from "lucide-react";
import { Avatar, TableWrapper } from "@/app/components/ui";
import { formatINR, formatNumber } from "@/lib/format";

export interface SalesTableRow {
  sale: {
    id: string;
    invoiceNo: string | null;
    status: string;
    totalAmount: number;
    paidAmount: number | null;
    creditAmount: number | null;
    returnedAmount: number | null;
    customerName: string | null;
    doctorName: string | null;
    createdAt: Date | string;
    completedAt: Date | string | null;
  };
  customer: {
    name: string;
  } | null;
}

export function SalesTableClient({ rows }: { rows: SalesTableRow[] }) {
  const router = useRouter();

  return (
    <TableWrapper>
      <table className="data-table data-table-sticky min-w-[800px]">
        <thead>
          <tr>
            <th>Invoice</th>
            <th>Date</th>
            <th>Customer</th>
            <th>Prescribed by</th>
            <th className="text-right">Amount</th>
            <th className="text-right">Status</th>
            <th className="text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ sale, customer }) => {
            const name = customer?.name || sale.customerName || "Walk-in customer";
            const isCancelled = sale.status === "cancelled";
            const isReturned = !isCancelled && (sale.returnedAmount ?? 0) > 0;
            const paid = !sale.creditAmount || sale.creditAmount <= 0;
            const partial = !paid && (sale.paidAmount ?? 0) > 0;
            const href = `/dashboard/sales/${sale.id}`;

            return (
              <tr
                key={sale.id}
                role="link"
                tabIndex={0}
                onClick={() => router.push(href)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(href);
                  }
                }}
                className="hover:bg-brand-50/40 transition-colors cursor-pointer focus-visible:bg-brand-50/50 outline-none"
              >
                <td>
                  <Link
                    href={href}
                    onClick={(e) => e.stopPropagation()}
                    className="block w-full font-mono text-[12.5px] font-bold text-brand-700 hover:text-brand-900 hover:underline"
                  >
                    {sale.invoiceNo || "—"}
                  </Link>
                </td>
                <td className="text-ink-600 num whitespace-nowrap">
                  {format(new Date(sale.completedAt ?? sale.createdAt), "d MMM yyyy")}
                  <div className="cell-sub">{format(new Date(sale.completedAt ?? sale.createdAt), "hh:mm a")}</div>
                </td>
                <td>
                  <div className="flex items-center gap-2.5">
                    <Avatar name={name} size="sm" />
                    <span className="text-ink-800 font-medium">{name}</span>
                  </div>
                </td>
                <td className="text-ink-600">{sale.doctorName || <span className="text-ink-400">—</span>}</td>
                <td className={`text-right font-bold num ${isCancelled ? "text-ink-400 line-through" : "text-ink-900"}`}>
                  {formatINR(sale.totalAmount)}
                </td>
                <td className="text-right">
                  <div className="inline-flex items-center justify-end gap-1">
                    {isCancelled ? (
                      <span className="badge badge-dot badge-danger">Cancelled</span>
                    ) : (
                      <span
                        className={`badge badge-dot ${paid ? "badge-success" : partial ? "badge-warning" : "badge-danger"}`}
                      >
                        {paid ? "Paid" : partial ? "Partial" : "Unpaid"}
                      </span>
                    )}
                    {isReturned && (
                      <span className="badge badge-warning !text-[10px]">Returned</span>
                    )}
                  </div>
                </td>
                <td className="text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="inline-flex items-center gap-1.5">
                    <Link
                      href={href}
                      className="btn btn-secondary btn-icon !h-7 !w-7"
                      title="View Invoice Details"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Link>
                    <Link
                      href={`/dashboard/sales/${sale.id}/print?format=thermal`}
                      className="btn btn-secondary btn-icon !h-7 !w-7"
                      title="Print Thermal 80mm Slip"
                    >
                      <Printer className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex items-center justify-between border-t border-ink-150 px-4 py-2.5 text-[12.5px] text-ink-500">
        <span className="num">Showing {formatNumber(rows.length)} invoices</span>
      </div>
    </TableWrapper>
  );
}
