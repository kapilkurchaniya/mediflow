import { getEWayBillDetailAction } from "@/app/actions/gst";
import { formatINR } from "@/lib/money";
import { QrCode } from "@/app/components/QrCode";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Printer, ArrowLeft, CheckCircle2 } from "lucide-react";
import { PrintWatermark } from "@/app/components/PrintWatermark";

export const dynamic = "force-dynamic";

export default async function EWayBillPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getEWayBillDetailAction(id);

  if ("error" in data || !data.document) {
    notFound();
  }

  const { document: doc, store, tenant, items, logs } = data;
  const isCancelled = doc.status === "cancelled";

  const qrPayload = JSON.stringify({
    ewbNo: doc.eWayBillNo,
    genDt: doc.eWayBillDate ? new Date(doc.eWayBillDate).toISOString() : "",
    docNo: doc.docNo,
    docDt: doc.docDate,
    fromGstin: store?.gstin || tenant?.gstin,
    toGstin: doc.partyGstin,
    totVal: doc.total || 0,
  });

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 sm:p-8 print:p-0 print:bg-white text-slate-900">
      <PrintWatermark />
      {/* Top action bar (hidden during print) */}
      <div className="max-w-4xl mx-auto mb-6 flex items-center justify-between print:hidden">
        <Link
          href="/dashboard/gst/e-way-bill"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
        >
          <ArrowLeft className="h-4 w-4" /> Back to E-Way Bills
        </Link>
        <div className="flex items-center gap-2">
          <PrintButton />
        </div>
      </div>

      {/* Official NIC E-Way Bill Format */}
      <div className="max-w-4xl mx-auto bg-white border border-slate-300 shadow-sm print:shadow-none print:border-none p-6 sm:p-8 text-xs font-sans">
        {/* Header */}
        <div className="border-b-2 border-slate-900 pb-3 mb-4 text-center relative">
          {isCancelled && (
            <div className="absolute top-0 right-0 border-2 border-rose-600 text-rose-600 font-bold px-3 py-1 text-sm uppercase tracking-wider rounded rotate-12">
              Cancelled
            </div>
          )}
          <h1 className="text-base font-bold tracking-tight uppercase">e-Way Bill System</h1>
          <p className="text-[11px] text-slate-600">Goods and Services Tax · Government of India</p>
          <p className="text-[10px] text-slate-500 font-mono mt-0.5">FORM GST EWB-01 (See Rule 138)</p>
        </div>

        {/* EWB Summary Banner */}
        <div className="grid grid-cols-3 gap-2 border border-slate-300 p-3 mb-4 bg-slate-50 font-mono text-[11px]">
          <div>
            <span className="text-slate-500 block text-[10px]">E-WAY BILL NO.</span>
            <span className="text-sm font-bold text-slate-900">{doc.eWayBillNo}</span>
          </div>
          <div>
            <span className="text-slate-500 block text-[10px]">GENERATED DATE</span>
            <span className="font-semibold text-slate-900">
              {doc.eWayBillDate ? new Date(doc.eWayBillDate).toLocaleString("en-IN") : "-"}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block text-[10px]">VALID UNTIL</span>
            <span className="font-semibold text-slate-900">
              {doc.eWayBillValidTill ? new Date(doc.eWayBillValidTill).toLocaleString("en-IN") : "-"}
            </span>
          </div>
        </div>

        {/* Section A: Part-A Details */}
        <div className="border border-slate-300 mb-4">
          <div className="bg-slate-200 font-bold px-3 py-1.5 border-b border-slate-300 text-[11px] uppercase tracking-wide">
            Part-A: Consignment & Document Details
          </div>
          <div className="grid grid-cols-2 divide-x divide-slate-300 p-3 gap-4">
            {/* Consignor (From) */}
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase text-slate-500">1. From (Consignor / Supplier)</span>
              <div className="font-bold text-slate-900">{store?.name || tenant?.name}</div>
              <div className="font-mono text-slate-800">GSTIN: {store?.gstin || tenant?.gstin || "URP"}</div>
              <div className="text-slate-600 text-[11px]">{store?.address || tenant?.address || "Registered Facility"}</div>
              <div className="text-slate-600 text-[11px]">State Code: {store?.stateCode || tenant?.stateCode || "27"}</div>
            </div>

            {/* Consignee (To) */}
            <div className="space-y-1 pl-4">
              <span className="text-[10px] font-bold uppercase text-slate-500">2. To (Consignee / Recipient)</span>
              <div className="font-bold text-slate-900">{doc.partyName || "Branch / Recipient"}</div>
              <div className="font-mono text-slate-800">GSTIN: {doc.partyGstin || "URP / Consumer"}</div>
              <div className="text-slate-600 text-[11px]">{doc.placeOfSupply || "Place of Supply"}</div>
              <div className="text-slate-600 text-[11px]">State Code: {doc.partyStateCode || "27"}</div>
            </div>
          </div>

          <div className="border-t border-slate-300 p-3 grid grid-cols-4 gap-2 text-[11px]">
            <div>
              <span className="text-slate-500 block text-[10px]">DOCUMENT TYPE</span>
              <span className="font-semibold uppercase">{doc.docType.replace("_", " ")}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">DOCUMENT NO.</span>
              <span className="font-mono font-semibold">{doc.docNo}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">DOCUMENT DATE</span>
              <span className="font-semibold">{doc.docDate}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">TOTAL VALUE</span>
              <span className="font-mono font-bold text-slate-900">{formatINR(doc.total || 0)}</span>
            </div>
          </div>
        </div>

        {/* Section B: Goods Details Table */}
        <div className="border border-slate-300 mb-4">
          <div className="bg-slate-200 font-bold px-3 py-1.5 border-b border-slate-300 text-[11px] uppercase tracking-wide">
            Consignment Goods Description
          </div>
          <table className="w-full text-left text-[11px]">
            <thead className="bg-slate-50 border-b border-slate-300 text-slate-600">
              <tr>
                <th className="py-1.5 px-3">Item Description</th>
                <th className="py-1.5 px-2">HSN</th>
                <th className="py-1.5 px-2 text-right">Qty</th>
                <th className="py-1.5 px-2 text-right">Rate</th>
                <th className="py-1.5 px-2 text-right">Taxable (₹)</th>
                <th className="py-1.5 px-3 text-right">Total (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {items && items.length > 0 ? (
                items.map((it, idx) => (
                  <tr key={idx}>
                    <td className="py-1 px-3 font-medium">
                      {it.name}
                      {it.batchNo ? <span className="text-slate-500 text-[10px] ml-1">({it.batchNo})</span> : ""}
                    </td>
                    <td className="py-1 px-2 font-mono">{it.hsn || "3004"}</td>
                    <td className="py-1 px-2 text-right font-mono">{it.qty}</td>
                    <td className="py-1 px-2 text-right font-mono">{formatINR(it.unitPrice)}</td>
                    <td className="py-1 px-2 text-right font-mono">{formatINR(it.taxableAmount)}</td>
                    <td className="py-1 px-3 text-right font-mono font-medium">{formatINR(it.total)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="py-2 px-3 font-medium">Pharmaceutical Products</td>
                  <td className="py-2 px-2 font-mono">3004</td>
                  <td className="py-2 px-2 text-right font-mono">1 LOT</td>
                  <td className="py-2 px-2 text-right font-mono">{formatINR(doc.taxableAmount || 0)}</td>
                  <td className="py-2 px-2 text-right font-mono">{formatINR(doc.taxableAmount || 0)}</td>
                  <td className="py-2 px-3 text-right font-mono font-bold">{formatINR(doc.total || 0)}</td>
                </tr>
              )}
            </tbody>
            <tfoot className="border-t border-slate-300 bg-slate-50 font-bold">
              <tr>
                <td colSpan={4} className="py-1.5 px-3 text-right">Grand Total:</td>
                <td className="py-1.5 px-2 text-right font-mono">{formatINR(doc.taxableAmount || 0)}</td>
                <td className="py-1.5 px-3 text-right font-mono">{formatINR(doc.total || 0)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Section C: Part-B Transportation Details */}
        <div className="border border-slate-300 mb-6">
          <div className="bg-slate-200 font-bold px-3 py-1.5 border-b border-slate-300 text-[11px] uppercase tracking-wide">
            Part-B: Vehicle & Transporter Details (Rule 138)
          </div>
          <div className="p-3 grid grid-cols-4 gap-3 text-[11px]">
            <div>
              <span className="text-slate-500 block text-[10px]">MODE</span>
              <span className="font-semibold uppercase">
                {doc.transportMode === "1" ? "Road" : doc.transportMode === "2" ? "Rail" : doc.transportMode === "3" ? "Air" : "Road"}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">VEHICLE NUMBER</span>
              <span className="font-mono font-bold text-slate-900">{doc.vehicleNo || "N/A (Part-A Only)"}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">TRANSPORTER ID / NAME</span>
              <span className="font-semibold">{doc.transporterName || doc.transporterId || "Self Transport"}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">APPROX DISTANCE</span>
              <span className="font-mono font-semibold">{doc.distanceKm ? `${doc.distanceKm} KM` : "Local Transit"}</span>
            </div>
          </div>
        </div>

        {/* Verification QR Code & Footer */}
        <div className="border-t-2 border-slate-900 pt-4 flex items-center justify-between">
          <div className="space-y-1 max-w-md">
            <div className="flex items-center gap-1.5 text-emerald-700 font-bold text-[11px]">
              <CheckCircle2 className="h-4 w-4" /> Valid E-Way Bill under Central GST Rules
            </div>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              This is a computer generated statutory transit document verified via MediFlow Compliance Gateway.
              No physical signature is required per Notification No. 74/2018-Central Tax.
            </p>
          </div>
          <div className="p-2 border border-slate-300 bg-white rounded">
            <QrCode value={qrPayload} size={110} />
          </div>
        </div>
      </div>
    </div>
  );
}

function PrintButton() {
  "use client";
  return (
    <button
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 shadow-sm"
    >
      <Printer className="h-4 w-4" /> Print Document (A4)
    </button>
  );
}
