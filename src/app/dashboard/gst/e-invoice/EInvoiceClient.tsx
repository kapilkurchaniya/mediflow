"use client";

import { useState } from "react";
import {
  QrCode,
  Truck,
  CheckCircle2,
  AlertCircle,
  X,
  Loader2,
  Copy,
  Check,
  Ban,
  FileText,
} from "lucide-react";
import { formatINR } from "@/lib/money";
import {
  generateEInvoiceAction,
  cancelEInvoiceAction,
  generateEWayBillAction,
} from "@/app/actions/gst";

export interface GstDocItem {
  id: string;
  docNo: string;
  docDate: string;
  partyName: string | null;
  partyGstin: string | null;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  irn: string | null;
  irnDate: Date | string | null;
  ackNo: string | null;
  ackDate: Date | string | null;
  signedQrCode: string | null;
  eWayBillNo: string | null;
  eWayBillDate: Date | string | null;
  eWayBillValidTill: Date | string | null;
  status: string;
}

export function EInvoiceClient({ invoices }: { invoices: GstDocItem[] }) {
  const [filter, setFilter] = useState<"all" | "pending" | "generated" | "cancelled">("all");
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [copiedIrn, setCopiedIrn] = useState<string | null>(null);

  // Modals
  const [viewDoc, setViewDoc] = useState<GstDocItem | null>(null);
  const [cancelDoc, setCancelDoc] = useState<GstDocItem | null>(null);
  const [cancelReason, setCancelReason] = useState<"1" | "2" | "3" | "4">("2");
  const [cancelRemarks, setCancelRemarks] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const [ewayDoc, setEwayDoc] = useState<GstDocItem | null>(null);
  const [distanceKm, setDistanceKm] = useState(50);
  const [vehicleNo, setVehicleNo] = useState("");
  const [transporterId, setTransporterId] = useState("");
  const [generatingEwb, setGeneratingEwb] = useState(false);

  const filteredInvoices = invoices.filter((inv) => {
    if (filter === "pending") return !inv.irn && inv.status === "active";
    if (filter === "generated") return Boolean(inv.irn) && inv.status === "active";
    if (filter === "cancelled") return inv.status === "cancelled";
    return true;
  });

  async function handleGenerateIrn(id: string) {
    setLoadingId(id);
    try {
      const res = await generateEInvoiceAction(id);
      if (res.error) {
        alert("Failed to generate IRN: " + res.error);
      } else {
        // success handled by revalidatePath
      }
    } catch (err) {
      alert("Error: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoadingId(null);
    }
  }

  async function handleConfirmCancel() {
    if (!cancelDoc) return;
    setCancelling(true);
    try {
      const res = await cancelEInvoiceAction(cancelDoc.id, cancelReason, cancelRemarks || "Cancelled by user");
      if (res.error) {
        alert("Failed to cancel IRN: " + res.error);
      } else {
        setCancelDoc(null);
        setCancelRemarks("");
      }
    } catch (err) {
      alert("Error: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setCancelling(false);
    }
  }

  async function handleConfirmEwayBill() {
    if (!ewayDoc) return;
    setGeneratingEwb(true);
    try {
      const res = await generateEWayBillAction(ewayDoc.id, {
        distanceKm,
        vehicleNo: vehicleNo || undefined,
        transporterId: transporterId || undefined,
      });
      if (res.error) {
        alert("Failed to generate E-Way bill: " + res.error);
      } else {
        setEwayDoc(null);
        setVehicleNo("");
        setTransporterId("");
      }
    } catch (err) {
      alert("Error: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setGeneratingEwb(false);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopiedIrn(text);
    setTimeout(() => setCopiedIrn(null), 2000);
  }

  return (
    <div className="space-y-4">
      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-ink-150 pb-2">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            filter === "all" ? "bg-brand-600 text-white shadow-xs" : "text-ink-600 hover:bg-ink-100"
          }`}
        >
          All B2B Invoices ({invoices.length})
        </button>
        <button
          type="button"
          onClick={() => setFilter("pending")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            filter === "pending" ? "bg-brand-600 text-white shadow-xs" : "text-ink-600 hover:bg-ink-100"
          }`}
        >
          Pending IRN ({invoices.filter((i) => !i.irn && i.status === "active").length})
        </button>
        <button
          type="button"
          onClick={() => setFilter("generated")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            filter === "generated" ? "bg-brand-600 text-white shadow-xs" : "text-ink-600 hover:bg-ink-100"
          }`}
        >
          IRN Generated ({invoices.filter((i) => Boolean(i.irn) && i.status === "active").length})
        </button>
        <button
          type="button"
          onClick={() => setFilter("cancelled")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            filter === "cancelled" ? "bg-brand-600 text-white shadow-xs" : "text-ink-600 hover:bg-ink-100"
          }`}
        >
          Cancelled ({invoices.filter((i) => i.status === "cancelled").length})
        </button>
      </div>

      {/* Invoices Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table w-full text-xs">
            <thead>
              <tr className="border-b border-ink-150 bg-ink-50/50 text-left font-semibold text-ink-600">
                <th className="py-2.5 px-3">Invoice No</th>
                <th className="py-2.5 px-3">Date</th>
                <th className="py-2.5 px-3">Customer Name</th>
                <th className="py-2.5 px-3">Customer GSTIN</th>
                <th className="py-2.5 px-3 text-right">Taxable</th>
                <th className="py-2.5 px-3 text-right">Invoice Total</th>
                <th className="py-2.5 px-3 text-center">IRN Status</th>
                <th className="py-2.5 px-3 text-center">E-Way Bill</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-150">
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-10 text-ink-400">
                    No invoices matching the current filter.
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-ink-50/50 transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-ink-900 whitespace-nowrap">
                      {inv.docNo}
                    </td>
                    <td className="py-2.5 px-3 text-ink-600 whitespace-nowrap">{inv.docDate}</td>
                    <td className="py-2.5 px-3 font-medium text-ink-800 max-w-[140px] truncate">
                      {inv.partyName || "B2B Client"}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-ink-700">
                      {inv.partyGstin || "—"}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-ink-800">
                      {formatINR(inv.taxableAmount)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-ink-900">
                      {formatINR(inv.total)}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {inv.status === "cancelled" ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-800">
                          <Ban className="h-3 w-3" /> Cancelled
                        </span>
                      ) : inv.irn ? (
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                            <CheckCircle2 className="h-3 w-3" /> Generated
                          </span>
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-100 text-rose-700 border border-rose-200" title="Simulated IRP: Not legally valid for tax compliance">
                            <AlertCircle className="h-2.5 w-2.5" /> SIMULATED – NOT VALID
                          </span>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800">
                          <AlertCircle className="h-3 w-3" /> Pending
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {inv.eWayBillNo ? (
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-100 text-sky-800 font-mono"
                          title={`Valid till: ${inv.eWayBillValidTill ? new Date(inv.eWayBillValidTill).toLocaleDateString() : ""}`}
                        >
                          <Truck className="h-3 w-3" /> {inv.eWayBillNo.slice(-6)}
                        </span>
                      ) : inv.total > 5000000 ? (
                        <span className="text-[10px] font-semibold text-amber-700">
                          Required (&gt;₹50K)
                        </span>
                      ) : (
                        <span className="text-ink-400 text-[10px]">Optional</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        {!inv.irn && inv.status === "active" && (
                          <button
                            type="button"
                            onClick={() => handleGenerateIrn(inv.id)}
                            disabled={loadingId === inv.id}
                            className="btn btn-primary text-xs py-1 px-2.5"
                          >
                            {loadingId === inv.id ? (
                              <Loader2 className="h-3 w-3 animate-spin mr-1" />
                            ) : (
                              <QrCode className="h-3 w-3 mr-1" />
                            )}
                            Generate IRN
                          </button>
                        )}

                        {inv.irn && inv.status === "active" && (
                          <>
                            <button
                              type="button"
                              onClick={() => setViewDoc(inv)}
                              className="btn btn-secondary text-xs py-1 px-2"
                              title="View IRN & Signed QR"
                            >
                              <FileText className="h-3 w-3" />
                            </button>

                            {!inv.eWayBillNo && (
                              <button
                                type="button"
                                onClick={() => setEwayDoc(inv)}
                                className="btn btn-secondary text-xs py-1 px-2"
                                title="Generate E-Way Bill"
                              >
                                <Truck className="h-3 w-3" />
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => setCancelDoc(inv)}
                              className="btn btn-ghost text-xs py-1 px-2 text-red-600 hover:bg-red-50"
                              title="Cancel IRN (24 hr window)"
                            >
                              <Ban className="h-3 w-3" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal 1: View IRN & QR Details */}
      {viewDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="card max-w-lg w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-ink-150">
              <div className="flex items-center gap-2">
                <QrCode className="h-5 w-5 text-brand-600" />
                <h3 className="text-sm font-bold text-ink-900">
                  E-Invoice Details ({viewDoc.docNo})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setViewDoc(null)}
                className="btn btn-ghost btn-icon h-7 w-7"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-rose-50 border border-rose-200 rounded-lg p-2.5 text-rose-800 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>SIMULATED IRN — NOT A VALID E-INVOICE FOR STATUTORY COMPLIANCE</span>
              </div>
              <div>
                <label className="text-ink-500 font-semibold block mb-1">
                  64-Character IRN (Invoice Reference Number)
                </label>
                <div className="flex items-center gap-2 bg-ink-50 p-2 rounded-lg border border-ink-200">
                  <span className="font-mono text-[11px] text-ink-900 break-all select-all flex-1">
                    {viewDoc.irn}
                  </span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(viewDoc.irn || "")}
                    className="btn btn-ghost btn-icon h-6 w-6 text-ink-500 shrink-0"
                    title="Copy IRN"
                  >
                    {copiedIrn === viewDoc.irn ? (
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-ink-50 rounded-lg border border-ink-200">
                  <span className="text-ink-500 block text-[11px]">Ack No</span>
                  <span className="font-mono font-semibold text-ink-900">{viewDoc.ackNo}</span>
                </div>
                <div className="p-3 bg-ink-50 rounded-lg border border-ink-200">
                  <span className="text-ink-500 block text-[11px]">Ack Date</span>
                  <span className="font-mono font-semibold text-ink-900">
                    {viewDoc.ackDate ? new Date(viewDoc.ackDate).toLocaleString() : "—"}
                  </span>
                </div>
              </div>

              {viewDoc.eWayBillNo && (
                <div className="p-3 bg-sky-50 rounded-lg border border-sky-200">
                  <div className="flex items-center justify-between">
                    <span className="text-sky-800 font-semibold">Active E-Way Bill</span>
                    <span className="font-mono font-bold text-sky-900">{viewDoc.eWayBillNo}</span>
                  </div>
                  <div className="text-[11px] text-sky-700 mt-1">
                    Valid till:{" "}
                    {viewDoc.eWayBillValidTill
                      ? new Date(viewDoc.eWayBillValidTill).toLocaleString()
                      : "—"}
                  </div>
                </div>
              )}

              {viewDoc.signedQrCode && (
                <div>
                  <label className="text-ink-500 font-semibold block mb-1">Signed QR Code Payload</label>
                  <p className="font-mono text-[10px] bg-ink-50 p-2 rounded border border-ink-200 text-ink-600 break-all max-h-20 overflow-y-auto">
                    {viewDoc.signedQrCode}
                  </p>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-ink-150 flex justify-end">
              <button
                type="button"
                onClick={() => setViewDoc(null)}
                className="btn btn-secondary text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Cancel IRN */}
      {cancelDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="card max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-ink-150">
              <div className="flex items-center gap-2 text-red-600 font-bold text-sm">
                <Ban className="h-5 w-5" />
                Cancel E-Invoice ({cancelDoc.docNo})
              </div>
              <button
                type="button"
                onClick={() => setCancelDoc(null)}
                className="btn btn-ghost btn-icon h-7 w-7"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-rose-50 border border-rose-200 rounded-lg p-2.5 text-rose-800 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>SIMULATED IRN — NOT A VALID E-INVOICE FOR STATUTORY COMPLIANCE</span>
              </div>
              <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-amber-900">
                <span className="font-semibold block mb-0.5">Statutory 24-Hour Cancellation:</span>
                An IRN can only be cancelled within 24 hours of generation on the NIC portal. After 24 hours, you must issue a GST credit note.
              </div>

              <div>
                <label className="label">Cancellation Reason</label>
                <select
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value as "1" | "2" | "3" | "4")}
                  className="input text-xs"
                >
                  <option value="1">1 - Duplicate Invoice</option>
                  <option value="2">2 - Data Entry Mistake</option>
                  <option value="3">3 - Order Cancelled by Buyer</option>
                  <option value="4">4 - Others</option>
                </select>
              </div>

              <div>
                <label className="label">Remarks</label>
                <input
                  type="text"
                  value={cancelRemarks}
                  onChange={(e) => setCancelRemarks(e.target.value)}
                  placeholder="e.g. Corrected batch details entered"
                  className="input text-xs"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-ink-150 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setCancelDoc(null)}
                className="btn btn-secondary text-xs"
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                disabled={cancelling}
                className="btn btn-primary bg-red-600 hover:bg-red-700 text-white text-xs"
              >
                {cancelling ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                Confirm Cancellation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Generate E-Way Bill */}
      {ewayDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="card max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-ink-150">
              <div className="flex items-center gap-2 text-ink-900 font-bold text-sm">
                <Truck className="h-5 w-5 text-brand-600" />
                Generate E-Way Bill ({ewayDoc.docNo})
              </div>
              <button
                type="button"
                onClick={() => setEwayDoc(null)}
                className="btn btn-ghost btn-icon h-7 w-7"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-rose-50 border border-rose-200 rounded-lg p-2.5 text-rose-800 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>SIMULATED IRN — NOT A VALID E-INVOICE FOR STATUTORY COMPLIANCE</span>
              </div>
              <p className="text-ink-500">
                Generate Part-A and Part-B consignment movement credentials for invoice value of{" "}
                <span className="font-semibold text-ink-900">{formatINR(ewayDoc.total)}</span>.
              </p>

              <div>
                <label className="label">Approximate Road Distance (in Kilometers) *</label>
                <input
                  type="number"
                  min="1"
                  value={distanceKm}
                  onChange={(e) => setDistanceKm(Number(e.target.value))}
                  className="input text-xs"
                  required
                />
                <span className="text-[11px] text-ink-400 mt-1 block">
                  Validity: 1 day per 200 km (calculated as {Math.max(1, Math.ceil(distanceKm / 200))} day(s)).
                </span>
              </div>

              <div>
                <label className="label">Vehicle Registration Number</label>
                <input
                  type="text"
                  value={vehicleNo}
                  onChange={(e) => setVehicleNo(e.target.value.toUpperCase())}
                  placeholder="e.g. MH04AB1234"
                  className="input text-xs font-mono"
                />
              </div>

              <div>
                <label className="label">Transporter ID / GSTIN (Optional)</label>
                <input
                  type="text"
                  value={transporterId}
                  onChange={(e) => setTransporterId(e.target.value.toUpperCase())}
                  placeholder="e.g. 27TRANSP1234F1Z8"
                  className="input text-xs font-mono"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-ink-150 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEwayDoc(null)}
                className="btn btn-secondary text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmEwayBill}
                disabled={generatingEwb || distanceKm < 1}
                className="btn btn-primary text-xs"
              >
                {generatingEwb ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                Generate E-Way Bill
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
