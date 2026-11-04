import { format } from "date-fns";
import { formatINR } from "@/lib/format";
import { Banknote, Building, CreditCard, QrCode } from "lucide-react";

interface ExpenseRow {
  id: string;
  paymentNo: string;
  method: string;
  amount: number | null;
  paymentDate: string;
  reference: string | null;
  note: string | null;
  paidFromTill: boolean;
  cashSessionId: string | null;
  payeeName: string | null;
  vendorInvoiceNo: string | null;
  categoryName: string | null;
  categoryCode: string | null;
}

interface ExpenseTableProps {
  items: ExpenseRow[];
}

export function ExpenseTable({ items }: ExpenseTableProps) {
  function getMethodIcon(method: string) {
    switch (method) {
      case "cash":
        return <Banknote className="h-3.5 w-3.5 text-amber-600" />;
      case "upi":
        return <QrCode className="h-3.5 w-3.5 text-indigo-600" />;
      case "card":
        return <CreditCard className="h-3.5 w-3.5 text-blue-600" />;
      default:
        return <Building className="h-3.5 w-3.5 text-emerald-600" />;
    }
  }

  return (
    <div className="card overflow-hidden bg-white shadow-sm border border-ink-150">
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-28">Date</th>
              <th className="w-32">Voucher #</th>
              <th>Category</th>
              <th>Payee & Details</th>
              <th className="w-28">Method</th>
              <th className="w-32">Source</th>
              <th className="text-right w-32">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.id} className="hover:bg-ink-50/60 transition-colors">
                <td className="text-[13px] text-ink-600 font-mono">
                  {format(new Date(row.paymentDate), "dd MMM yyyy")}
                </td>
                <td className="font-mono text-[13px] font-medium text-ink-900">
                  {row.paymentNo}
                </td>
                <td>
                  <span className="font-medium text-ink-900 text-[13px]">
                    {row.categoryName || "Uncategorized"}
                  </span>
                  {row.categoryCode && (
                    <span className="ml-1.5 text-[11px] font-mono text-ink-400">
                      [{row.categoryCode}]
                    </span>
                  )}
                </td>
                <td>
                  <div className="text-[13px] font-medium text-ink-900">
                    {row.payeeName || "—"}
                  </div>
                  {(row.vendorInvoiceNo || row.reference || row.note) && (
                    <div className="text-[11px] text-ink-500 truncate max-w-xs">
                      {row.vendorInvoiceNo && `Inv: ${row.vendorInvoiceNo} • `}
                      {row.reference && `Ref: ${row.reference} • `}
                      {row.note}
                    </div>
                  )}
                </td>
                <td>
                  <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium bg-ink-100 text-ink-700 capitalize">
                    {getMethodIcon(row.method)}
                    {row.method}
                  </span>
                </td>
                <td>
                  {row.method === "cash" ? (
                    row.paidFromTill ? (
                      <span className="inline-flex items-center rounded bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                        Till Drawer
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded bg-ink-100 px-2 py-0.5 text-[11px] font-medium text-ink-600">
                        Office Cash
                      </span>
                    )
                  ) : (
                    <span className="text-[12px] text-ink-500 font-medium">Bank / Online</span>
                  )}
                </td>
                <td className="text-right font-mono text-[14px] font-semibold text-ink-900">
                  {formatINR(row.amount ?? 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
