"use client";

import React, { useState } from "react";
import { ArrowRight, CheckCircle2, AlertCircle, Building2 } from "lucide-react";
import { GST_STATE_CODES } from "@/lib/regulatory";
import { deriveStateFromGstin, type BusinessDetailsInput } from "@/server/domain/onboarding/types";

interface Step1BusinessProps {
  initialData: {
    name: string;
    legalName: string | null;
    gstin: string | null;
    stateCode: string | null;
    taxScheme: "regular" | "composition";
  };
  onSuccess: (data: { stateCode: string }) => void;
  onSave: (input: BusinessDetailsInput) => Promise<{ success: boolean; error?: string }>;
}

export function Step1Business({ initialData, onSuccess, onSave }: Step1BusinessProps) {
  const [legalName, setLegalName] = useState(initialData.legalName || initialData.name || "");
  const [gstin, setGstin] = useState(initialData.gstin || "");
  const [stateCode, setStateCode] = useState(initialData.stateCode || "27");
  const [stateName, setStateName] = useState(
    initialData.stateCode ? GST_STATE_CODES[initialData.stateCode] || "" : "Maharashtra",
  );
  const [pan, setPan] = useState("");
  const [taxScheme, setTaxScheme] = useState<"regular" | "composition">(initialData.taxScheme || "regular");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGstinChange = (val: string) => {
    const upper = val.toUpperCase();
    setGstin(upper);
    if (upper.trim().length >= 2) {
      const derived = deriveStateFromGstin(upper);
      if (derived.stateCode && GST_STATE_CODES[derived.stateCode]) {
        setStateCode(derived.stateCode);
        setStateName(derived.stateName);
      }
      if (derived.pan) {
        setPan(derived.pan);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!legalName.trim()) {
      setError("Please enter your legal business or trade name.");
      return;
    }

    if (!stateCode || !GST_STATE_CODES[stateCode]) {
      setError("Please select a valid Indian State / UT.");
      return;
    }

    setLoading(true);
    try {
      const res = await onSave({
        legalName: legalName.trim(),
        gstin: gstin.trim().toUpperCase() || undefined,
        stateCode,
        pan: pan || undefined,
        taxScheme,
      });

      if (!res.success) {
        setError(res.error || "Failed to save business details.");
        return;
      }

      onSuccess({ stateCode });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 sm:p-8">
      <div className="flex items-center gap-3 pb-6 border-b border-slate-100 dark:border-slate-800">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
          <Building2 className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Business & Tax Identity</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Configure statutory business details and derive your 2-digit GST state code.
          </p>
        </div>
      </div>

      {error && (
        <div className="mt-6 p-4 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 text-rose-700 dark:text-rose-300 flex items-center gap-3 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-6">
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
            Legal Business / Pharmacy Name <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            required
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
            placeholder="e.g. Sanjeevani Medicos Pvt Ltd"
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-medium"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
              GSTIN (15 Digits)
            </label>
            <input
              type="text"
              maxLength={15}
              value={gstin}
              onChange={(e) => handleGstinChange(e.target.value)}
              placeholder="e.g. 27AABCU9603R1ZM"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-mono uppercase"
            />
            {gstin.length >= 2 && stateName && (
              <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                State Code {stateCode}: {stateName}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
              Operating State / UT <span className="text-rose-500">*</span>
            </label>
            <select
              value={stateCode}
              onChange={(e) => {
                setStateCode(e.target.value);
                setStateName(GST_STATE_CODES[e.target.value] || "");
              }}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-medium"
            >
              {Object.entries(GST_STATE_CODES).map(([code, name]) => (
                <option key={code} value={code}>
                  {code} — {name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
              Permanent Account Number (PAN)
            </label>
            <input
              type="text"
              maxLength={10}
              value={pan}
              onChange={(e) => setPan(e.target.value.toUpperCase())}
              placeholder="e.g. AABCU9603R"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-mono uppercase"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
              GST Registration Scheme
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setTaxScheme("regular")}
                className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all ${
                  taxScheme === "regular"
                    ? "border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 ring-2 ring-indigo-200 dark:ring-indigo-900"
                    : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-400"
                }`}
              >
                Regular Dealer
              </button>
              <button
                type="button"
                onClick={() => setTaxScheme("composition")}
                className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all ${
                  taxScheme === "composition"
                    ? "border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 ring-2 ring-indigo-200 dark:ring-indigo-900"
                    : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-400"
                }`}
              >
                Composition Scheme
              </button>
            </div>
          </div>
        </div>

        <div className="pt-6 border-t border-slate-100 dark:border-slate-800 flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            <span>{loading ? "Saving..." : "Save & Proceed to Store Profile"}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
}

