import { getSaleById } from "@/app/actions/sales";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { Printer, Receipt, User, Stethoscope } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/app/components/ui";
import { formatINR } from "@/lib/format";
import { requirePagePermission } from "@/server/rbac";

export const metadata = { title: "Invoice Details" };

export default async function SaleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePagePermission("sale.view");
  const { id } = await params;
  const data = await getSaleById(id);

  if (!data) return notFound();

  const { sale, items, customer, store } = data;
  const isPaid = !sale.creditAmount || sale.creditAmount <= 0;
  const isPartial = !isPaid && (sale.paidAmount ?? 0) > 0;

  return (
    <div className="page space-y-6">
      <PageHeader
        title={`Invoice ${sale.invoiceNo}`}
        description={`Raised on ${format(new Date(sale.completedAt ?? sale.createdAt!), "d MMMM yyyy, hh:mm a")}`}
        backHref="/dashboard/sales"
        actions={
          <div className="flex items-center gap-2">
            <Link
              href={`/dashboard/sales/${sale.id}/print?format=thermal`}
              className="btn btn-secondary"
            >
              <Printer className="h-4 w-4 mr-1.5" /> Thermal 80mm
            </Link>
            <Link
              href={`/dashboard/sales/${sale.id}/print?format=gst`}
              className="btn btn-primary"
            >
              <Receipt className="h-4 w-4 mr-1.5" /> A4 GST Invoice
            </Link>
          </div>
        }
      />

      {/* Top Status & Party Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Customer Card */}
        <div className="card p-4 space-y-2 shadow-xs">
          <div className="flex items-center gap-2 text-ink-500 text-[12px] font-medium uppercase tracking-wider">
            <User className="h-4 w-4 text-brand-600" />
            <span>Customer Details</span>
          </div>
          <div className="text-[15px] font-bold text-ink-900">{customer?.name || "Walk-in Customer"}</div>
          {customer?.phone && (
            <div className="text-[13px] text-ink-600">
              Mobile: <span className="font-mono">{customer.phone}</span>
            </div>
          )}
          {customer?.gstin && (
            <div className="text-[12px] text-ink-500 font-mono">GSTIN: {customer.gstin}</div>
          )}
        </div>

        {/* Doctor / Prescription Card */}
        <div className="card p-4 space-y-2 shadow-xs">
          <div className="flex items-center gap-2 text-ink-500 text-[12px] font-medium uppercase tracking-wider">
            <Stethoscope className="h-4 w-4 text-brand-600" />
            <span>Doctor Prescription</span>
          </div>
          <div className="text-[15px] font-bold text-ink-900">
            {sale.doctorName || <span className="text-ink-400 font-normal">Over The Counter (OTC)</span>}
          </div>
          <div className="text-[12.5px] text-ink-500">
            {sale.doctorName ? "Doctor registered on invoice" : "Self-prescribed / OTC consultation"}
          </div>
        </div>

        {/* Invoice Payment Status Card */}
        <div className="card p-4 space-y-2 shadow-xs">
          <div className="flex items-center justify-between text-ink-500 text-[12px] font-medium uppercase tracking-wider">
            <span>Payment Status</span>
            <span
              className={`badge badge-dot ${
                isPaid ? "badge-success" : isPartial ? "badge-warning" : "badge-danger"
              }`}
            >
              {isPaid ? "Fully Paid" : isPartial ? "Partially Paid" : "Unpaid Credit"}
            </span>
          </div>
          <div className="text-2xl font-black text-ink-900 num">{formatINR(sale.totalAmount)}</div>
          <div className="text-[12.5px] text-ink-500 flex justify-between">
            <span>Paid: {formatINR(sale.paidAmount ?? 0)}</span>
            {sale.creditAmount && sale.creditAmount > 0 ? (
              <span className="font-semibold text-amber-700">Due: {formatINR(sale.creditAmount)}</span>
            ) : null}
          </div>
        </div>
      </div>

      {/* Line Items Table */}
      <div className="card overflow-hidden shadow-xs">
        <div className="card-header !py-3 bg-ink-50/50 border-b border-ink-150">
          <h3 className="card-title text-[14px]">Billed Medicines ({items.length})</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Item & Composition</th>
                <th>Batch / Expiry</th>
                <th className="text-center">Qty</th>
                <th className="text-right">MRP</th>
                <th className="text-right">Rate</th>
                <th className="text-center">GST %</th>
                <th className="text-right">Taxable</th>
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <span className="font-bold text-ink-900">{item.medicineName}</span>
                  </td>
                  <td>
                    <span className="font-mono text-[12.5px] font-medium text-ink-800">{item.batchNo}</span>
                    <div className="cell-sub num">{item.expiryDate}</div>
                  </td>
                  <td className="text-center">
                    <span className="badge badge-neutral num font-bold">{item.qty}</span>
                  </td>
                  <td className="text-right num text-ink-600">{formatINR(item.mrp)}</td>
                  <td className="text-right num text-ink-800">{formatINR(item.rate)}</td>
                  <td className="text-center num text-ink-600">{(item.gstRateBp ?? 0) / 100}%</td>
                  <td className="text-right num text-ink-700">{formatINR(item.taxableAmount)}</td>
                  <td className="text-right num font-bold text-ink-900">{formatINR(item.totalAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Financial Totals Breakdown Footer */}
        <div className="p-6 bg-ink-25 border-t border-ink-150 flex flex-col md:flex-row justify-between gap-6">
          <div className="space-y-1 text-[12.5px] text-ink-500">
            <p>Store: <strong>{store?.name}</strong></p>
            <p>GSTIN: <span className="font-mono">{store?.gstin || "Unregistered"}</span></p>
            <p>Drug License No: <span className="font-mono">{store?.drugLicenseNo || "N/A"}</span></p>
          </div>

          <div className="w-full md:w-80 space-y-2 text-[13px]">
            <div className="flex justify-between text-ink-600">
              <span>Gross Amount</span>
              <span className="num font-medium text-ink-800">{formatINR(sale.grossAmount)}</span>
            </div>
            {sale.discountAmount && sale.discountAmount > 0 ? (
              <div className="flex justify-between text-brand-700">
                <span>Discount</span>
                <span className="num font-medium">- {formatINR(sale.discountAmount)}</span>
              </div>
            ) : null}
            <div className="flex justify-between text-ink-600">
              <span>Taxable Value</span>
              <span className="num font-medium text-ink-800">{formatINR(sale.taxableAmount)}</span>
            </div>
            <div className="flex justify-between text-ink-600">
              <span>CGST</span>
              <span className="num font-medium text-ink-800">{formatINR(sale.cgst)}</span>
            </div>
            <div className="flex justify-between text-ink-600">
              <span>SGST</span>
              <span className="num font-medium text-ink-800">{formatINR(sale.sgst)}</span>
            </div>
            {sale.igst && sale.igst > 0 ? (
              <div className="flex justify-between text-ink-600">
                <span>IGST</span>
                <span className="num font-medium text-ink-800">{formatINR(sale.igst)}</span>
              </div>
            ) : null}
            {sale.roundOff && sale.roundOff !== 0 ? (
              <div className="flex justify-between text-ink-600">
                <span>Round Off</span>
                <span className="num font-medium">
                  {sale.roundOff > 0 ? "+" : ""}{formatINR(sale.roundOff)}
                </span>
              </div>
            ) : null}
            <div className="pt-2 border-t border-ink-200 flex justify-between items-baseline">
              <span className="font-bold text-ink-900 text-[14px]">Net Total</span>
              <span className="font-black text-brand-700 text-xl num">{formatINR(sale.totalAmount)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
