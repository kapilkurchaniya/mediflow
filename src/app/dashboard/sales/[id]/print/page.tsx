import { getSaleById } from "@/app/actions/sales";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { Printer, ArrowLeft } from "lucide-react";
import Link from "next/link";
import PrintButton from "./PrintButton";

export default async function PrintInvoicePage({ params }: { params: { id: string } }) {
  // Await the params object according to Next.js 15+ constraints if needed, but in 14 it's fine.
  const resolvedParams = await params;
  const data = await getSaleById(resolvedParams.id);

  if (!data) return notFound();

  const { sale, items, customer, store, tenant } = data;

  return (
    <div className="min-h-screen bg-slate-100 py-8 px-4 font-sans text-slate-800">
      <div className="max-w-3xl mx-auto mb-6 flex justify-between items-center print:hidden">
        <Link href="/dashboard/sales/pos" className="flex items-center text-slate-600 hover:text-brand-600 transition-colors font-medium">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to POS
        </Link>
        <PrintButton />
      </div>

      <div id="invoice-printable" className="max-w-3xl mx-auto bg-white p-8 sm:p-12 shadow-2xl rounded-2xl print:shadow-none print:p-0 print:rounded-none">
        
        {/* Header Section */}
        <div className="flex justify-between items-start border-b border-slate-200 pb-8 mb-8">
          <div>
            <h1 className="text-3xl font-extrabold text-brand-700 tracking-tight mb-2">{tenant?.name}</h1>
            <p className="text-slate-500 font-medium">{store?.name}</p>
            <p className="text-slate-500 text-sm mt-1">GSTIN: {store?.gstin || "N/A"} • DL: {store?.drugLicenseNo || "N/A"}</p>
            <p className="text-slate-500 text-sm">{store?.address || "Store Address Not Provided"}</p>
          </div>
          <div className="text-right">
            <h2 className="text-2xl font-bold text-slate-800 mb-2">TAX INVOICE</h2>
            <div className="inline-block bg-slate-50 rounded-lg px-4 py-2 border border-slate-100 text-left">
              <p className="text-sm font-semibold text-slate-700">Inv No: <span className="font-bold text-slate-900">{sale.invoiceNo}</span></p>
              <p className="text-sm font-semibold text-slate-700 mt-1">Date: <span className="text-slate-900">{format(new Date(sale.createdAt!), "dd MMM yyyy, hh:mm a")}</span></p>
            </div>
          </div>
        </div>

        {/* Customer & Doctor Info */}
        <div className="flex justify-between mb-8 bg-slate-50 p-6 rounded-xl border border-slate-100">
          <div>
            <h3 className="text-xs uppercase tracking-wider font-bold text-slate-400 mb-2">Billed To</h3>
            <p className="font-bold text-slate-800 text-lg">{customer?.name || "Walk-in Customer"}</p>
            {customer?.phone && <p className="text-slate-600 text-sm mt-1">Phone: +91 {customer.phone}</p>}
          </div>
          <div className="text-right">
            <h3 className="text-xs uppercase tracking-wider font-bold text-slate-400 mb-2">Prescription</h3>
            <p className="font-semibold text-slate-800">{sale.doctorName || "Self-Prescribed"}</p>
          </div>
        </div>

        {/* Items Table */}
        <div className="mb-8 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-brand-50 border-y border-brand-100">
                <th className="py-3 px-4 font-bold text-brand-900 text-sm rounded-l-lg">Item / Batch</th>
                <th className="py-3 px-4 font-bold text-brand-900 text-sm text-center">Exp</th>
                <th className="py-3 px-4 font-bold text-brand-900 text-sm text-center">Qty</th>
                <th className="py-3 px-4 font-bold text-brand-900 text-sm text-right">MRP</th>
                <th className="py-3 px-4 font-bold text-brand-900 text-sm text-right">Rate</th>
                <th className="py-3 px-4 font-bold text-brand-900 text-sm text-right rounded-r-lg">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item, idx) => (
                <tr key={idx} className="group hover:bg-slate-50 transition-colors">
                  <td className="py-4 px-4">
                    <p className="font-bold text-slate-900">{item.medicineName}</p>
                    <p className="text-xs text-slate-500 mt-1 font-mono">{item.batchNo}</p>
                  </td>
                  <td className="py-4 px-4 text-sm text-slate-600 text-center">
                    {format(new Date(item.expiryDate), "MM/yy")}
                  </td>
                  <td className="py-4 px-4 text-center">
                    <span className="bg-slate-100 text-slate-800 font-bold px-2.5 py-1 rounded-md">{item.qty}</span>
                  </td>
                  <td className="py-4 px-4 text-sm text-slate-600 text-right">₹{(item.mrp / 100).toFixed(2)}</td>
                  <td className="py-4 px-4 text-sm text-slate-600 text-right">₹{(item.rate / 100).toFixed(2)}</td>
                  <td className="py-4 px-4 text-sm font-bold text-slate-900 text-right">
                    ₹{(item.totalAmount / 100).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals Section */}
        <div className="flex flex-col md:flex-row justify-between items-end border-t border-slate-200 pt-6">
          
          <div className="w-full md:w-1/2 mb-6 md:mb-0">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Terms & Conditions</h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              1. Goods once sold will not be taken back.<br/>
              2. Medicine without batch no & expiry date will not be accepted.<br/>
              3. Keep medicines in a cool, dry place.
            </p>
          </div>

          <div className="w-full md:w-1/3 bg-slate-50 p-5 rounded-xl border border-slate-100">
            <div className="flex justify-between items-center mb-2">
              <span className="text-slate-600 font-medium">Subtotal</span>
              <span className="text-slate-800 font-semibold">₹{(sale.grossAmount / 100).toFixed(2)}</span>
            </div>
            {sale.discountAmount > 0 && (
              <div className="flex justify-between items-center mb-2 text-emerald-600">
                <span className="font-medium">Total Savings</span>
                <span className="font-semibold">- ₹{(sale.discountAmount / 100).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between items-center mb-4 text-slate-500 text-sm border-b border-slate-200 pb-4">
              <span>Included Tax (GST)</span>
              <span>₹{((sale.cgst + sale.sgst + sale.igst) / 100).toFixed(2)}</span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-lg font-bold text-slate-900">Net Payable</span>
              <span className="text-3xl font-extrabold text-brand-600 tracking-tight">₹{(sale.totalAmount / 100).toFixed(2)}</span>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="mt-12 pt-8 border-t border-slate-200 text-center pb-4">
          <p className="text-brand-600 font-bold text-lg mb-1">Thank you for your visit! Wishing you good health.</p>
          <p className="text-slate-400 text-xs font-medium">Powered by MediFlow AI Point of Sale</p>
        </div>
      </div>
    </div>
  );
}
