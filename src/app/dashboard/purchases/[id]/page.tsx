import React from "react";
import { getPurchaseById } from "@/app/actions/purchases";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { Truck, FileInput, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/app/components/ui";
import { formatINR, formatNumber } from "@/lib/format";
import { requirePagePermission } from "@/server/rbac";
import { RegisterPendingSupplierButton } from "@/app/components/QuickRegisterSupplierModal";

export const metadata = { title: "Goods Receipt Note (GRN) Details | MediFlow" };

export default async function PurchaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePagePermission("purchase.view");
  const { id } = await params;
  const data = await getPurchaseById(id);

  if (!data) return notFound();

  const { purchase, supplier, store, items } = data;

  const totalTax = (purchase.cgst ?? 0) + (purchase.sgst ?? 0) + (purchase.igst ?? 0);

  return (
    <div className="page space-y-6">
      <PageHeader
        title={`GRN ${purchase.purchaseNo}`}
        description={`Supplier Invoice #${purchase.supplierInvoiceNo} dated ${format(new Date(purchase.invoiceDate), "d MMMM yyyy")}`}
        backHref="/dashboard/purchases"
        actions={
          <div className="flex items-center gap-2 print:hidden">
            <Link
              href="/dashboard/purchases"
              className="btn btn-secondary btn-sm"
            >
              All Purchases
            </Link>
          </div>
        }
      />

      {/* Unregistered Supplier Warning Banner */}
      {purchase.pendingSupplierMeta && (
        <div className="rounded-xl border border-amber-300 bg-amber-50/90 p-4 text-amber-950 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold">
                Supplier &ldquo;{purchase.pendingSupplierMeta.name}&rdquo; is not registered in your directory yet
              </p>
              <p className="text-xs text-amber-900 mt-0.5">
                Stock was imported from this invoice, but you need to add this supplier to link payables, supplier ledger, and GST ITC.
              </p>
            </div>
          </div>
          <RegisterPendingSupplierButton
            meta={purchase.pendingSupplierMeta}
            purchaseId={purchase.id}
            label="Register & Link Supplier (Pre-filled)"
            size="sm"
          />
        </div>
      )}

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Supplier Card */}
        <div className="card p-4 space-y-2 shadow-xs">
          <div className="flex items-center justify-between gap-2 text-ink-500 text-[12px] font-medium uppercase tracking-wider">
            <span className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-brand-600" />
              <span>Supplier / Distributor</span>
            </span>
            {purchase.pendingSupplierMeta && (
              <span className="badge badge-warning !text-[10px]">Unregistered</span>
            )}
          </div>
          <div className="text-[15px] font-bold text-ink-900">
            {purchase.pendingSupplierMeta ? purchase.pendingSupplierMeta.name : supplier.name}
          </div>
          {(purchase.pendingSupplierMeta?.phone || supplier.phone) && (
            <div className="text-[13px] text-ink-600 font-mono">
              Phone: {purchase.pendingSupplierMeta?.phone || supplier.phone}
            </div>
          )}
          {(purchase.pendingSupplierMeta?.gstin || supplier.gstin) && (
            <div className="text-[12px] text-ink-500 font-mono">
              GSTIN: {purchase.pendingSupplierMeta?.gstin || supplier.gstin}
            </div>
          )}
          {(purchase.pendingSupplierMeta?.drugLicenseNo || supplier.drugLicenseNo) && (
            <div className="text-[12px] text-ink-500 font-mono">
              D.L.: {purchase.pendingSupplierMeta?.drugLicenseNo || supplier.drugLicenseNo}
            </div>
          )}
        </div>

        {/* Invoice & GRN Details Card */}
        <div className="card p-4 space-y-2 shadow-xs">
          <div className="flex items-center gap-2 text-ink-500 text-[12px] font-medium uppercase tracking-wider">
            <FileInput className="h-4 w-4 text-brand-600" />
            <span>Invoice & Verification</span>
          </div>
          <div className="text-[15px] font-bold text-ink-900 font-mono">
            {purchase.supplierInvoiceNo}
          </div>
          <div className="text-[12.5px] text-ink-500 flex justify-between">
            <span>Invoice Date:</span>
            <span className="font-medium text-ink-800 num">
              {format(new Date(purchase.invoiceDate), "d MMM yyyy")}
            </span>
          </div>
          <div className="text-[12.5px] text-ink-500 flex justify-between">
            <span>Receiving Store:</span>
            <span className="font-medium text-ink-800">{store.name}</span>
          </div>
        </div>

        {/* Financial Valuation Card */}
        <div className="card p-4 space-y-2 shadow-xs">
          <div className="flex items-center justify-between text-ink-500 text-[12px] font-medium uppercase tracking-wider">
            <span>Posted Valuation</span>
            <span className="badge badge-success badge-dot">Stock Updated</span>
          </div>
          <div className="text-2xl font-black text-ink-900 num">{formatINR(purchase.totalAmount)}</div>
          <div className="text-[12.5px] text-ink-500 space-y-0.5">
            <div className="flex justify-between">
              <span>Taxable: {formatINR(purchase.taxableAmount ?? 0)}</span>
              <span>Total GST: {formatINR(totalTax)}</span>
            </div>
            {(purchase.cashDiscountAmount ?? 0) > 0 && (
              <div className="flex justify-between text-emerald-700 font-medium">
                <span>Cash Discount (CD):</span>
                <span>- {formatINR(purchase.cashDiscountAmount ?? 0)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Items Table */}
      <div className="card overflow-hidden">
        <div className="card-header border-b border-ink-150">
          <div>
            <h2 className="card-title">Inward Medicine Batches ({items.length} items)</h2>
            <p className="text-[12px] text-ink-500">
              Batches created and added to physical inventory ledger.
            </p>
          </div>
          <span className="badge badge-neutral num font-mono text-[12px]">
            {formatNumber(items.reduce((sum, i) => sum + i.item.qty + (i.item.freeQty || 0), 0))} Total Units
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Medicine Name</th>
                <th>Batch No.</th>
                <th>Expiry</th>
                <th className="text-right">Billed Qty</th>
                <th className="text-right">Free Qty</th>
                <th className="text-right">Purchase Rate</th>
                <th className="text-right">MRP</th>
                <th className="text-right">GST %</th>
                <th className="text-right">Line Total (₹)</th>
              </tr>
            </thead>
            <tbody>
              {items.map(({ item, medicine }, idx) => (
                <tr key={item.id} className="hover:bg-ink-50/70 transition-colors">
                  <td className="text-ink-400 font-mono text-[12px]">{idx + 1}</td>
                  <td className="cell-primary">
                    <p className="font-semibold text-ink-900">{medicine.name}</p>
                    {medicine.genericName && (
                      <p className="cell-sub">{medicine.genericName}</p>
                    )}
                    {item.unitsPerPack > 1 && (
                      <p className="text-[11px] text-brand-700 font-medium">
                        1 {item.packUnit} = {item.unitsPerPack} {item.looseUnit}s
                      </p>
                    )}
                  </td>
                  <td className="font-mono text-[12.5px] font-bold text-ink-800">
                    {item.batchNo}
                  </td>
                  <td className="num font-medium text-ink-700 whitespace-nowrap">
                    {item.expiryDate}
                  </td>
                  <td className="text-right num font-semibold text-ink-900">
                    {item.qty}
                  </td>
                  <td className="text-right num text-emerald-700 font-medium">
                    {item.freeQty > 0 ? (
                      <div>
                        <span>+{item.freeQty}</span>
                        <span className="badge badge-success text-[10px] block mt-0.5">
                          {item.schemeType || `${item.qty}+${item.freeQty}`}
                        </span>
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="text-right num text-ink-800">
                    {formatINR(item.rate)}
                  </td>
                  <td className="text-right num text-ink-500">
                    {formatINR(item.mrp)}
                  </td>
                  <td className="text-right num text-ink-600">
                    {(item.gstRateBp / 100).toFixed(0)}%
                  </td>
                  <td className="text-right num font-bold text-ink-900">
                    {formatINR(item.totalAmount)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-ink-50/90 font-bold border-t-2 border-ink-300 text-ink-900">
                <td colSpan={4} className="text-right uppercase tracking-wider text-[11.5px]">
                  Total Inward Purchase
                </td>
                <td className="text-right num">
                  {formatNumber(items.reduce((sum, i) => sum + i.item.qty, 0))}
                </td>
                <td className="text-right num text-emerald-700">
                  {formatNumber(items.reduce((sum, i) => sum + (i.item.freeQty || 0), 0))}
                </td>
                <td colSpan={3} className="text-right num text-ink-600 text-[12.5px]">
                  Taxable: {formatINR(purchase.taxableAmount ?? 0)} · GST: {formatINR(totalTax)}
                  {(purchase.cashDiscountAmount ?? 0) > 0 ? ` · CD: -${formatINR(purchase.cashDiscountAmount ?? 0)}` : ""}
                </td>
                <td className="text-right num text-brand-700 text-[15px]">
                  {formatINR(purchase.totalAmount)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
