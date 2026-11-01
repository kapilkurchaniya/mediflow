"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2, Store, Edit3, Power, AlertTriangle } from "lucide-react";
import { deactivateStoreAction, reactivateStoreAction } from "@/app/actions/stores";
import type { StoreKind, StoreSettings } from "@/server/domain/stores/types";

export interface StoreRow {
  id: string;
  name: string;
  code: string;
  kind: StoreKind;
  address: string | null;
  city: string | null;
  stateCode: string;
  gstin: string | null;
  drugLicenseNo: string | null;
  drugLicenseExpiry: string | null;
  invoicePrefix: string;
  isActive: boolean;
  settings: StoreSettings;
}

export function StoreTable({ stores }: { stores: StoreRow[] }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [modalStore, setModalStore] = useState<StoreRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleToggleActive = async (store: StoreRow) => {
    setError(null);
    setBusyId(store.id);

    try {
      if (store.isActive) {
        const res = await deactivateStoreAction({ storeId: store.id });
        if (res?.serverError) throw new Error(res.serverError);
      } else {
        const res = await reactivateStoreAction({ storeId: store.id });
        if (res?.serverError) throw new Error(res.serverError);
      }
      setModalStore(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to change store status.");
    } finally {
      setBusyId(null);
    }
  };

  if (stores.length === 0) {
    return (
      <div className="card p-12 text-center text-ink-500">
        <Store className="h-10 w-10 mx-auto text-ink-300 mb-3" />
        <h3 className="text-base font-semibold text-ink-900">No stores found</h3>
        <p className="text-sm mt-1">Get started by creating your first retail branch or warehouse.</p>
        <Link href="/dashboard/settings/stores/new" className="btn btn-primary mt-4 inline-flex">
          Add New Store
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-ink-50/70 border-b border-ink-150 text-[11.5px] font-semibold uppercase tracking-wider text-ink-500">
              <tr>
                <th className="py-3 px-4">Store / Facility</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Compliance / GST</th>
                <th className="py-3 px-4">POS Settings</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {stores.map((s) => (
                <tr key={s.id} className="hover:bg-ink-50/40 transition-colors">
                  <td className="py-3.5 px-4">
                    <div className="font-semibold text-ink-900">{s.name}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="font-mono text-xs font-semibold px-1.5 py-0.5 rounded bg-ink-100 text-ink-700">
                        {s.code}
                      </span>
                      {s.city && <span className="text-xs text-ink-500">{s.city} (State: {s.stateCode})</span>}
                    </div>
                  </td>

                  <td className="py-3.5 px-4">
                    {s.kind === "retail" ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <Store className="h-3.5 w-3.5" /> Retail Branch
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200">
                        <Building2 className="h-3.5 w-3.5" /> Warehouse
                      </span>
                    )}
                  </td>

                  <td className="py-3.5 px-4">
                    <div className="text-xs">
                      {s.gstin ? (
                        <div className="font-mono text-ink-900 font-medium">GSTIN: {s.gstin}</div>
                      ) : (
                        <div className="text-ink-400">No GSTIN recorded</div>
                      )}
                      {s.drugLicenseNo && (
                        <div className="font-mono text-ink-500 mt-0.5">DL: {s.drugLicenseNo}</div>
                      )}
                    </div>
                  </td>

                  <td className="py-3.5 px-4">
                    <div className="text-xs space-y-0.5 text-ink-600">
                      <div>
                        Prefix: <span className="font-mono font-semibold text-ink-900">{s.invoicePrefix}</span>
                      </div>
                      <div>
                        Shift: {s.settings?.requireShift ? (
                          <span className="text-brand-600 font-medium">Enforced</span>
                        ) : (
                          <span className="text-ink-400">Optional</span>
                        )}
                      </div>
                      {s.settings?.maxDiscountBp !== undefined && (
                        <div>Max Disc: {(s.settings.maxDiscountBp / 100).toFixed(1)}%</div>
                      )}
                    </div>
                  </td>

                  <td className="py-3.5 px-4">
                    {s.isActive ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800">
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                        Inactive
                      </span>
                    )}
                  </td>

                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/dashboard/settings/stores/${s.id}`}
                        className="btn btn-secondary btn-sm p-1.5 text-xs inline-flex items-center gap-1"
                      >
                        <Edit3 className="h-3.5 w-3.5" /> Edit
                      </Link>

                      <button
                        type="button"
                        onClick={() => setModalStore(s)}
                        disabled={busyId === s.id}
                        className={`btn btn-sm p-1.5 text-xs inline-flex items-center gap-1 ${
                          s.isActive ? "btn-secondary text-red-600 hover:text-red-700" : "btn-secondary text-emerald-600 hover:text-emerald-700"
                        }`}
                      >
                        <Power className="h-3.5 w-3.5" />
                        {s.isActive ? "Deactivate" : "Reactivate"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation Modal */}
      {modalStore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/40 backdrop-blur-sm">
          <div className="card max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-lg font-semibold text-ink-900">
              {modalStore.isActive ? "Deactivate Store Location" : "Reactivate Store Location"}
            </h3>
            <p className="text-sm text-ink-600 leading-relaxed">
              {modalStore.isActive ? (
                <>
                  Are you sure you want to deactivate <strong>{modalStore.name}</strong>?
                  Staff will no longer be able to log in or process sales in this location.
                  Deactivation requires all open shifts and held bills to be reconciled first.
                </>
              ) : (
                <>
                  Reactivate <strong>{modalStore.name}</strong> to resume normal counter and inventory operations?
                </>
              )}
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setModalStore(null)}
                className="btn btn-secondary"
                disabled={busyId !== null}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleToggleActive(modalStore)}
                disabled={busyId !== null}
                className={`btn ${modalStore.isActive ? "btn-danger" : "btn-primary"}`}
              >
                {busyId !== null ? "Processing..." : modalStore.isActive ? "Confirm Deactivation" : "Confirm Reactivation"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
