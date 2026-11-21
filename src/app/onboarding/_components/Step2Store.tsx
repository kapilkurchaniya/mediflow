"use client";

import React, { useState } from "react";
import { ArrowRight, ArrowLeft, AlertCircle, Store, ShieldCheck } from "lucide-react";
import { validateInvoicePrefix, type StoreProfileInput } from "@/server/domain/onboarding/types";

interface Step2StoreProps {
  initialData: {
    id: string;
    name: string;
    kind: "retail" | "warehouse";
    invoicePrefix: string;
    form20No: string | null;
    form21No: string | null;
    form20bNo: string | null;
    form21bNo: string | null;
    fssaiNo: string | null;
  } | null;
  onBack: () => void;
  onSuccess: () => void;
  onSave: (input: StoreProfileInput) => Promise<{ success: boolean; error?: string }>;
}

export function Step2Store({ initialData, onBack, onSuccess, onSave }: Step2StoreProps) {
  const [name, setName] = useState(initialData?.name || "Main Counter");
  const [kind, setKind] = useState<"retail" | "warehouse">(initialData?.kind || "retail");
  const [invoicePrefix, setInvoicePrefix] = useState(initialData?.invoicePrefix || "INV");
  const [form20No, setForm20No] = useState(initialData?.form20No || "");
  const [form20Expiry, setForm20Expiry] = useState("");
  const [form21No, setForm21No] = useState(initialData?.form21No || "");
  const [form21Expiry, setForm21Expiry] = useState("");
  const [form20bNo, setForm20bNo] = useState(initialData?.form20bNo || "");
  const [form21bNo, setForm21bNo] = useState(initialData?.form21bNo || "");
  const [fssaiNo, setFssaiNo] = useState(initialData?.fssaiNo || "");
  const [fssaiExpiry, setFssaiExpiry] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prefixValidation = validateInvoicePrefix(invoicePrefix);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Please specify the store or branch name.");
      return;
    }

    if (!prefixValidation.valid) {
      setError(prefixValidation.error || "Invalid invoice prefix.");
      return;
    }

    setLoading(true);
    try {
      const res = await onSave({
        storeId: initialData?.id,
        name: name.trim(),
        kind,
        invoicePrefix: invoicePrefix.trim().toUpperCase(),
        form20No: form20No.trim() || undefined,
        form20Expiry: form20Expiry || undefined,
        form21No: form21No.trim() || undefined,
        form21Expiry: form21Expiry || undefined,
        form20bNo: form20bNo.trim() || undefined,
        form21bNo: form21bNo.trim() || undefined,
        fssaiNo: fssaiNo.trim() || undefined,
        fssaiExpiry: fssaiExpiry || undefined,
      });

      if (!res.success) {
        setError(res.error || "Failed to save store profile.");
        return;
      }

      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-ink-200 shadow-sm p-6 sm:p-8">
      <div className="flex items-center gap-3 pb-6 border-b border-ink-100">
        <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center font-bold">
          <Store className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-ink-900">Store Profile & Statutory Licences</h2>
          <p className="text-sm text-ink-500">
            Drugs & Cosmetics Rules 1945 Form 20/21, FSSAI, and GST Rule 46(b) invoice numbering.
          </p>
        </div>
      </div>

      {error && (
        <div className="mt-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 flex items-center gap-3 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
              Primary Store / Branch Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Main Street Counter"
              className="w-full px-4 py-2.5 rounded-xl border border-ink-200 bg-white text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
              Invoice Prefix (GST Rule 46b) <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              maxLength={8}
              value={invoicePrefix}
              onChange={(e) => setInvoicePrefix(e.target.value.toUpperCase())}
              placeholder="e.g. INV or STR1"
              className="w-full px-4 py-2.5 rounded-xl border border-ink-200 bg-white text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm font-mono uppercase"
            />
            <p className="mt-1 text-xs text-ink-500">
              Sample invoice number: <span className="font-mono font-medium">{invoicePrefix || "INV"}-0001</span>
            </p>
          </div>
        </div>

        {/* Drug Licenses Section */}
        <div className="pt-4 border-t border-ink-100">
          <h3 className="text-sm font-bold text-ink-900 flex items-center gap-2 mb-4">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            Drugs & Cosmetics Act Licences (Retail Form 20 & 21)
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
                Form 20 Licence Number
              </label>
              <input
                type="text"
                value={form20No}
                onChange={(e) => setForm20No(e.target.value)}
                placeholder="e.g. MH-TZ3-123456"
                className="w-full px-4 py-2 rounded-xl border border-ink-200 bg-white text-ink-900 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
                Form 20 Expiry Date
              </label>
              <input
                type="date"
                value={form20Expiry}
                onChange={(e) => setForm20Expiry(e.target.value)}
                className="w-full px-4 py-2 rounded-xl border border-ink-200 bg-white text-ink-900 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
                Form 21 Licence Number
              </label>
              <input
                type="text"
                value={form21No}
                onChange={(e) => setForm21No(e.target.value)}
                placeholder="e.g. MH-TZ3-123457"
                className="w-full px-4 py-2 rounded-xl border border-ink-200 bg-white text-ink-900 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
                Form 21 Expiry Date
              </label>
              <input
                type="date"
                value={form21Expiry}
                onChange={(e) => setForm21Expiry(e.target.value)}
                className="w-full px-4 py-2 rounded-xl border border-ink-200 bg-white text-ink-900 text-sm"
              />
            </div>
          </div>
        </div>

        {/* FSSAI Registration */}
        <div className="pt-4 border-t border-ink-100">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
                FSSAI License (14 Digits)
              </label>
              <input
                type="text"
                maxLength={14}
                value={fssaiNo}
                onChange={(e) => setFssaiNo(e.target.value)}
                placeholder="e.g. 11521001000123"
                className="w-full px-4 py-2 rounded-xl border border-ink-200 bg-white text-ink-900 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
                FSSAI Expiry Date
              </label>
              <input
                type="date"
                value={fssaiExpiry}
                onChange={(e) => setFssaiExpiry(e.target.value)}
                className="w-full px-4 py-2 rounded-xl border border-ink-200 bg-white text-ink-900 text-sm"
              />
            </div>
          </div>
        </div>

        <div className="pt-6 border-t border-ink-100 flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-ink-200 hover:bg-ink-50 text-ink-700 font-semibold text-sm transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>

          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
          >
            <span>{loading ? "Saving..." : "Save & Proceed to Inventory"}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
}

