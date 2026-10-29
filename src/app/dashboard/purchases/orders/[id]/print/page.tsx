import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { requirePagePermission, getAuthCtx } from "@/server/rbac";
import { db, schema } from "@/server/db";
import { eq } from "drizzle-orm";
import { getPurchaseOrder } from "@/app/actions/purchase-orders";
import { formatINR } from "@/lib/format";
import PrintButton from "@/app/dashboard/sales/[id]/print/PrintButton";

export const metadata = { title: "Print Purchase Order" };

export default async function PrintPurchaseOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePagePermission("purchase.view");
  const resolved = await params;
  const ctx = await getAuthCtx();

  const [po, [store], [tenant]] = await Promise.all([
    getPurchaseOrder(resolved.id),
    db.select().from(schema.stores).where(eq(schema.stores.id, ctx.storeId)),
    db.select().from(schema.tenants).where(eq(schema.tenants.id, ctx.tenantId)),
  ]);

  if (!po) return notFound();

  const totalOrderedUnits = po.items.reduce((sum, item) => sum + item.qty + item.freeQty, 0);

  return (
    <div className="min-h-screen bg-ink-100 py-6 px-4 font-sans text-ink-900 print:bg-white print:p-0 print:m-0 print:min-h-0">
      {/* Print styles for A4 document */}
      <style
        dangerouslySetInnerHTML={{
          __html: `@media print {
            @page { size: A4 portrait; margin: 10mm; }
            body { margin: 0 !important; padding: 0 !important; }
            #po-printable { width: 100% !important; max-width: 100% !important; margin: 0 !important; padding: 0 !important; box-shadow: none !important; border: none !important; }
          }`,
        }}
      />

      {/* Action Bar (hidden when printing) */}
      <div className="max-w-3xl mx-auto mb-6 flex justify-between items-center print:hidden">
        <Link
          href={`/dashboard/purchases/orders/${po.id}`}
          className="flex items-center text-ink-600 hover:text-brand-700 transition-colors font-medium text-sm"
        >
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Order
        </Link>
        <PrintButton />
      </div>

      {/* Printable Sheet */}
      <div
        id="po-printable"
        className="max-w-3xl mx-auto bg-white p-8 shadow-xl border border-ink-200 rounded-lg text-ink-900 font-sans"
      >
        {/* Header Grid */}
        <div className="flex justify-between items-start pb-6 border-b border-ink-200 gap-6">
          <div>
            <span className="text-[10px] font-black tracking-widest text-brand-700 uppercase block mb-1">
              Procurement Purchase Order
            </span>
            <h1 className="text-xl font-black text-ink-900 tracking-tight">{tenant?.name}</h1>
            <p className="text-xs font-semibold text-ink-800 mt-0.5">{store?.name}</p>
            <p className="text-xs text-ink-600 max-w-sm mt-0.5">{store?.address || "Pharmacy Store"}</p>
            <div className="text-xs text-ink-500 space-x-3 mt-1.5 font-mono">
              <span>GSTIN: <strong>{store?.gstin || "N/A"}</strong></span>
              <span>DL: <strong>{store?.drugLicenseNo || "N/A"}</strong></span>
            </div>
          </div>

          <div className="text-right">
            <h2 className="text-xl font-black text-ink-900 tracking-tight">PURCHASE ORDER</h2>
            <div className="mt-2 bg-ink-50 rounded-lg p-2.5 border border-ink-150 text-left text-xs font-mono inline-block space-y-0.5">
              <div>
                <span className="text-ink-500">PO No:</span> <strong>{po.poNo}</strong>
              </div>
              <div>
                <span className="text-ink-500">Date:</span> {format(new Date(po.createdAt), "dd MMM yyyy")}
              </div>
              {po.expectedDate && (
                <div>
                  <span className="text-ink-500">Expected:</span>{" "}
                  <strong>{format(new Date(po.expectedDate), "dd MMM yyyy")}</strong>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Vendor Box */}
        <div className="my-6 p-4 rounded-lg bg-ink-50/70 border border-ink-150 text-xs flex justify-between">
          <div>
            <span className="font-bold text-ink-400 uppercase tracking-wider block mb-1">
              Supplier / Vendor
            </span>
            <p className="font-bold text-ink-900 text-sm">{po.supplierName}</p>
            {po.supplierAddress && <p className="text-ink-600 mt-0.5">{po.supplierAddress}</p>}
            {po.supplierPhone && (
              <p className="text-ink-600 font-mono mt-0.5">Phone: {po.supplierPhone}</p>
            )}
            {po.supplierGstin && (
              <p className="text-ink-600 font-mono">GSTIN: {po.supplierGstin}</p>
            )}
          </div>
          <div className="text-right">
            <span className="font-bold text-ink-400 uppercase tracking-wider block mb-1">Status</span>
            <span className="text-xs font-bold uppercase tracking-wider text-brand-700">
              {po.status}
            </span>
            {po.approvedByName && (
              <p className="text-ink-500 text-[11px] mt-1">
                Approved by {po.approvedByName}
              </p>
            )}
          </div>
        </div>

        {/* Line Items Table */}
        <div className="mb-6 overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-brand-50 border-y border-brand-100 text-brand-900 font-bold">
                <th className="py-2.5 px-3 w-10">#</th>
                <th className="py-2.5 px-3">Medicine Description</th>
                <th className="py-2.5 px-3 text-center font-mono">HSN</th>
                <th className="py-2.5 px-3 text-center">Pack</th>
                <th className="py-2.5 px-3 text-center">Qty</th>
                <th className="py-2.5 px-3 text-center">Free</th>
                <th className="py-2.5 px-3 text-right">Est. Rate</th>
                <th className="py-2.5 px-3 text-right">Line Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-150">
              {po.items.map((item, idx) => {
                const lineTotalPaise = item.qty * item.rate;

                return (
                  <tr key={item.id} className="hover:bg-ink-50/50">
                    <td className="py-2.5 px-3 text-ink-400 font-mono">{idx + 1}</td>
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-ink-900">{item.medicineName}</div>
                      {item.genericName && (
                        <div className="text-[10px] text-ink-500 italic">{item.genericName}</div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono text-ink-600">
                      {item.hsnCode || "3004"}
                    </td>
                    <td className="py-2.5 px-3 text-center text-ink-600">{item.packSize || "—"}</td>
                    <td className="py-2.5 px-3 text-center font-bold num">{item.qty}</td>
                    <td className="py-2.5 px-3 text-center num text-ink-600">{item.freeQty}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-ink-700">
                      {formatINR(item.rate)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-ink-900">
                      {formatINR(lineTotalPaise)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Bottom Notes & Totals */}
        <div className="flex justify-between items-start border-t border-ink-200 pt-6 gap-6 text-xs">
          <div className="w-1/2 space-y-3">
            <div>
              <h4 className="font-bold text-ink-400 uppercase tracking-wider mb-1">
                Instructions & Terms
              </h4>
              <p className="text-ink-600 text-[11px] leading-relaxed">
                {po.notes ? po.notes : "Please dispatch goods along with standard tax invoice mentioning this PO number."}
                <br />
                All medicines must have minimum 75% shelf life remaining at time of delivery.
              </p>
            </div>
            <div className="pt-8">
              <div className="w-48 border-t border-ink-400 text-center pt-1 text-[11px] text-ink-600">
                Authorised Signatory
              </div>
            </div>
          </div>

          <div className="w-64 bg-ink-50 p-4 rounded-xl border border-ink-150 space-y-1.5">
            <div className="flex justify-between text-ink-600">
              <span>Total Items</span>
              <span className="font-medium text-ink-900 num">{po.items.length}</span>
            </div>
            <div className="flex justify-between text-ink-600">
              <span>Total Units</span>
              <span className="font-medium text-ink-900 num">{totalOrderedUnits}</span>
            </div>
            <div className="pt-2 border-t border-ink-200 flex justify-between items-baseline">
              <span className="text-xs font-bold text-ink-900">Estimated Total</span>
              <span className="text-lg font-black text-brand-700 font-mono">
                {formatINR(po.estimatedTotal)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

