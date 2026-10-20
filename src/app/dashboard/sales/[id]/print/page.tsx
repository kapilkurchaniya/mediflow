import { getSaleById } from "@/app/actions/sales";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft, Printer, Receipt } from "lucide-react";
import Link from "next/link";
import PrintButton from "./PrintButton";
import { formatINR } from "@/lib/format";
import { requirePagePermission } from "@/server/rbac";

export default async function PrintInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ format?: string }>;
}) {
  await requirePagePermission("sale.view");
  const resolvedParams = await params;
  const { format: printFormat } = await searchParams;
  const isThermal = printFormat === "thermal";

  const data = await getSaleById(resolvedParams.id);
  if (!data) return notFound();

  const { sale, items, customer, store, tenant } = data;

  return (
    <div className="min-h-screen bg-ink-100 py-6 px-4 font-sans text-ink-900 print:bg-white print:p-0 print:m-0 print:min-h-0">
      {/* Dynamic print page styling tailored for 80mm thermal roll vs A4 GST Tax invoice */}
      <style
        dangerouslySetInnerHTML={{
          __html: isThermal
            ? `@media print {
                @page { size: 80mm auto; margin: 2mm 3mm; }
                body { margin: 0 !important; padding: 0 !important; }
                #invoice-printable { width: 100% !important; max-width: 100% !important; margin: 0 !important; padding: 0 !important; }
              }`
            : `@media print {
                @page { size: A4 portrait; margin: 8mm; }
                body { margin: 0 !important; padding: 0 !important; }
                #invoice-printable { width: 100% !important; max-width: 100% !important; margin: 0 !important; padding: 0 !important; }
              }`,
        }}
      />

      {/* Top action bar (hidden during print) */}
      <div className="max-w-3xl mx-auto mb-6 flex flex-wrap gap-3 justify-between items-center print:hidden">
        <Link
          href={`/dashboard/sales/${sale.id}`}
          className="flex items-center text-ink-600 hover:text-brand-700 transition-colors font-medium text-sm"
        >
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Invoice
        </Link>

        {/* Format Selector */}
        <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-ink-200 shadow-xs">
          <Link
            href={`/dashboard/sales/${sale.id}/print?format=thermal`}
            className={`px-3 py-1 text-xs font-semibold rounded transition-colors flex items-center gap-1.5 ${
              isThermal ? "bg-brand-600 text-white shadow-2xs" : "text-ink-600 hover:text-ink-900"
            }`}
          >
            <Printer className="w-3.5 h-3.5" /> 80mm Thermal Slip
          </Link>
          <Link
            href={`/dashboard/sales/${sale.id}/print?format=gst`}
            className={`px-3 py-1 text-xs font-semibold rounded transition-colors flex items-center gap-1.5 ${
              !isThermal ? "bg-brand-600 text-white shadow-2xs" : "text-ink-600 hover:text-ink-900"
            }`}
          >
            <Receipt className="w-3.5 h-3.5" /> Full A4 GST Invoice
          </Link>
        </div>

        <PrintButton />
      </div>

      {isThermal ? (
        /* ──────────────── 80mm Thermal POS Slip Format ──────────────── */
        <div
          id="invoice-printable"
          className="max-w-[80mm] mx-auto bg-white p-4 shadow-xl border border-ink-200 print:shadow-none print:border-none print:p-0 print:m-0 font-mono text-[11px] leading-tight text-black"
        >
          {/* Pharmacy Header */}
          <div className="text-center pb-2 border-b border-dashed border-black">
            <h1 className="text-[14px] font-black uppercase tracking-tight">{tenant?.name}</h1>
            <p className="text-[11px] font-semibold">{store?.name}</p>
            <p className="text-[10px]">{store?.address || "Pharmacy Store"}</p>
            <p className="text-[10px]">GSTIN: {store?.gstin || "N/A"}</p>
            <p className="text-[10px]">DL: {store?.drugLicenseNo || "N/A"}</p>
          </div>

          {/* Bill Info */}
          <div className="py-2 border-b border-dashed border-black text-[10px] space-y-0.5">
            <div className="flex justify-between">
              <span>Inv: {sale.invoiceNo}</span>
              <span>{format(new Date(sale.completedAt ?? sale.createdAt!), "dd/MM/yy HH:mm")}</span>
            </div>
            <div>Cust: {customer?.name || "Walk-in"}</div>
            {customer?.phone && <div>Phone: {customer.phone}</div>}
            {sale.doctorName && <div>Doctor: {sale.doctorName}</div>}
          </div>

          {/* Items Header */}
          <table className="w-full my-2 text-[10px] text-left border-collapse">
            <thead>
              <tr className="border-b border-black">
                <th className="py-1">Item/Batch</th>
                <th className="py-1 text-center">Qty</th>
                <th className="py-1 text-right">Rate</th>
                <th className="py-1 text-right">Amt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dotted divide-gray-400">
              {items.map((item, idx) => (
                <tr key={idx}>
                  <td className="py-1">
                    <div className="font-bold truncate max-w-[120px]">{item.medicineName}</div>
                    <div className="text-[9px] text-gray-700">
                      B:{item.batchNo} E:{item.expiryDate?.slice(0, 7)}
                    </div>
                  </td>
                  <td className="py-1 text-center font-bold">{item.qty}</td>
                  <td className="py-1 text-right num">₹{(item.rate / 100).toFixed(2)}</td>
                  <td className="py-1 text-right font-bold num">₹{(item.totalAmount / 100).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="pt-2 border-t border-dashed border-black text-[10px] space-y-1">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span className="num">₹{(sale.grossAmount / 100).toFixed(2)}</span>
            </div>
            {sale.discountAmount && sale.discountAmount > 0 ? (
              <div className="flex justify-between">
                <span>Discount:</span>
                <span className="num">-₹{(sale.discountAmount / 100).toFixed(2)}</span>
              </div>
            ) : null}
            <div className="flex justify-between">
              <span>GST Included:</span>
              <span className="num">₹{(((sale.cgst ?? 0) + (sale.sgst ?? 0) + (sale.igst ?? 0)) / 100).toFixed(2)}</span>
            </div>
            {sale.roundOff && sale.roundOff !== 0 ? (
              <div className="flex justify-between">
                <span>Round Off:</span>
                <span className="num">{sale.roundOff > 0 ? "+" : ""}₹{(sale.roundOff / 100).toFixed(2)}</span>
              </div>
            ) : null}
            <div className="flex justify-between text-[13px] font-black border-t border-black pt-1 mt-1">
              <span>NET PAYABLE:</span>
              <span className="num">₹{(sale.totalAmount / 100).toFixed(2)}</span>
            </div>
          </div>

          {/* Thermal Footer */}
          <div className="text-center pt-3 mt-2 border-t border-dashed border-black text-[9px] space-y-1">
            <p>Thank you! Get well soon.</p>
            <p className="font-sans text-[8px] text-gray-500">MediFlow Cloud POS</p>
          </div>
        </div>
      ) : (
        /* ──────────────── Full A4 GST Tax Invoice Format ──────────────── */
        <div
          id="invoice-printable"
          className="max-w-3xl mx-auto bg-white p-8 sm:p-12 shadow-xl rounded-xl border border-ink-200 print:shadow-none print:p-0 print:border-none print:rounded-none print:m-0"
        >
          {/* Header Section */}
          <div className="flex justify-between items-start border-b border-ink-200 pb-6 mb-6">
            <div>
              <h1 className="text-2xl font-black text-brand-800 tracking-tight mb-1">{tenant?.name}</h1>
              <p className="text-ink-700 font-semibold text-sm">{store?.name}</p>
              <p className="text-ink-500 text-xs mt-0.5">{store?.address || "Address not provided"}</p>
              <div className="flex gap-4 text-xs font-mono text-ink-600 mt-2">
                <span><strong>GSTIN:</strong> {store?.gstin || "Unregistered"}</span>
                <span><strong>DL No:</strong> {store?.drugLicenseNo || "N/A"}</span>
              </div>
            </div>
            <div className="text-right">
              <h2 className="text-xl font-bold text-ink-900 tracking-tight">TAX INVOICE</h2>
              <div className="mt-2 bg-ink-50 rounded-lg p-2.5 border border-ink-150 text-left text-xs font-mono inline-block">
                <div><span className="text-ink-500">Invoice:</span> <strong>{sale.invoiceNo}</strong></div>
                <div className="mt-0.5"><span className="text-ink-500">Date:</span> {format(new Date(sale.completedAt ?? sale.createdAt!), "dd MMM yyyy, hh:mm a")}</div>
              </div>
            </div>
          </div>

          {/* Customer & Doctor Grid */}
          <div className="grid grid-cols-2 gap-4 mb-6 bg-ink-50/70 p-4 rounded-lg border border-ink-150 text-xs">
            <div>
              <span className="font-bold text-ink-400 uppercase tracking-wider block mb-1">Billed To (Customer)</span>
              <p className="font-bold text-ink-900 text-sm">{customer?.name || "Walk-in Customer"}</p>
              {customer?.phone && <p className="text-ink-600 mt-0.5 font-mono">Mobile: +91 {customer.phone}</p>}
              {customer?.gstin && <p className="text-ink-600 font-mono">GSTIN: {customer.gstin}</p>}
            </div>
            <div className="text-right">
              <span className="font-bold text-ink-400 uppercase tracking-wider block mb-1">Prescription & Mode</span>
              <p className="font-bold text-ink-900 text-sm">{sale.doctorName || "Self-Prescribed / OTC"}</p>
              <p className="text-ink-600 capitalize mt-0.5">Payment: {sale.status === "completed" ? "Paid (Retail POS)" : sale.status}</p>
            </div>
          </div>

          {/* Items Table */}
          <div className="mb-6 overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-brand-50 border-y border-brand-100 text-brand-900 font-bold">
                  <th className="py-2.5 px-3">#</th>
                  <th className="py-2.5 px-3">Item Name</th>
                  <th className="py-2.5 px-3">Batch</th>
                  <th className="py-2.5 px-3 text-center">Exp</th>
                  <th className="py-2.5 px-3 text-center">Qty</th>
                  <th className="py-2.5 px-3 text-right">MRP</th>
                  <th className="py-2.5 px-3 text-right">Rate</th>
                  <th className="py-2.5 px-3 text-center">GST</th>
                  <th className="py-2.5 px-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-150">
                {items.map((item, idx) => (
                  <tr key={idx} className="hover:bg-ink-50">
                    <td className="py-2.5 px-3 text-ink-400">{idx + 1}</td>
                    <td className="py-2.5 px-3 font-semibold text-ink-900">{item.medicineName}</td>
                    <td className="py-2.5 px-3 font-mono text-ink-700">{item.batchNo}</td>
                    <td className="py-2.5 px-3 text-center num text-ink-600">{item.expiryDate}</td>
                    <td className="py-2.5 px-3 text-center font-bold num">{item.qty}</td>
                    <td className="py-2.5 px-3 text-right num text-ink-600">{formatINR(item.mrp)}</td>
                    <td className="py-2.5 px-3 text-right num text-ink-700">{formatINR(item.rate)}</td>
                    <td className="py-2.5 px-3 text-center num text-ink-600">{(item.gstRateBp ?? 0) / 100}%</td>
                    <td className="py-2.5 px-3 text-right font-bold text-ink-900 num">{formatINR(item.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals & Signature Section */}
          <div className="flex flex-col md:flex-row justify-between items-start border-t border-ink-200 pt-6 gap-6 text-xs">
            <div className="w-full md:w-1/2 space-y-3">
              <div>
                <h4 className="font-bold text-ink-400 uppercase tracking-wider mb-1">Terms & Conditions</h4>
                <p className="text-ink-500 leading-relaxed text-[11px]">
                  1. Goods once sold will not be accepted without valid batch and expiry verification.<br />
                  2. Keep scheduled drugs and thermolabile medicines in refrigeration as directed.<br />
                  3. This is a computer generated GST tax invoice.
                </p>
              </div>
              <div className="pt-8">
                <div className="w-48 border-t border-ink-400 text-center pt-1 text-[11px] text-ink-600">
                  Authorised Signatory / Pharmacist
                </div>
              </div>
            </div>

            <div className="w-full md:w-1/3 bg-ink-50 p-4 rounded-xl border border-ink-150 space-y-1.5">
              <div className="flex justify-between text-ink-600">
                <span>Taxable Amount</span>
                <span className="font-medium num text-ink-900">{formatINR(sale.taxableAmount)}</span>
              </div>
              {sale.discountAmount && sale.discountAmount > 0 ? (
                <div className="flex justify-between text-brand-700">
                  <span>Discount</span>
                  <span className="font-medium num">- {formatINR(sale.discountAmount)}</span>
                </div>
              ) : null}
              <div className="flex justify-between text-ink-600">
                <span>CGST</span>
                <span className="font-medium num text-ink-900">{formatINR(sale.cgst)}</span>
              </div>
              <div className="flex justify-between text-ink-600">
                <span>SGST</span>
                <span className="font-medium num text-ink-900">{formatINR(sale.sgst)}</span>
              </div>
              {sale.igst && sale.igst > 0 ? (
                <div className="flex justify-between text-ink-600">
                  <span>IGST</span>
                  <span className="font-medium num text-ink-900">{formatINR(sale.igst)}</span>
                </div>
              ) : null}
              {sale.roundOff && sale.roundOff !== 0 ? (
                <div className="flex justify-between text-ink-600">
                  <span>Round Off</span>
                  <span className="font-medium num">
                    {sale.roundOff > 0 ? "+" : ""}{formatINR(sale.roundOff)}
                  </span>
                </div>
              ) : null}

              <div className="pt-2 border-t border-ink-200 flex justify-between items-baseline">
                <span className="text-sm font-bold text-ink-900">Total Invoice Value</span>
                <span className="text-xl font-black text-brand-700 num">{formatINR(sale.totalAmount)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
