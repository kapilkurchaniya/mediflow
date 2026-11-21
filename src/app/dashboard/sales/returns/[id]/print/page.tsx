import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft, Printer, Receipt, FileText } from "lucide-react";
import Link from "next/link";
import { requirePagePermission } from "@/server/rbac";
import { getSaleReturnById } from "@/app/actions/sales";
import { formatINR } from "@/lib/format";
import PrintButton from "@/app/dashboard/sales/[id]/print/PrintButton";
import { PrintWatermark } from "@/app/components/PrintWatermark";

export const metadata = { title: "Print Credit Note" };

export default async function PrintCreditNotePage({
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

  const data = await getSaleReturnById(resolvedParams.id);
  if (!data) return notFound();

  const { saleReturn, sale, user, items, customer, store, tenant } = data;

  const returnDate = saleReturn.createdAt ? new Date(saleReturn.createdAt) : new Date();
  const origSaleDate = sale.completedAt ? new Date(sale.completedAt) : new Date(sale.createdAt!);

  const totalQty = items.reduce((sum, item) => sum + item.returnItem.qty, 0);

  return (
    <div className="min-h-screen bg-ink-100 py-6 px-4 font-sans text-ink-900 print:bg-white print:p-0 print:m-0 print:min-h-0">
      {!isThermal && <PrintWatermark />}
      {/* Dynamic print page styling tailored for 80mm thermal roll vs A4 GST Credit Note */}
      <style
        dangerouslySetInnerHTML={{
          __html: isThermal
            ? `@media print {
                @page { size: 80mm auto; margin: 2mm 3mm; }
                body { margin: 0 !important; padding: 0 !important; }
                #cn-printable { width: 100% !important; max-width: 100% !important; margin: 0 !important; padding: 0 !important; }
              }`
            : `@media print {
                @page { size: A4 portrait; margin: 8mm; }
                body { margin: 0 !important; padding: 0 !important; }
                #cn-printable { width: 100% !important; max-width: 100% !important; margin: 0 !important; padding: 0 !important; }
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
            href={`/dashboard/sales/returns/${saleReturn.id}/print?format=thermal`}
            className={`px-3 py-1 text-xs font-semibold rounded transition-colors flex items-center gap-1.5 ${
              isThermal ? "bg-amber-600 text-white shadow-2xs" : "text-ink-600 hover:text-ink-900"
            }`}
          >
            <Printer className="w-3.5 h-3.5" /> 80mm Thermal Slip
          </Link>
          <Link
            href={`/dashboard/sales/returns/${saleReturn.id}/print?format=gst`}
            className={`px-3 py-1 text-xs font-semibold rounded transition-colors flex items-center gap-1.5 ${
              !isThermal ? "bg-amber-600 text-white shadow-2xs" : "text-ink-600 hover:text-ink-900"
            }`}
          >
            <Receipt className="w-3.5 h-3.5" /> Full A4 GST Credit Note
          </Link>
        </div>

        <PrintButton />
      </div>

      {isThermal ? (
        /* ──────────────── 80mm Thermal POS Credit Slip Format ──────────────── */
        <div
          id="cn-printable"
          className="max-w-[80mm] mx-auto bg-white p-4 shadow-xl border border-ink-200 print:shadow-none print:border-none print:p-0 print:m-0 font-mono text-[11px] leading-tight text-black"
        >
          {/* Pharmacy Header */}
          <div className="text-center pb-2 border-b border-dashed border-black">
            <h1 className="text-[14px] font-black uppercase tracking-tight">{tenant?.name}</h1>
            <p className="text-[11px] font-semibold">{store?.name}</p>
            <p className="text-[10px]">{store?.address || "Pharmacy Store"}</p>
            <p className="text-[10px]">GSTIN: {store?.gstin || "N/A"}</p>
            <p className="text-[10px]">DL: {store?.drugLicenseNo || "N/A"}</p>
            <div className="mt-1 font-bold text-[11px] uppercase tracking-wider border-t border-dotted border-black pt-1">
              ** SALE RETURN / CREDIT NOTE **
            </div>
          </div>

          {/* Credit Note Info */}
          <div className="py-2 border-b border-dashed border-black text-[10px] space-y-0.5">
            <div className="flex justify-between font-bold">
              <span>CN No: {saleReturn.returnNo}</span>
              <span>{format(returnDate, "dd/MM/yy HH:mm")}</span>
            </div>
            <div>Ref Inv: {sale.invoiceNo} ({format(origSaleDate, "dd/MM/yy")})</div>
            <div>Cust: {customer?.name || "Walk-in"}</div>
            {customer?.phone && <div>Phone: {customer.phone}</div>}
            <div>Refund Method: {saleReturn.refundMethod.toUpperCase()}</div>
            <div>Reason: {saleReturn.reason}</div>
          </div>

          {/* Items List */}
          <div className="py-2 border-b border-dashed border-black">
            <div className="flex justify-between font-bold pb-1 text-[10px] border-b border-dotted border-black">
              <span className="w-1/2">Item/Batch</span>
              <span className="w-1/6 text-center">Qty</span>
              <span className="w-1/6 text-right">Rate</span>
              <span className="w-1/6 text-right">Amt</span>
            </div>
            <div className="space-y-1.5 pt-1 text-[10px]">
              {items.map(({ returnItem, saleItem }) => (
                <div key={returnItem.id}>
                  <div className="font-bold truncate">{saleItem.medicineName}</div>
                  <div className="flex justify-between text-[9px] text-gray-700">
                    <span className="w-1/2">B:{saleItem.batchNo} E:{saleItem.expiryDate}</span>
                    <span className="w-1/6 text-center">{returnItem.qty}</span>
                    <span className="w-1/6 text-right">₹{((saleItem.rate ?? 0) / 100).toFixed(2)}</span>
                    <span className="w-1/6 text-right font-bold">₹{((returnItem.totalAmount ?? 0) / 100).toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Totals Breakdown */}
          <div className="py-2 space-y-1 text-[11px]">
            <div className="flex justify-between">
              <span>Total Units Returned:</span>
              <span className="num">{totalQty}</span>
            </div>
            <div className="flex justify-between">
              <span>Taxable Value:</span>
              <span className="num">₹{((saleReturn.taxableAmount ?? 0) / 100).toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Output GST Reversal:</span>
              <span className="num">₹{((saleReturn.taxAmount ?? 0) / 100).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-[13px] font-black border-t border-black pt-1 mt-1">
              <span>NET CREDIT AMOUNT:</span>
              <span className="num">₹{((saleReturn.totalAmount ?? 0) / 100).toFixed(2)}</span>
            </div>
          </div>

          {/* Thermal Footer */}
          <div className="text-center pt-3 mt-2 border-t border-dashed border-black text-[9px] space-y-1">
            <p>Customer Signature: __________________</p>
            <p className="font-sans text-[8px] text-gray-500">MediFlow Cloud POS · Credit Note</p>
          </div>
        </div>
      ) : (
        /* ──────────────── Full A4 GST Tax Credit Note Format ──────────────── */
        <div
          id="cn-printable"
          className="max-w-3xl mx-auto bg-white p-8 sm:p-12 shadow-xl rounded-xl border border-ink-200 print:shadow-none print:p-0 print:border-none print:rounded-none print:m-0"
        >
          {/* Header Section */}
          <div className="flex justify-between items-start border-b border-ink-200 pb-6 mb-6">
            <div>
              <h1 className="text-2xl font-black text-amber-800 tracking-tight mb-1">{tenant?.name}</h1>
              <p className="text-ink-700 font-semibold text-sm">{store?.name}</p>
              <p className="text-ink-500 text-xs mt-0.5">{store?.address || "Address not provided"}</p>
              <div className="flex gap-4 text-xs font-mono text-ink-600 mt-2">
                <span><strong>GSTIN:</strong> {store?.gstin || "Unregistered"}</span>
                <span><strong>DL No:</strong> {store?.drugLicenseNo || "N/A"}</span>
              </div>
            </div>
            <div className="text-right">
              <h2 className="text-xl font-bold text-amber-900 tracking-tight">TAX CREDIT NOTE</h2>
              <div className="text-[11px] text-ink-500 font-medium">(Under Section 34 of CGST Act / Rule 46)</div>
              <div className="mt-2 bg-amber-50/80 rounded-lg p-2.5 border border-amber-200 text-left text-xs font-mono inline-block">
                <div><span className="text-ink-500">Credit Note:</span> <strong>{saleReturn.returnNo}</strong></div>
                <div className="mt-0.5"><span className="text-ink-500">Date:</span> {format(returnDate, "dd MMM yyyy, hh:mm a")}</div>
                <div className="mt-0.5 border-t border-amber-200/80 pt-0.5 text-ink-600">
                  <span className="text-ink-500">Original Inv:</span> <strong>{sale.invoiceNo}</strong> ({format(origSaleDate, "dd/MM/yyyy")})
                </div>
              </div>
            </div>
          </div>

          {/* Customer & Party Details Grid */}
          <div className="grid grid-cols-2 gap-4 mb-6 bg-ink-50/70 p-4 rounded-lg border border-ink-150 text-xs">
            <div>
              <span className="font-bold text-ink-400 uppercase tracking-wider block mb-1">Recipient (Customer)</span>
              <p className="font-bold text-ink-900 text-sm">{customer?.name || "Walk-in Customer"}</p>
              {customer?.phone && <p className="text-ink-600 mt-0.5 font-mono">Mobile: +91 {customer.phone}</p>}
              {customer?.address && <p className="text-ink-600 mt-0.5">{customer.address}</p>}
              {customer?.gstin && <p className="text-ink-600 font-mono mt-0.5">GSTIN: {customer.gstin}</p>}
            </div>
            <div className="text-right space-y-1">
              <span className="font-bold text-ink-400 uppercase tracking-wider block mb-1">Return Settlement</span>
              <p className="text-ink-800">
                Refund Method: <strong className="uppercase">{saleReturn.refundMethod}</strong>
              </p>
              <p className="text-ink-700">
                Reason: <span className="font-medium italic">&ldquo;{saleReturn.reason}&rdquo;</span>
              </p>
              {user && (
                <p className="text-ink-500 text-[11px]">Issued by: {user.name}</p>
              )}
            </div>
          </div>

          {/* Line Items Table */}
          <div className="overflow-x-auto mb-6">
            <table className="w-full text-left text-xs border border-ink-200">
              <thead>
                <tr className="bg-ink-100 text-ink-700 border-b border-ink-200">
                  <th className="py-2 px-3">#</th>
                  <th className="py-2 px-3">Medicine Description</th>
                  <th className="py-2 px-3">HSN</th>
                  <th className="py-2 px-3">Batch / Expiry</th>
                  <th className="py-2 px-3 text-center">Ret. Qty</th>
                  <th className="py-2 px-3 text-right">Unit Rate</th>
                  <th className="py-2 px-3 text-right">Taxable</th>
                  <th className="py-2 px-3 text-center">GST %</th>
                  <th className="py-2 px-3 text-right">Total (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-150">
                {items.map(({ returnItem, saleItem }, index) => (
                  <tr key={returnItem.id}>
                    <td className="py-2 px-3 text-ink-400 font-mono">{index + 1}</td>
                    <td className="py-2 px-3 font-bold text-ink-900">{saleItem.medicineName}</td>
                    <td className="py-2 px-3 font-mono text-ink-600">{saleItem.hsn || "3004"}</td>
                    <td className="py-2 px-3 font-mono">
                      <div>{saleItem.batchNo}</div>
                      <div className="text-[10px] text-ink-500">Exp: {saleItem.expiryDate}</div>
                    </td>
                    <td className="py-2 px-3 text-center font-bold font-mono">{returnItem.qty}</td>
                    <td className="py-2 px-3 text-right num">{formatINR(saleItem.rate ?? 0)}</td>
                    <td className="py-2 px-3 text-right num">{formatINR(returnItem.taxableAmount ?? 0)}</td>
                    <td className="py-2 px-3 text-center num">{(saleItem.gstRateBp ?? 0) / 100}%</td>
                    <td className="py-2 px-3 text-right font-bold text-ink-900 num">
                      {formatINR(returnItem.totalAmount ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Financial Totals Breakdown */}
          <div className="flex justify-between items-start border-t border-ink-200 pt-4 mb-8">
            <div className="text-xs text-ink-600 space-y-1 max-w-sm">
              <p className="font-semibold text-ink-800">Statutory Notes:</p>
              <p>1. Stock credited back to inventory in accordance with Rule 46.</p>
              <p>2. Applicable GST tax liability is adjusted in GSTR-1 Table 9B.</p>
              <p>3. This credit note is valid for commercial settlement.</p>
            </div>

            <div className="w-72 space-y-1.5 text-xs">
              <div className="flex justify-between text-ink-600">
                <span>Total Taxable Value</span>
                <span className="font-mono">{formatINR(saleReturn.taxableAmount ?? 0)}</span>
              </div>
              <div className="flex justify-between text-ink-600">
                <span>Output GST Adjusted</span>
                <span className="font-mono">{formatINR(saleReturn.taxAmount ?? 0)}</span>
              </div>
              <div className="flex justify-between text-base font-black text-amber-800 border-t border-ink-200 pt-2 mt-2">
                <span>Net Credit Value:</span>
                <span>{formatINR(saleReturn.totalAmount ?? 0)}</span>
              </div>
            </div>
          </div>

          {/* Signature Block */}
          <div className="flex justify-between items-end pt-12 border-t border-ink-150 text-xs">
            <div className="text-center">
              <div className="w-48 border-b border-ink-300 mb-1"></div>
              <p className="text-ink-500">Customer Signature / Acknowledgement</p>
            </div>
            <div className="text-center">
              <div className="w-48 border-b border-ink-300 mb-1"></div>
              <p className="font-bold text-ink-800">For {tenant?.name}</p>
              <p className="text-ink-500">Registered Pharmacist / Authorised Signatory</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
