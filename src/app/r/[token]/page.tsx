import { notFound } from "next/navigation";
import { format } from "date-fns";
import {
  Printer,
  AlertCircle,
  CheckCircle2,
  Phone,
  MapPin,
  FileText,
  ShieldAlert,
} from "lucide-react";
import { formatINR } from "@/lib/money";
import { getPublicReceiptData } from "@/server/domain/sales/public-receipt";
import { PublicPrintButton } from "./PublicPrintButton";

export const dynamic = "force-dynamic";

export default async function PublicReceiptPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const resolvedParams = await params;
  const token = resolvedParams.token;

  const result = await getPublicReceiptData(token);

  if (!result.success) {
    return (
      <div className="min-h-screen bg-ink-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-ink-100 p-8 text-center space-y-4">
          <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-ink-900">Receipt Not Found</h1>
          <p className="text-sm text-ink-600">
            {result.error || "This receipt link is invalid or has expired."}
          </p>
          <div className="pt-4 border-t border-ink-100 text-xs text-ink-500">
            If you made a recent purchase at MediFlow, please contact the pharmacy counter with your invoice number.
          </div>
        </div>
      </div>
    );
  }

  const { sale, items, store, payments, pharmacyBrandName } = result.data;
  const formattedDate = sale.completedAt || sale.createdAt
    ? format(new Date(sale.completedAt || sale.createdAt!), "dd MMM yyyy, hh:mm a")
    : "N/A";

  return (
    <div className="min-h-screen bg-ink-100 py-6 px-3 sm:px-6 font-sans text-ink-900 print:bg-white print:p-0">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl border border-ink-200 shadow-md p-6 sm:p-8 print:shadow-none print:border-none print:p-0">
        {/* Top Print / Save Action Bar */}
        <div className="flex items-center justify-between pb-6 border-b border-ink-100 print:hidden">
          <span className="text-xs font-semibold uppercase tracking-wider text-brand-700 bg-brand-50 px-2.5 py-1 rounded-full">
            Official Tax Invoice
          </span>
          <PublicPrintButton />
        </div>

        {/* Cancellation Watermark Alert */}
        {sale.isCancelled && (
          <div className="my-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-800">
            <ShieldAlert className="w-6 h-6 text-red-600 flex-shrink-0" />
            <div>
              <div className="font-bold text-sm uppercase tracking-wide">Invoice Cancelled / Void</div>
              <div className="text-xs text-red-600">
                This transaction has been cancelled in the pharmacy records.
                {sale.cancelReason ? ` Reason: ${sale.cancelReason}` : ""}
              </div>
            </div>
          </div>
        )}

        {/* Pharmacy Header */}
        <div className="text-center mt-4 pb-6 border-b border-ink-100">
          <h1 className="text-2xl font-bold text-ink-900 tracking-tight">{store.name}</h1>
          <p className="text-xs text-ink-500 mt-1">{pharmacyBrandName}</p>
          <div className="text-xs text-ink-600 mt-2 space-y-0.5">
            {store.address && <div>{store.address}, {store.city} - {store.pincode}</div>}
            {store.phone && (
              <div className="flex items-center justify-center gap-1">
                <Phone className="w-3 h-3 text-ink-400" />
                <span>Ph: {store.phone}</span>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-center gap-x-4 pt-1 font-mono text-[11px] text-ink-500">
              {store.gstin && <span>GSTIN: {store.gstin}</span>}
              {store.drugLicenseNo && <span>D.L. No: {store.drugLicenseNo}</span>}
              {store.fssaiNo && <span>FSSAI: {store.fssaiNo}</span>}
            </div>
          </div>
        </div>

        {/* Invoice Meta Grid */}
        <div className="grid grid-cols-2 gap-4 py-4 border-b border-ink-100 text-xs">
          <div>
            <div className="text-ink-500">Tax Invoice No:</div>
            <div className="font-bold text-ink-900 font-mono text-sm">{sale.invoiceNo}</div>
            <div className="text-ink-500 mt-2">Date & Time:</div>
            <div className="font-medium text-ink-800">{formattedDate}</div>
          </div>
          <div className="text-right">
            <div className="text-ink-500">Billed To:</div>
            <div className="font-bold text-ink-900">{sale.customerName}</div>
            {sale.maskedCustomerPhone && (
              <div className="text-ink-600 font-mono">{sale.maskedCustomerPhone}</div>
            )}
            {sale.doctorName && (
              <div className="mt-2 text-ink-600">
                <span className="text-ink-400">Dr: </span>
                <span className="font-medium">{sale.doctorName}</span>
                {sale.doctorRegNo && <span className="text-[10px]"> (Reg: {sale.doctorRegNo})</span>}
              </div>
            )}
          </div>
        </div>

        {/* Itemized Table */}
        <div className="py-4 overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-ink-200 text-ink-600 font-medium">
                <th className="py-2 pr-2">#</th>
                <th className="py-2 pr-2">Item Description</th>
                <th className="py-2 pr-2 text-center">Batch</th>
                <th className="py-2 pr-2 text-center">Exp</th>
                <th className="py-2 pr-2 text-center">Qty</th>
                <th className="py-2 pr-2 text-right">MRP</th>
                <th className="py-2 pr-2 text-right">Rate</th>
                <th className="py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 text-ink-900">
              {items.map((item, idx) => (
                <tr key={item.id} className="align-top">
                  <td className="py-2.5 pr-2 text-ink-400">{idx + 1}</td>
                  <td className="py-2.5 pr-2">
                    <div className="font-semibold text-ink-900">{item.medicineName}</div>
                    {item.hsn && <div className="text-[10px] text-ink-400 font-mono">HSN: {item.hsn}</div>}
                  </td>
                  <td className="py-2.5 pr-2 text-center font-mono text-[11px]">{item.batchNo}</td>
                  <td className="py-2.5 pr-2 text-center font-mono text-[11px]">{item.expiryDate}</td>
                  <td className="py-2.5 pr-2 text-center font-medium">
                    {item.qty} {item.packUnit}
                  </td>
                  <td className="py-2.5 pr-2 text-right text-ink-600">{formatINR(item.mrp)}</td>
                  <td className="py-2.5 pr-2 text-right font-medium">{formatINR(item.rate)}</td>
                  <td className="py-2.5 text-right font-semibold">{formatINR(item.totalAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals & Tax Summary */}
        <div className="border-t border-ink-200 pt-4 space-y-2 text-xs">
          <div className="flex justify-between text-ink-600">
            <span>Gross Amount</span>
            <span>{formatINR(sale.grossAmount)}</span>
          </div>
          {sale.discountAmount > 0 && (
            <div className="flex justify-between text-emerald-600">
              <span>Discount</span>
              <span>- {formatINR(sale.discountAmount)}</span>
            </div>
          )}
          <div className="flex justify-between text-ink-600">
            <span>Taxable Value</span>
            <span>{formatINR(sale.taxableAmount)}</span>
          </div>
          {(sale.cgst > 0 || sale.sgst > 0) && (
            <div className="flex justify-between text-ink-500 text-[11px]">
              <span>CGST + SGST</span>
              <span>{formatINR(sale.cgst + sale.sgst)}</span>
            </div>
          )}
          {sale.igst > 0 && (
            <div className="flex justify-between text-ink-500 text-[11px]">
              <span>IGST</span>
              <span>{formatINR(sale.igst)}</span>
            </div>
          )}
          {sale.roundOff !== 0 && (
            <div className="flex justify-between text-ink-500 text-[11px]">
              <span>Round Off</span>
              <span>{sale.roundOff > 0 ? `+${(sale.roundOff / 100).toFixed(2)}` : (sale.roundOff / 100).toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-bold text-ink-900 border-t border-ink-200 pt-2">
            <span>Grand Total</span>
            <span className="text-brand-700">{formatINR(sale.totalAmount)}</span>
          </div>
        </div>

        {/* Payment Summary */}
        <div className="mt-6 pt-4 border-t border-ink-100 flex flex-col sm:flex-row items-start sm:items-center justify-between text-xs text-ink-600 gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>
              Status:{" "}
              <strong className="text-ink-900 uppercase">
                {sale.isCancelled ? "CANCELLED" : "PAID"}
              </strong>
            </span>
          </div>
          {payments.length > 0 && (
            <div className="flex items-center gap-2">
              <span>Paid via:</span>
              {payments.map((p, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 rounded bg-ink-100 text-ink-800 font-semibold uppercase text-[10px]"
                >
                  {p.method}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Pharmacy Statutory Footer */}
        <div className="mt-8 pt-6 border-t border-ink-100 text-center text-[10px] text-ink-400 space-y-1">
          <p>Goods once sold cannot be returned without original cash memo / bill.</p>
          <p>Please consult your physician before taking any scheduled medications. Keep all medicines out of reach of children.</p>
          <p className="font-semibold text-ink-500">Thank you for choosing {store.name}!</p>
        </div>
      </div>
    </div>
  );
}
