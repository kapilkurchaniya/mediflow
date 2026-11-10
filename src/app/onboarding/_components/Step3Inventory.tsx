"use client";

import React, { useState } from "react";
import { ArrowRight, ArrowLeft, Pill, FileSpreadsheet, Sparkles, CheckCircle2, AlertCircle } from "lucide-react";
import { ESSENTIAL_STARTER_MEDICINES } from "@/server/domain/onboarding/starter-catalog";

interface Step3InventoryProps {
  currentCount: number;
  onBack: () => void;
  onSuccess: () => void;
  onBootstrap: () => Promise<{ success: boolean; insertedCount: number; error?: string }>;
}

export function Step3Inventory({ currentCount, onBack, onSuccess, onBootstrap }: Step3InventoryProps) {
  const [selectedOption, setSelectedOption] = useState<"seed" | "import" | "blank">("seed");
  const [loading, setLoading] = useState(false);
  const [seededCount, setSeededCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleProceed = async () => {
    setError(null);
    if (selectedOption === "seed" && seededCount === null) {
      setLoading(true);
      try {
        const res = await onBootstrap();
        if (!res.success) {
          setError(res.error || "Failed to seed medicines catalogue.");
          return;
        }
        setSeededCount(res.insertedCount);
        setTimeout(() => onSuccess(), 800);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Error bootstrapping inventory.");
      } finally {
        setLoading(false);
      }
    } else {
      onSuccess();
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 sm:p-8">
      <div className="flex items-center gap-3 pb-6 border-b border-slate-100 dark:border-slate-800">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
          <Pill className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Inventory Bootstrapping</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Choose how you want to populate your pharmacy catalogue and initial batches.
          </p>
        </div>
      </div>

      {error && (
        <div className="mt-6 p-4 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 text-rose-700 dark:text-rose-300 flex items-center gap-3 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {seededCount !== null && (
        <div className="mt-6 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40 text-emerald-700 dark:text-emerald-300 flex items-center gap-3 text-sm">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          <span>Successfully seeded {seededCount} essential formulations with active stock batches!</span>
        </div>
      )}

      <div className="mt-6 space-y-4">
        {/* Option 1: Seed Starter Essentials */}
        <div
          onClick={() => setSelectedOption("seed")}
          className={`p-5 rounded-xl border-2 transition-all cursor-pointer ${
            selectedOption === "seed"
              ? "border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30 ring-2 ring-indigo-200 dark:ring-indigo-900"
              : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-950"
          }`}
        >
          <div className="flex items-start gap-4">
            <div className="w-9 h-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Seed Essential Indian Medicines Starter Pack
                </h3>
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 font-semibold">
                  Recommended
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Pre-loads {ESSENTIAL_STARTER_MEDICINES.length} high-frequency formulations (Dolo 650, Augmentin 625, Pan-D, Azithral, etc.) with valid HSN 3004, GST rates, and demo batches.
              </p>
            </div>
          </div>
        </div>

        {/* Option 2: Marg ERP / CSV Import */}
        <div
          onClick={() => setSelectedOption("import")}
          className={`p-5 rounded-xl border-2 transition-all cursor-pointer ${
            selectedOption === "import"
              ? "border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30 ring-2 ring-indigo-200 dark:ring-indigo-900"
              : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-950"
          }`}
        >
          <div className="flex items-start gap-4">
            <div className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Import from Marg ERP or Vyapar CSV
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Migrate existing stock, item masters, and batch ledgers using our intelligent schema-mapping import engine in the dashboard.
              </p>
            </div>
          </div>
        </div>

        {/* Option 3: Clean Blank */}
        <div
          onClick={() => setSelectedOption("blank")}
          className={`p-5 rounded-xl border-2 transition-all cursor-pointer ${
            selectedOption === "blank"
              ? "border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30 ring-2 ring-indigo-200 dark:ring-indigo-900"
              : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-950"
          }`}
        >
          <div className="flex items-start gap-4">
            <div className="w-9 h-9 rounded-lg bg-slate-500 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
              <Pill className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Start with Empty Inventory
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Create products manually on the fly during purchase invoices or dispensing.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="pt-6 mt-6 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-sm transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <button
          type="button"
          onClick={handleProceed}
          disabled={loading}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
        >
          <span>
            {loading
              ? "Bootstrapping..."
              : selectedOption === "seed"
                ? "Seed Catalogue & Continue"
                : "Proceed to Team Setup"}
          </span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

