"use client";

import React, { useState } from "react";
import { ArrowLeft, Printer, CheckCircle2, Rocket, AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";

interface Step5PrintDrillProps {
  businessData: {
    legalName: string | null;
    gstin: string | null;
    stateCode: string | null;
    stateName: string | null;
  };
  storeData: {
    name: string;
    invoicePrefix: string;
    form20No: string | null;
    form21No: string | null;
  } | null;
  onBack: () => void;
  onComplete: () => Promise<{ success: boolean; redirectUrl: string; error?: string }>;
}

export function Step5PrintDrill({ businessData, storeData, onBack, onComplete }: Step5PrintDrillProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prefix = storeData?.invoicePrefix || "INV";
  const storeName = storeData?.name || businessData.legalName || "My Pharmacy";
  const gstin = businessData.gstin || "27AABCU9603R1ZM";
  const invoiceNo = `${prefix}-TEST-0001`;
  const currentDate = new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const handlePrint = () => {
    window.print();
  };

  const handleFinish = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await onComplete();
      if (!res.success) {
        setError(res.error || "Failed to mark onboarding as completed.");
        return;
      }
      router.push(res.redirectUrl || "/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error finishing onboarding.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 sm:p-8">
      <div className="flex items-center gap-3 pb-6 border-b border-slate-100 dark:border-slate-800">
        <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
          <Printer className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Counter Test Print Drill</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Verify 80mm thermal receipt rendering, statutory GST splits, and counter readiness.
          </p>
        </div>
      </div>

      {error && (
        <div className="mt-6 p-4 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 text-rose-700 dark:text-rose-300 flex items-center gap-3 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        {/* Receipt Thermal Preview (80mm styling) */}
        <div className="bg-amber-50/40 dark:bg-slate-950 p-6 rounded-2xl border-2 border-dashed border-amber-200 dark:border-slate-800 flex justify-center">
          <div
            id="thermal-receipt"
            className="w-full max-w-[340px] bg-white text-slate-900 p-5 rounded-lg shadow-sm font-mono text-[11px] leading-tight border border-slate-200"
          >
            {/* Header */}
            <div className="text-center pb-3 border-b border-dashed border-slate-300">
              <p className="text-sm font-bold uppercase">{storeName}</p>
              <p className="text-[10px] text-slate-600">{businessData.legalName}</p>
              <p className="text-[10px]">GSTIN: {gstin}</p>
              {storeData?.form20No && <p className="text-[9px]">DL No: {storeData.form20No}</p>}
              <p className="text-[10px] mt-1 font-bold">TAX INVOICE</p>
            </div>

            {/* Meta */}
            <div className="py-2 border-b border-dashed border-slate-300 flex justify-between text-[10px]">
              <div>
                <p>Inv: {invoiceNo}</p>
                <p>Patient: Walk-in Test</p>
              </div>
              <div className="text-right">
                <p>{currentDate}</p>
                <p>POS Counter 01</p>
              </div>
            </div>

            {/* Items */}
            <div className="py-2 border-b border-dashed border-slate-300">
              <div className="flex justify-between font-bold pb-1 text-[10px]">
                <span>Item</span>
                <span>Qty x Rate</span>
                <span>Amount</span>
              </div>

              <div className="space-y-1.5 pt-1">
                <div className="flex justify-between">
                  <div>
                    <p className="font-semibold">Dolo 650mg Tab (15s)</p>
                    <p className="text-[9px] text-slate-500">B: DEMO-8821 E: 10/27</p>
                  </div>
                  <span>1 x 33.50</span>
                  <span className="font-bold">₹33.50</span>
                </div>

                <div className="flex justify-between">
                  <div>
                    <p className="font-semibold">Augmentin 625 Duo (10s)</p>
                    <p className="text-[9px] text-slate-500">B: DEMO-4102 E: 08/27</p>
                  </div>
                  <span>1 x 204.00</span>
                  <span className="font-bold">₹204.00</span>
                </div>
              </div>
            </div>

            {/* Calculations & GST */}
            <div className="py-2 border-b border-dashed border-slate-300 space-y-1 text-[10px]">
              <div className="flex justify-between">
                <span>Taxable Amount</span>
                <span>₹226.19</span>
              </div>
              <div className="flex justify-between">
                <span>CGST @ 2.5%</span>
                <span>₹5.65</span>
              </div>
              <div className="flex justify-between">
                <span>SGST @ 2.5%</span>
                <span>₹5.66</span>
              </div>
              <div className="flex justify-between text-xs font-bold pt-1 border-t border-slate-200">
                <span>Net Payable Amount</span>
                <span>₹237.50</span>
              </div>
            </div>

            {/* Footer */}
            <div className="pt-3 text-center text-[9px] text-slate-600 space-y-1">
              <p>Payment: CASH (Confirmed)</p>
              <p className="font-semibold">Thank you for visiting {storeName}!</p>
              <p className="text-[8px] italic">Prescription required for Schedule H/H1 medicines.</p>
            </div>
          </div>
        </div>

        {/* Action Panel */}
        <div className="space-y-6">
          <div className="p-5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              Counter Verification Checklist
            </h3>
            <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-2">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                GSTIN state code ({businessData.stateCode}) matches POS store configuration
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Invoice prefix format strictly adheres to GST Rule 46(b)
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Dual GST split (CGST + SGST) accurately calculated for intra-state supply
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                D&C Act Form 20/21 license numbers visible on receipt header
              </li>
            </ul>
          </div>

          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={handlePrint}
              className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-900 dark:text-white text-sm font-semibold transition-all shadow-sm"
            >
              <Printer className="w-4 h-4 text-slate-600 dark:text-slate-400" />
              <span>Print 80mm Thermal Receipt</span>
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={handleFinish}
              className="w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition-all shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
            >
              <Rocket className="w-4 h-4" />
              <span>{loading ? "Completing Setup..." : "Complete Setup & Launch POS Counter"}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="pt-6 mt-8 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-sm transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>
      </div>
    </div>
  );
}

