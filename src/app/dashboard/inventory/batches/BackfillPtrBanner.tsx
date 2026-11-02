"use client";

import { useState } from "react";
import { Sparkles, Loader2, CheckCircle2 } from "lucide-react";
import { backfillZeroPurchaseRates } from "@/app/actions/stock";
import { useRouter } from "next/navigation";

export function BackfillPtrBanner({ zeroCount }: { zeroCount: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [applied, setApplied] = useState(false);

  if (zeroCount === 0 && !applied) return null;

  const handleBackfill = async () => {
    setLoading(true);
    try {
      const res = await backfillZeroPurchaseRates();
      if (res.success) {
        setApplied(true);
        router.refresh();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (applied) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-800">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
        <span>Standard PTR (80% MRP) successfully saved to database. Real stock valuation updated!</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-3 text-[13px] text-amber-900">
      <div className="flex items-center gap-2.5">
        <Sparkles className="h-4 w-4 shrink-0 text-amber-600" />
        <div>
          <span className="font-semibold">{zeroCount} batches have ₹0.00 purchase rate recorded.</span>{" "}
          <span className="text-amber-700">Valuation below is estimated at standard pharmacy margin (80% of MRP).</span>
        </div>
      </div>
      <button
        onClick={handleBackfill}
        disabled={loading}
        className="btn btn-sm bg-amber-600 hover:bg-amber-700 text-white shrink-0 self-start sm:self-auto shadow-xs"
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
        Auto-save 80% PTR to DB
      </button>
    </div>
  );
}

