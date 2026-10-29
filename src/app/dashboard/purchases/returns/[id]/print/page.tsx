import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { requirePagePermission, getAuthCtx } from "@/server/rbac";
import { db, schema } from "@/server/db";
import { eq } from "drizzle-orm";
import { getPurchaseReturn } from "@/app/actions/purchase-returns";
import { formatINR } from "@/lib/format";
import PrintButton from "@/app/dashboard/sales/[id]/print/PrintButton";

export const metadata = { title: "Print GST Debit Note" };

export default async function PrintPurchaseReturnPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePagePermission("purchase.view");
  const resolved = await params;
  const ctx = await getAuthCtx();

  const [returnRec, [store], [tenant]] = await Promise.all([
    getPurchaseReturn(resolved.id),
    db.select().from(schema.stores).where(eq(schema.stores.id, ctx.storeId)),
    db.select().from(schema.tenants).where(eq(schema.tenants.id, ctx.tenantId)),
  ]);

  if (!returnRec) return notFound();

  const totalUnits = returnRec.items.reduce((sum, item) => sum + item.qty, 0);

  return (
    <div className="min-h-screen bg-neutral-100 py-6 px-4 font-sans text-neutral-900 print:bg-white print:p-0 print:m-0 print:min-h-0">
      {/* Print styles for A4 document */}
      <style
        dangerouslySetInnerHTML={{
          __html: `@media print {
            @page { size: A4 portrait; margin: 10mm; }
            body { margin: 0 !important; padding: 0 !important; }
            #dn-printable { width: 100% !important; max-width: 100% !important; margin: 0 !important; padding: 0 !important; box-shadow: none !important; border: none !important; }
          }`,
        }}
      />

      {/* Action Bar (hidden when printing) */}
      <div className="max-w-3xl mx-auto mb-6 flex justify-between items-center print:hidden">
        <Link
          href={`/dashboard/purchases/returns/${returnRec.id}`}
          className="flex items-center text-neutral-600 hover:text-neutral-900 transition-colors font-medium text-sm"
        >
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Return
        </Link>
        <PrintButton />
      </div>

      {/* Printable Sheet */}
      <div
        id="dn-printable"
        className="max-w-3xl mx-auto bg-white p-8 shadow-xl border border-neutral-200 rounded-lg text-neutral-900 font-sans"
      >
        {/* Header */}
        <div className="border-b-2 border-neutral-900 pb-4 mb-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-neutral-900 uppercase">
                {store?.name || tenant?.name || "MediFlow Pharmacy"}
              </h1>
              <p className="text-xs text-neutral-600 mt-1 max-w-sm">
                {store?.address || "Pharmacy Store Address"}
              </p>
              <div className="mt-2 text-xs space-y-0.5 text-neutral-700">
                {store?.gstin && (
                  <p>
                    <span className="font-semibold">GSTIN:</span> {store.gstin}
                  </p>
                )}
                {store?.drugLicenseNo && (
                  <p>
                    <span className="font-semibold">D.L. No.:</span> {store.drugLicenseNo}
                  </p>
                )}
                {store?.phone && (
                  <p>
                    <span className="font-semibold">Phone:</span> {store.phone}
                  </p>
                )}
              </div>
            </div>

            <div className="text-right">
              <span className="inline-block bg-neutral-900 text-white font-bold text-xs uppercase px-3 py-1 tracking-wider rounded">
                GST DEBIT NOTE
              </span>
              <p className="mt-3 text-lg font-bold font-mono tracking-tight text-neutral-900">
                {returnRec.returnNo}
              </p>
              <p className="text-xs text-neutral-600 mt-1">
                <span className="font-medium">Date:</span>{" "}
                {format(new Date(returnRec.createdAt), "dd MMM yyyy")}
              </p>
            </div>
          </div>
        </div>

        {/* References Bar */}
        <div className="grid grid-cols-2 gap-6 bg-neutral-50 p-4 rounded-md border border-neutral-200 mb-6 text-xs">
          <div>
            <h3 className="font-bold text-neutral-500 uppercase tracking-wider mb-1.5">
              Debit Issued To (Vendor):
            </h3>
            <p className="text-sm font-bold text-neutral-900">{returnRec.supplierName}</p>
            {returnRec.supplierAddress && (
              <p className="text-neutral-600 mt-0.5 whitespace-pre-line">
                {returnRec.supplierAddress}
              </p>
            )}
            {returnRec.supplierGstin && (
              <p className="mt-1 font-mono text-neutral-800">
                <span className="font-semibold">GSTIN:</span> {returnRec.supplierGstin}
              </p>
            )}
            {returnRec.supplierPhone && (
              <p className="text-neutral-600">
                <span className="font-semibold">Phone:</span> {returnRec.supplierPhone}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <h3 className="font-bold text-neutral-500 uppercase tracking-wider mb-1.5">
              Original Inward Document Reference:
            </h3>
            <p>
              <span className="font-semibold text-neutral-700">Internal GRN #:</span>{" "}
              <span className="font-mono">{returnRec.purchaseNo}</span>
            </p>
            <p>
              <span className="font-semibold text-neutral-700">Supplier Invoice #:</span>{" "}
              <span className="font-mono">{returnRec.supplierInvoiceNo || "N/A"}</span>
            </p>
            <p>
              <span className="font-semibold text-neutral-700">Return Reason:</span>{" "}
              <span className="font-medium text-neutral-900">{returnRec.reason}</span>
            </p>
          </div>
        </div>

        {/* Items Table */}
        <table className="w-full text-left text-xs mb-6 border-collapse">
          <thead>
            <tr className="border-b-2 border-neutral-800 bg-neutral-100 text-neutral-700 font-bold uppercase tracking-wider">
              <th className="py-2.5 px-3">#</th>
              <th className="py-2.5 px-3">Medicine Description</th>
              <th className="py-2.5 px-3">Batch No</th>
              <th className="py-2.5 px-3">Expiry</th>
              <th className="py-2.5 px-3 text-right">Return Qty</th>
              <th className="py-2.5 px-3 text-right">Unit Rate</th>
              <th className="py-2.5 px-3 text-right">Taxable</th>
              <th className="py-2.5 px-3 text-right">Tax Amount</th>
              <th className="py-2.5 px-3 text-right">Debit Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {returnRec.items.map((item, idx) => (
              <tr key={item.id} className="text-neutral-800">
                <td className="py-2 px-3 text-neutral-500">{idx + 1}</td>
                <td className="py-2 px-3 font-semibold">{item.medicineName}</td>
                <td className="py-2 px-3 font-mono">{item.batchNo}</td>
                <td className="py-2 px-3">{item.expiryDate}</td>
                <td className="py-2 px-3 text-right font-bold">{item.qty}</td>
                <td className="py-2 px-3 text-right">{formatINR(item.rate)}</td>
                <td className="py-2 px-3 text-right">{formatINR(item.taxableAmount)}</td>
                <td className="py-2 px-3 text-right">{formatINR(item.taxAmount)}</td>
                <td className="py-2 px-3 text-right font-bold">{formatINR(item.totalAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Summary Footer */}
        <div className="flex justify-between items-start border-t-2 border-neutral-800 pt-4 mb-8">
          <div className="max-w-md text-xs text-neutral-600 space-y-1">
            <p>
              <span className="font-semibold text-neutral-800">Total Items:</span>{" "}
              {returnRec.items.length} ({totalUnits} total units returned)
            </p>
            <p className="italic">
              Note: This debit note reverses input tax credit under GST Rule 54(3). Please credit our ledger account accordingly.
            </p>
          </div>

          <div className="w-64 space-y-1 text-xs text-neutral-700">
            <div className="flex justify-between py-0.5">
              <span>Taxable Value:</span>
              <span className="font-mono font-medium">{formatINR(returnRec.taxableAmount)}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span>Tax (GST Reversal):</span>
              <span className="font-mono font-medium">{formatINR(returnRec.taxAmount)}</span>
            </div>
            <div className="flex justify-between py-1 border-t-2 border-neutral-900 text-sm font-bold text-neutral-900 mt-2">
              <span>Total Debit:</span>
              <span className="font-mono">{formatINR(returnRec.totalAmount)}</span>
            </div>
          </div>
        </div>

        {/* Signatures */}
        <div className="grid grid-cols-2 gap-8 pt-12 border-t border-dashed border-neutral-300 text-xs">
          <div>
            <p className="text-neutral-500 uppercase tracking-wider font-semibold mb-8">
              Goods Returned & Handed Over By:
            </p>
            <p className="font-semibold border-t border-neutral-400 pt-1 inline-block min-w-[180px]">
              {returnRec.createdByName || "Store Pharmacist"}
            </p>
          </div>

          <div className="text-right">
            <p className="text-neutral-500 uppercase tracking-wider font-semibold mb-8">
              For {store?.name || tenant?.name || "MediFlow Pharmacy"}
            </p>
            <p className="font-semibold border-t border-neutral-400 pt-1 inline-block min-w-[180px]">
              Authorized Signatory
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
