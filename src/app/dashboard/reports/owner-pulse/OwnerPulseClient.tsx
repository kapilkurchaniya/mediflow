"use client";

import React, { useEffect, useState } from "react";
import { Crown, TrendingUp } from "lucide-react";
import { calculateThreeYearTcoComparison } from "@/lib/analytics/owner-pulse";
import { getLiveOwnerPulseAction } from "@/app/actions/phase-c";
import { formatINR } from "@/lib/format";

export function OwnerPulseClient() {
  const [terminals, setTerminals] = useState(3);
  const [amcPerTerminal, setAmcPerTerminal] = useState(4500);
  const [walletMonthly, setWalletMonthly] = useState(500);
  const [mediflowAnnual, setMediflowAnnual] = useState(12000);
  const [pulse, setPulse] = useState<Awaited<ReturnType<typeof getLiveOwnerPulseAction>> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getLiveOwnerPulseAction()
      .then((data) => {
        if (active) setPulse(data);
      })
      .catch((err: unknown) => {
        if (active) setLoadError(err instanceof Error ? err.message : "Failed to load multi-store pulse.");
      });
    return () => {
      active = false;
    };
  }, []);

  const tco = calculateThreeYearTcoComparison({
    terminals,
    margAnnualAmcPerTerminalInr: amcPerTerminal,
    margWalletMonthlyInr: walletMonthly,
    mediflowAnnualPerStoreInr: mediflowAnnual,
  });

  return (
    <div className="page space-y-6">
      <div className="border-b border-ink-200 pb-4 flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
          <Crown className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-ink-900">eOwner Insights &amp; 3-Year Marg TCO Comparator</h1>
          <p className="text-xs text-ink-500">
            Live multi-store pulse and 3-year Total Cost of Ownership vs Marg ERP + AMC + Wallet.
          </p>
        </div>
      </div>

      {loadError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">{loadError}</div>
      )}

      {pulse && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="card p-4">
            <div className="text-xs text-ink-500">Active Stores</div>
            <div className="text-xl font-bold font-mono">{pulse.storeCount}</div>
          </div>
          <div className="card p-4">
            <div className="text-xs text-ink-500">Today&apos;s Sales</div>
            <div className="text-xl font-bold font-mono text-brand-700">{formatINR(pulse.totalSalesPaise)}</div>
          </div>
          <div className="card p-4">
            <div className="text-xs text-ink-500">Today&apos;s Credit Issued</div>
            <div className="text-xl font-bold font-mono text-rose-600">{formatINR(pulse.totalCreditPaise)}</div>
          </div>
          <div className="card p-4">
            <div className="text-xs text-ink-500">Near-Expiry Exposure (90d)</div>
            <div className="text-xl font-bold font-mono text-amber-700">{formatINR(pulse.totalNearExpiryPaise)}</div>
          </div>
        </div>
      )}

      <div className="card p-5 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="label">POS Terminals</label>
            <input type="number" min={1} className="input font-mono" value={terminals} onChange={(e) => setTerminals(parseInt(e.target.value, 10) || 1)} />
          </div>
          <div>
            <label className="label">Marg AMC / Terminal / Yr (₹)</label>
            <input type="number" className="input font-mono" value={amcPerTerminal} onChange={(e) => setAmcPerTerminal(parseInt(e.target.value, 10) || 0)} />
          </div>
          <div>
            <label className="label">Marg Wallet Spend / Mo (₹)</label>
            <input type="number" className="input font-mono" value={walletMonthly} onChange={(e) => setWalletMonthly(parseInt(e.target.value, 10) || 0)} />
          </div>
          <div>
            <label className="label">MediFlow Annual / Store (₹)</label>
            <input type="number" className="input font-mono" value={mediflowAnnual} onChange={(e) => setMediflowAnnual(parseInt(e.target.value, 10) || 0)} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200">
            <div className="text-xs text-rose-700 font-semibold">3-Year Marg + Wallet Cost</div>
            <div className="text-2xl font-bold font-mono text-rose-900">₹{tco.margThreeYearInr.toLocaleString("en-IN")}</div>
          </div>
          <div className="p-4 rounded-xl bg-brand-50 border border-brand-200">
            <div className="text-xs text-brand-700 font-semibold">3-Year MediFlow Cost</div>
            <div className="text-2xl font-bold font-mono text-brand-900">₹{tco.mediflowThreeYearInr.toLocaleString("en-IN")}</div>
          </div>
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
            <div className="text-xs text-emerald-700 font-semibold flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5" /> Net 3-Year Savings
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-900">₹{tco.savingsInr.toLocaleString("en-IN")}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
