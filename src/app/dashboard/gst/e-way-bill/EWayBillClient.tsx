"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Truck,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Search,
  Copy,
  Check,
  Printer,
  Edit3,
  Ban,
  ArrowRight,
  ShieldAlert,
  Loader2,
  X,
  ExternalLink,
} from "lucide-react";
import { formatINR } from "@/lib/money";
import {
  updateEWayBillVehicleAction,
  cancelEWayBillAction,
} from "@/app/actions/gst";

export interface EWayBillItem {
  id: string;
  docNo: string;
  docType: string;
  docDate: string;
  partyName: string | null;
  partyGstin: string | null;
  total: number | null;
  taxableAmount: number | null;
  eWayBillNo: string | null;
  eWayBillDate: Date | string | null;
  eWayBillValidTill: Date | string | null;
  vehicleNo: string | null;
  transporterId: string | null;
  transporterName: string | null;
  transportMode: string | null;
  distanceKm: number | null;
  status: string;
  cancelledReason: string | null;
  refType: string | null;
  refId: string | null;
  storeId: string;
  storeName: string | null;
}

export function EWayBillClient({
  initialData,
  currentFilter = "all",
}: {
  initialData: { items: EWayBillItem[]; total: number };
  currentFilter?: "all" | "active" | "expiring_soon" | "expired" | "cancelled";
}) {
  const [filter, setFilter] = useState<"all" | "active" | "expiring_soon" | "expired" | "cancelled">(currentFilter);
  const [search, setSearch] = useState("");
  const [copiedEwb, setCopiedEwb] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Modals state
  const [updateDoc, setUpdateDoc] = useState<EWayBillItem | null>(null);
  const [newVehicleNo, setNewVehicleNo] = useState("");
  const [fromPlace, setFromPlace] = useState("");
  const [fromState, setFromState] = useState("27");
  const [reasonCode, setReasonCode] = useState<"1" | "2" | "3" | "4">("2");
  const [reasonRemark, setReasonRemark] = useState("");
  const [updating, setUpdating] = useState(false);

  const [cancelDoc, setCancelDoc] = useState<EWayBillItem | null>(null);
  const [cancelReasonCode, setCancelReasonCode] = useState<"1" | "2" | "3" | "4">("2");
  const [cancelRemarks, setCancelRemarks] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const [now] = useState(() => Date.now());

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopiedEwb(text);
    setTimeout(() => setCopiedEwb(null), 2000);
  }

  function getValidityStatus(item: EWayBillItem): {
    badge: string;
    label: string;
    isUrgent: boolean;
    hoursLeft: number;
    canCancel: boolean;
  } {
    if (item.status === "cancelled") {
      return { badge: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300", label: "Cancelled", isUrgent: false, hoursLeft: 0, canCancel: false };
    }

    const createdTime = item.eWayBillDate ? new Date(item.eWayBillDate).getTime() : now;
    const canCancel = (now - createdTime) <= 24 * 60 * 60 * 1000;

    if (!item.eWayBillValidTill) {
      return { badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400", label: "Active", isUrgent: false, hoursLeft: 48, canCancel };
    }

    const validTill = new Date(item.eWayBillValidTill).getTime();
    const msLeft = validTill - now;
    const hoursLeft = Math.floor(msLeft / (1000 * 60 * 60));

    if (msLeft <= 0) {
      return { badge: "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-400", label: "Expired", isUrgent: true, hoursLeft: 0, canCancel: false };
    }
    if (hoursLeft < 12) {
      return { badge: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-400 animate-pulse", label: `${hoursLeft}h left (Expiring)`, isUrgent: true, hoursLeft, canCancel };
    }
    const daysLeft = Math.ceil(hoursLeft / 24);
    return {
      badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400",
      label: daysLeft > 1 ? `${daysLeft} days active` : `${hoursLeft}h active`,
      isUrgent: false,
      hoursLeft,
      canCancel,
    };
  }

  // Filtered list
  const filtered = initialData.items.filter((item) => {
    const vStat = getValidityStatus(item);

    if (filter === "active") {
      if (item.status === "cancelled" || vStat.hoursLeft <= 0) return false;
    } else if (filter === "expiring_soon") {
      if (item.status === "cancelled" || vStat.hoursLeft <= 0 || vStat.hoursLeft >= 12) return false;
    } else if (filter === "expired") {
      if (item.status === "cancelled" || vStat.hoursLeft > 0) return false;
    } else if (filter === "cancelled") {
      if (item.status !== "cancelled") return false;
    }

    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return (
      (item.eWayBillNo && item.eWayBillNo.toLowerCase().includes(term)) ||
      (item.docNo && item.docNo.toLowerCase().includes(term)) ||
      (item.partyName && item.partyName.toLowerCase().includes(term)) ||
      (item.partyGstin && item.partyGstin.toLowerCase().includes(term)) ||
      (item.vehicleNo && item.vehicleNo.toLowerCase().includes(term))
    );
  });

  // Summary Metrics
  const activeCount = initialData.items.filter((i) => i.status === "active" && getValidityStatus(i).hoursLeft > 0).length;
  const expiringCount = initialData.items.filter((i) => i.status === "active" && getValidityStatus(i).hoursLeft > 0 && getValidityStatus(i).hoursLeft < 12).length;
  const activeValue = initialData.items
    .filter((i) => i.status === "active" && getValidityStatus(i).hoursLeft > 0)
    .reduce((sum, i) => sum + (i.total || 0), 0);

  // Vehicle regex check
  const normalizedVehicle = newVehicleNo.replace(/[\s-]/g, "").toUpperCase();
  const isVehicleValid = /^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$/.test(normalizedVehicle);

  async function handleUpdateVehicle() {
    if (!updateDoc) return;
    if (!isVehicleValid) {
      alert("Please enter a valid Indian vehicle registration number (e.g. MH12AB1234)");
      return;
    }
    setUpdating(true);
    try {
      const res = await updateEWayBillVehicleAction(updateDoc.id, {
        vehicleNo: normalizedVehicle,
        fromPlace: fromPlace.trim() || "Headquarters",
        fromState: fromState.trim() || "27",
        reasonCode,
        reasonRemark: reasonRemark.trim() || undefined,
      });

      if ("error" in res && res.error) {
        alert("Failed to update vehicle: " + res.error);
      } else {
        setUpdateDoc(null);
        window.location.reload();
      }
    } catch (err: unknown) {
      alert("Error: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setUpdating(false);
    }
  }

  async function handleCancelEwb() {
    if (!cancelDoc) return;
    setCancelling(true);
    try {
      const res = await cancelEWayBillAction(
        cancelDoc.id,
        cancelReasonCode,
        cancelRemarks.trim() || "Order cancelled by consignor"
      );

      if ("error" in res && res.error) {
        alert("Failed to cancel E-Way Bill: " + res.error);
      } else {
        setCancelDoc(null);
        window.location.reload();
      }
    } catch (err: unknown) {
      alert("Error: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Statutory Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Total Consignments</span>
            <div className="rounded-lg bg-blue-50 dark:bg-blue-950/50 p-2 text-blue-600 dark:text-blue-400">
              <Truck className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">{initialData.total}</div>
          <p className="mt-1 text-xs text-slate-500">All statutory E-Way Bills on record</p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Active in Transit</span>
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/50 p-2 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">{activeCount}</div>
          <p className="mt-1 text-xs text-slate-500">Valid Part-B transit on Indian roads</p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Expiring &lt; 12 Hours</span>
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/50 p-2 text-amber-600 dark:text-amber-400">
              <Clock className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-600 dark:text-amber-400">{expiringCount}</div>
          <p className="mt-1 text-xs text-slate-500">Require transshipment or delivery update</p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Active Transit Value</span>
            <div className="rounded-lg bg-violet-50 dark:bg-violet-950/50 p-2 text-violet-600 dark:text-violet-400">
              <span className="text-sm font-bold">₹</span>
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">{formatINR(activeValue)}</div>
          <p className="mt-1 text-xs text-slate-500">Aggregate consignment valuation</p>
        </div>
      </div>

      {/* Filter Tabs & Search Controls */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {(
              [
                { key: "all", label: "All Bills" },
                { key: "active", label: "Active" },
                { key: "expiring_soon", label: "Expiring Soon" },
                { key: "expired", label: "Expired" },
                { key: "cancelled", label: "Cancelled" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  filter === tab.key
                    ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative min-w-[240px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search E-Way No, Doc, Party, Vehicle..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 py-1.5 pl-9 pr-3 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* E-Way Bill Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400">
              <tr>
                <th className="py-3 px-3 font-semibold">E-Way Bill No.</th>
                <th className="py-3 px-3 font-semibold">Doc Details</th>
                <th className="py-3 px-3 font-semibold">Consignee</th>
                <th className="py-3 px-3 font-semibold">Vehicle & Mode</th>
                <th className="py-3 px-3 font-semibold text-right">Value (₹)</th>
                <th className="py-3 px-3 font-semibold text-center">Validity Status</th>
                <th className="py-3 px-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    <Truck className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-700 mb-2" />
                    <p className="font-medium text-slate-700 dark:text-slate-300">No E-Way Bills found</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Generate an E-Way Bill from B2B sales invoices or stock transfers over ₹50,000.
                    </p>
                    <div className="mt-3 flex items-center justify-center gap-2">
                      <Link
                        href="/dashboard/gst/e-invoice"
                        className="inline-flex items-center gap-1 rounded-md bg-blue-50 dark:bg-blue-950/60 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-100"
                      >
                        Go to E-Invoice Hub <ArrowRight className="h-3 w-3" />
                      </Link>
                      <Link
                        href="/dashboard/inventory/transfers"
                        className="inline-flex items-center gap-1 rounded-md bg-slate-100 dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200"
                      >
                        Inter-Store Transfers <ArrowRight className="h-3 w-3" />
                      </Link>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((item) => {
                  const vStat = getValidityStatus(item);
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 px-3 font-mono">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-slate-900 dark:text-slate-100">{item.eWayBillNo}</span>
                          <button
                            onClick={() => copyToClipboard(item.eWayBillNo || "")}
                            title="Copy E-Way Bill No."
                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                          >
                            {copiedEwb === item.eWayBillNo ? (
                              <Check className="h-3.5 w-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {item.eWayBillDate ? new Date(item.eWayBillDate).toLocaleDateString("en-IN") : "-"}
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <div className="font-medium text-slate-800 dark:text-slate-200">{item.docNo}</div>
                        <div className="text-[11px] text-slate-500 capitalize">
                          {item.docType.replace("_", " ")} {item.refType ? `(${item.refType})` : ""}
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <div className="font-medium text-slate-800 dark:text-slate-200 line-clamp-1 max-w-[180px]">
                          {item.partyName || "Direct Delivery"}
                        </div>
                        <div className="font-mono text-[11px] text-slate-500">{item.partyGstin || "URP / Consumer"}</div>
                      </td>

                      <td className="py-3 px-3">
                        <div className="font-mono font-medium text-slate-900 dark:text-slate-100">
                          {item.vehicleNo || <span className="text-amber-500 font-sans italic">Part-A Only</span>}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {item.transportMode === "1" ? "Road" : item.transportMode === "2" ? "Rail" : item.transportMode === "3" ? "Air" : "Road"}
                          {item.distanceKm ? ` · ${item.distanceKm} km` : ""}
                        </div>
                      </td>

                      <td className="py-3 px-3 text-right font-mono font-medium text-slate-900 dark:text-slate-100">
                        {formatINR(item.total || 0)}
                      </td>

                      <td className="py-3 px-3 text-center">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${vStat.badge}`}>
                          {vStat.label}
                        </span>
                      </td>

                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            href={`/dashboard/gst/e-way-bill/${item.id}/print`}
                            target="_blank"
                            title="Print Official E-Way Bill Slip (A4 / Thermal)"
                            className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                          >
                            <Printer className="h-4 w-4" />
                          </Link>

                          {item.status === "active" && (
                            <button
                              onClick={() => {
                                setUpdateDoc(item);
                                setNewVehicleNo(item.vehicleNo || "");
                              }}
                              title="Update Part-B Vehicle (Breakdown / Transshipment)"
                              className="rounded p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50"
                            >
                              <Edit3 className="h-4 w-4" />
                            </button>
                          )}

                          {vStat.canCancel && (
                            <button
                              onClick={() => setCancelDoc(item)}
                              title="Cancel E-Way Bill (Within statutory 24h)"
                              className="rounded p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50"
                            >
                              <Ban className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Part-B Update Vehicle Modal */}
      {updateDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-blue-50 dark:bg-blue-950 p-2 text-blue-600 dark:text-blue-400">
                  <Truck className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100">Update Part-B Vehicle</h3>
                  <p className="text-xs text-slate-500">E-Way Bill: {updateDoc.eWayBillNo}</p>
                </div>
              </div>
              <button
                onClick={() => setUpdateDoc(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  New Vehicle Registration Number *
                </label>
                <input
                  type="text"
                  placeholder="e.g. MH12AB1234 or DL01A9999"
                  value={newVehicleNo}
                  onChange={(e) => setNewVehicleNo(e.target.value.toUpperCase())}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2 font-mono text-sm uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {newVehicleNo.length > 0 && !isVehicleValid && (
                  <p className="mt-1 text-[11px] text-rose-500 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Standard Indian format required (e.g. MH12AB1234)
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    From Place / City *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Pune"
                    value={fromPlace}
                    onChange={(e) => setFromPlace(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    State Code (GST) *
                  </label>
                  <input
                    type="text"
                    maxLength={2}
                    placeholder="e.g. 27"
                    value={fromState}
                    onChange={(e) => setFromState(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Reason for Updation *
                </label>
                <select
                  value={reasonCode}
                  onChange={(e) => setReasonCode(e.target.value as "1" | "2" | "3" | "4")}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="2">2 - Due to Transshipment (Hub transfer)</option>
                  <option value="1">1 - Due to Vehicle Breakdown</option>
                  <option value="4">4 - First Time (Vehicle assignment)</option>
                  <option value="3">3 - Others</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Remarks / Notes
                </label>
                <input
                  type="text"
                  placeholder="e.g. Transferred at Bhiwandi logistics hub"
                  value={reasonRemark}
                  onChange={(e) => setReasonRemark(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setUpdateDoc(null)}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!isVehicleValid || updating}
                onClick={handleUpdateVehicle}
                className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
              >
                {updating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Confirm Vehicle Update
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Statutory 24-Hour Cancel Modal */}
      {cancelDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-rose-50 dark:bg-rose-950 p-2 text-rose-600 dark:text-rose-400">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100">Cancel E-Way Bill</h3>
                  <p className="text-xs text-slate-500">CGST Rule 138(9) Statutory Window</p>
                </div>
              </div>
              <button
                onClick={() => setCancelDoc(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/40 p-3 text-xs text-amber-800 dark:text-amber-300 space-y-1">
              <p className="font-medium">⚠️ Statutory Rule Notice:</p>
              <p>
                E-Way Bills can only be cancelled within <strong>24 hours of generation</strong>, provided the
                consignment has not been verified in transit by tax authorities.
              </p>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Cancellation Reason Code *
                </label>
                <select
                  value={cancelReasonCode}
                  onChange={(e) => setCancelReasonCode(e.target.value as "1" | "2" | "3" | "4")}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2 focus:outline-none focus:ring-2 focus:ring-rose-500"
                >
                  <option value="2">2 - Order / Consignment Cancelled</option>
                  <option value="1">1 - Duplicate E-Way Bill Generated</option>
                  <option value="3">3 - Data Entry Mistake in Part-A</option>
                  <option value="4">4 - Others</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Cancellation Remarks *
                </label>
                <textarea
                  rows={2}
                  placeholder="Explain why this transit document is being cancelled..."
                  value={cancelRemarks}
                  onChange={(e) => setCancelRemarks(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setCancelDoc(null)}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                Close
              </button>
              <button
                type="button"
                disabled={cancelling}
                onClick={handleCancelEwb}
                className="rounded-lg bg-rose-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
              >
                {cancelling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
                Confirm Cancellation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

