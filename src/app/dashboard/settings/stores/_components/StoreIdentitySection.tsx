"use client";

import { Building2, Store } from "lucide-react";
import type { StoreKind } from "@/server/domain/stores/types";

interface Props {
  name: string;
  setName: (v: string) => void;
  code: string;
  setCode: (v: string) => void;
  kind: StoreKind;
  setKind: (v: StoreKind) => void;
}

export function StoreIdentitySection({ name, setName, code, setCode, kind, setKind }: Props) {
  return (
    <div className="card p-6 space-y-5">
      <h2 className="text-base font-semibold text-ink-900 border-b border-ink-100 pb-3">
        Location Identity & Type
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <span className="text-xs font-semibold uppercase text-ink-500 tracking-wider">Location Type</span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
            <button
              type="button"
              onClick={() => setKind("retail")}
              className={`p-3.5 rounded-lg border text-left flex items-start gap-3 transition-colors ${
                kind === "retail" ? "border-brand-500 bg-brand-50/40 ring-1 ring-brand-500" : "border-ink-200 bg-white"
              }`}
            >
              <Store className={`h-5 w-5 mt-0.5 ${kind === "retail" ? "text-brand-600" : "text-ink-400"}`} />
              <div>
                <div className="font-semibold text-sm text-ink-900">Retail Pharmacy Branch</div>
                <div className="text-xs text-ink-500 mt-0.5">Enables counter billing, POS shortcuts, and prescription dispensing.</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setKind("warehouse")}
              className={`p-3.5 rounded-lg border text-left flex items-start gap-3 transition-colors ${
                kind === "warehouse" ? "border-purple-500 bg-purple-50/40 ring-1 ring-purple-500" : "border-ink-200 bg-white"
              }`}
            >
              <Building2 className={`h-5 w-5 mt-0.5 ${kind === "warehouse" ? "text-purple-600" : "text-ink-400"}`} />
              <div>
                <div className="font-semibold text-sm text-ink-900">Central Warehouse / Godown</div>
                <div className="text-xs text-ink-500 mt-0.5">Bulk storage and replenishment hub. Direct POS retail billing is strictly blocked.</div>
              </div>
            </button>
          </div>
        </div>

        <label className="block">
          <span className="text-xs font-medium text-ink-700">Store / Branch Name *</span>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Andheri West Branch"
            className="mt-1 block w-full input"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-ink-700">Store Code (Max 4 chars) *</span>
          <input
            type="text"
            required
            maxLength={4}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="e.g. MUM1"
            className="mt-1 block w-full input font-mono uppercase"
          />
        </label>
      </div>
    </div>
  );
}
