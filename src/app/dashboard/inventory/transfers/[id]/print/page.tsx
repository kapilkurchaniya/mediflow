import { notFound } from "next/navigation";
import { format } from "date-fns";
import { requirePermission } from "@/server/rbac";
import { getTransferById } from "@/server/domain/inventory/transfers";
import { formatINR } from "@/lib/format";
import { PrintButton } from "./PrintButton";
import { PrintWatermark } from "@/app/components/PrintWatermark";

interface PrintPageProps {
  params: Promise<{ id: string }>;
}

export default async function PrintTransferPage({ params }: PrintPageProps) {
  const { id } = await params;
  const ctx = await requirePermission("inventory.view");

  let transfer: Awaited<ReturnType<typeof getTransferById>>;
  try {
    transfer = await getTransferById(ctx.tenantId, id);
  } catch {
    notFound();
  }

  const isInvoice = transfer.docKind === "tax_invoice";
  const docTitle = isInvoice
    ? "TAX INVOICE (Rule 46 of CGST Rules - Section 31)"
    : "DELIVERY CHALLAN (Rule 55 of CGST Rules - Not a Sale)";

  return (
    <div className="min-h-screen bg-ink-50/50 p-6 print:p-0 print:bg-white text-ink-900 font-sans">
      <PrintWatermark />
      <div className="max-w-4xl mx-auto bg-white border border-ink-200 print:border-0 rounded-xl p-8 shadow-xs print:shadow-none space-y-6">
        {/* Print Action Header (Hidden in Print) */}
        <div className="flex items-center justify-between pb-4 border-b border-ink-200 print:hidden">
          <div>
            <h1 className="text-lg font-bold text-ink-900">Print Statutory Transfer Document</h1>
            <p className="text-xs text-ink-500">Official GST-compliant delivery challan / tax invoice</p>
          </div>
          <PrintButton />
        </div>

        {/* Header Block */}
        <div className="text-center border-b pb-4 border-ink-300">
          <h2 className="text-xl font-bold uppercase tracking-wider">{transfer.fromStore?.name}</h2>
          <p className="text-xs text-ink-600 mt-0.5">{transfer.fromStore?.address || "Registered Pharmacy Premise"}</p>
          <div className="flex justify-center gap-4 text-xs font-medium text-ink-700 mt-1">
            <span>GSTIN: <span className="font-mono">{transfer.fromStore?.gstin || "Unregistered"}</span></span>
            <span>State Code: {transfer.fromStore?.stateCode}</span>
          </div>
          <div className="mt-3 inline-block border-2 border-ink-900 px-4 py-1 text-sm font-bold tracking-widest uppercase">
            {docTitle}
          </div>
        </div>

        {/* Document & Transport Meta */}
        <div className="grid grid-cols-2 gap-4 text-xs border border-ink-300 p-3 rounded">
          <div className="space-y-1">
            <p><span className="font-semibold text-ink-600">Document No:</span> <span className="font-mono font-bold">{transfer.documentNo || transfer.transferNo}</span></p>
            <p><span className="font-semibold text-ink-600">Document Date:</span> {transfer.documentDate ? format(new Date(transfer.documentDate), "dd/MM/yyyy") : format(new Date(transfer.createdAt), "dd/MM/yyyy")}</p>
            <p><span className="font-semibold text-ink-600">Transfer Ref:</span> {transfer.transferNo}</p>
          </div>
          <div className="space-y-1">
            <p><span className="font-semibold text-ink-600">Mode of Transport:</span> <span className="capitalize">{transfer.transportMode || "Road"}</span></p>
            <p><span className="font-semibold text-ink-600">Vehicle No:</span> <span className="font-mono uppercase font-bold">{transfer.vehicleNo || "N/A"}</span></p>
            <p><span className="font-semibold text-ink-600">E-Way Bill No:</span> <span className="font-mono">{transfer.eWayBillNo || "N/A"}</span></p>
          </div>
        </div>

        {/* Consignor & Consignee */}
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div className="border border-ink-300 p-3 rounded space-y-1">
            <p className="font-bold uppercase tracking-wider text-ink-600 border-b pb-1 mb-1">Consignor (Dispatch From)</p>
            <p className="font-bold text-sm">{transfer.fromStore?.name}</p>
            <p className="text-ink-600">{transfer.fromStore?.address || "Registered Location"}</p>
            <p><span className="font-semibold">GSTIN:</span> {transfer.fromStore?.gstin || "Unregistered"}</p>
            <p><span className="font-semibold">State:</span> {transfer.fromStore?.stateCode}</p>
          </div>

          <div className="border border-ink-300 p-3 rounded space-y-1">
            <p className="font-bold uppercase tracking-wider text-ink-600 border-b pb-1 mb-1">Consignee (Ship To)</p>
            <p className="font-bold text-sm">{transfer.toStore?.name}</p>
            <p className="text-ink-600">{transfer.toStore?.address || "Destination Location"}</p>
            <p><span className="font-semibold">GSTIN:</span> {transfer.toStore?.gstin || "Unregistered"}</p>
            <p><span className="font-semibold">State:</span> {transfer.toStore?.stateCode}</p>
          </div>
        </div>

        {/* Items Table */}
        <table className="w-full text-left text-xs border border-ink-300 divide-y divide-ink-300">
          <thead className="bg-ink-100/60 font-semibold text-ink-800">
            <tr>
              <th className="p-2 border-r border-ink-300 w-8 text-center">#</th>
              <th className="p-2 border-r border-ink-300">Description of Goods</th>
              <th className="p-2 border-r border-ink-300 text-center">HSN</th>
              <th className="p-2 border-r border-ink-300 text-center">Batch No</th>
              <th className="p-2 border-r border-ink-300 text-center">Exp Date</th>
              <th className="p-2 border-r border-ink-300 text-right">Qty</th>
              <th className="p-2 border-r border-ink-300 text-right">Rate</th>
              <th className="p-2 text-right">Taxable Amt</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-200">
            {transfer.items?.map((item, idx: number) => {
              const qty = item.qtyDispatched || item.qty;
              const lineVal = qty * (item.unitCost ?? 0);
              return (
                <tr key={item.id}>
                  <td className="p-2 border-r border-ink-300 text-center">{idx + 1}</td>
                  <td className="p-2 border-r border-ink-300 font-medium">{item.medicineName}</td>
                  <td className="p-2 border-r border-ink-300 text-center font-mono">{item.hsn || "3004"}</td>
                  <td className="p-2 border-r border-ink-300 text-center font-mono">{item.batchNo}</td>
                  <td className="p-2 border-r border-ink-300 text-center">{item.expiryDate}</td>
                  <td className="p-2 border-r border-ink-300 text-right font-bold">{qty}</td>
                  <td className="p-2 border-r border-ink-300 text-right">{formatINR(item.unitCost ?? 0)}</td>
                  <td className="p-2 text-right font-medium">{formatINR(lineVal)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="font-bold border-t-2 border-ink-400 bg-ink-50">
            <tr>
              <td colSpan={7} className="p-2 text-right border-r border-ink-300">Total Taxable Value:</td>
              <td className="p-2 text-right">{formatINR(transfer.taxableValuePaise || transfer.totalValuePaise)}</td>
            </tr>
            {isInvoice && (
              <>
                <tr>
                  <td colSpan={7} className="p-2 text-right border-r border-ink-300">CGST:</td>
                  <td className="p-2 text-right">{formatINR(transfer.cgstPaise || 0)}</td>
                </tr>
                <tr>
                  <td colSpan={7} className="p-2 text-right border-r border-ink-300">SGST:</td>
                  <td className="p-2 text-right">{formatINR(transfer.sgstPaise || 0)}</td>
                </tr>
                {transfer.igstPaise > 0 && (
                  <tr>
                    <td colSpan={7} className="p-2 text-right border-r border-ink-300">IGST:</td>
                    <td className="p-2 text-right">{formatINR(transfer.igstPaise)}</td>
                  </tr>
                )}
              </>
            )}
            <tr className="text-sm bg-ink-100">
              <td colSpan={7} className="p-2.5 text-right border-r border-ink-300">Grand Total:</td>
              <td className="p-2.5 text-right font-bold">{formatINR(transfer.totalValuePaise)}</td>
            </tr>
          </tfoot>
        </table>

        {/* Declaration & Signatures */}
        <div className="pt-8 border-t border-ink-300 grid grid-cols-2 gap-8 text-xs">
          <div className="space-y-4">
            <p className="font-semibold text-ink-700">Statutory Declaration:</p>
            <p className="text-[11px] text-ink-500 leading-relaxed">
              We declare that this document shows the actual price of the goods described and that all particulars are true and correct.
              {isInvoice
                ? " Supply of goods to distinct person under Section 25(4) of the CGST Act, 2017."
                : " Goods sent on transfer basis without sale under Rule 55 of CGST Rules, 2017."}
            </p>
          </div>

          <div className="flex flex-col justify-between items-end space-y-12">
            <p className="font-semibold">For {transfer.fromStore?.name}</p>
            <p className="border-t border-ink-400 pt-1 text-center w-48 font-medium">Authorized Signatory</p>
          </div>
        </div>
      </div>
    </div>
  );
}
