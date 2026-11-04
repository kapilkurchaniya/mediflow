"use client";

import { ShieldCheck, Truck } from "lucide-react";

interface StatutoryCardProps {
  docKind: string;
  documentNo?: string | null;
  fromStoreGstin?: string | null;
  toStoreGstin?: string | null;
  vehicleNo?: string | null;
  eWayBillNo?: string | null;
  transporterName?: string | null;
  transportMode?: string | null;
  isEWayBillRequired: boolean;
}

export function StatutoryCard({
  docKind,
  documentNo,
  fromStoreGstin,
  toStoreGstin,
  vehicleNo,
  eWayBillNo,
  transporterName,
  transportMode,
  isEWayBillRequired,
}: StatutoryCardProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="rounded-xl border border-ink-200 bg-white p-4 shadow-xs space-y-3">
        <div className="flex items-center gap-2 text-ink-900 font-semibold text-xs uppercase tracking-wider">
          <ShieldCheck className="h-4 w-4 text-brand-600" />
          Statutory & GST Compliance
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-ink-400 block text-[11px]">Document Type</span>
            <span className="font-medium text-ink-800">
              {docKind === "tax_invoice" ? "Rule 46 Tax Invoice" : "Rule 55 Delivery Challan"}
            </span>
          </div>
          <div>
            <span className="text-ink-400 block text-[11px]">Sequential Doc #</span>
            <span className="font-mono font-medium text-ink-800">{documentNo || "Generated on Dispatch"}</span>
          </div>
          <div>
            <span className="text-ink-400 block text-[11px]">Consignor GSTIN</span>
            <span className="font-mono text-ink-700">{fromStoreGstin || "Unregistered"}</span>
          </div>
          <div>
            <span className="text-ink-400 block text-[11px]">Consignee GSTIN</span>
            <span className="font-mono text-ink-700">{toStoreGstin || "Unregistered"}</span>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-ink-200 bg-white p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-ink-900 font-semibold text-xs uppercase tracking-wider">
            <Truck className="h-4 w-4 text-brand-600" />
            Transportation & E-Way Bill
          </div>
          {isEWayBillRequired && (
            <span className="rounded bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 border border-amber-200">
              E-Way Bill &gt; ₹50k
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-ink-400 block text-[11px]">Vehicle Number</span>
            <span className="font-medium text-ink-800 uppercase font-mono">{vehicleNo || "Not specified"}</span>
          </div>
          <div>
            <span className="text-ink-400 block text-[11px]">E-Way Bill #</span>
            <span className="font-mono text-ink-800">{eWayBillNo || "Not issued"}</span>
          </div>
          <div>
            <span className="text-ink-400 block text-[11px]">Transporter</span>
            <span className="text-ink-700">{transporterName || "Self / Branch Transit"}</span>
          </div>
          <div>
            <span className="text-ink-400 block text-[11px]">Transport Mode</span>
            <span className="text-ink-700 capitalize">{transportMode || "Road"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
