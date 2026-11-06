"use client";

import { useState, useTransition } from "react";
import type { schema } from "@/server/db";
import type { SequenceRolloverPreview, YearEndReadinessResult } from "@/server/domain/accounting-year-end";
import { generateDraftSnapshotAction, finalizeYearEndSnapshotAction, overrideNrvAction, exportYearEndCsvAction } from "@/app/actions/year-end";

interface Props {
  stores: Array<{ id: string; name: string; code: string }>;
  selectedStoreId: string;
  currentFy: string;
  initialSequencePreview: SequenceRolloverPreview | null;
  initialReadiness: YearEndReadinessResult | null;
  initialSnapshots: Array<typeof schema.yearEndStockSnapshots.$inferSelect>;
  initialItems: Array<typeof schema.yearEndStockItems.$inferSelect>;
  isOwner: boolean;
}

export function YearEndClient({
  stores, selectedStoreId, currentFy, initialSequencePreview, initialReadiness, initialSnapshots, initialItems, isOwner,
}: Props) {
  const [activeTab, setActiveTab] = useState<"valuation" | "readiness" | "sequences">("valuation");
  const [storeId, setStoreId] = useState(selectedStoreId);
  const [fiscalYear, setFiscalYear] = useState(currentFy);
  const [snapshots] = useState(initialSnapshots);
  const [items, setItems] = useState(initialItems);
  const [overrideItem, setOverrideItem] = useState<(typeof initialItems)[0] | null>(null);
  const [overridePaise, setOverridePaise] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [isPending, startTransition] = useTransition();

  const snap = snapshots.find((s) => s.fiscalYear === fiscalYear) ?? snapshots[0];

  function handleDraft() {
    startTransition(async () => {
      setMsg(null);
      const res = await generateDraftSnapshotAction(storeId, fiscalYear);
      if (res.success) { window.location.reload(); } else { setMsg({ text: res.error ?? "Failed draft", error: true }); }
    });
  }

  function handleFinalize() {
    if (!confirm(`Finalize FY ${fiscalYear}? This permanently locks valuation.`)) return;
    startTransition(async () => {
      setMsg(null);
      const res = await finalizeYearEndSnapshotAction(storeId, fiscalYear);
      if (res.success) { window.location.reload(); } else { setMsg({ text: res.error ?? "Failed finalize", error: true }); }
    });
  }

  function handleOverride() {
    if (!overrideItem) return;
    startTransition(async () => {
      const paise = Math.round(parseFloat(overridePaise) * 100);
      const res = await overrideNrvAction(storeId, overrideItem.id, paise, overrideReason);
      if (res.success) {
        setItems((prev) => prev.map((i) => (i.id === overrideItem.id ? { ...i, nrvPaise: paise, isOverridden: true, overrideReason } : i)));
        setOverrideItem(null);
        setMsg({ text: "Override saved" });
      } else { setMsg({ text: res.error ?? "Failed override", error: true }); }
    });
  }

  function handleExport() {
    if (!snap) return;
    startTransition(async () => {
      const res = await exportYearEndCsvAction(storeId, snap.id);
      if (res.success && res.csvContent) {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([res.csvContent], { type: "text/csv" }));
        a.download = `closing_stock_${fiscalYear}_${snap.id.slice(0, 8)}.csv`;
        a.click();
      } else { setMsg({ text: res.error ?? "Export failed", error: true }); }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <select value={storeId} onChange={(e) => setStoreId(e.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
            {stores.map((s) => (<option key={s.id} value={s.id}>{s.name} ({s.code})</option>))}
          </select>
          <input type="text" value={fiscalYear} onChange={(e) => setFiscalYear(e.target.value)} className="w-32 rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          {snap && (
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase ${snap.status === "finalized" ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"}`}>
              {snap.status}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {snap && <button onClick={handleExport} disabled={isPending} className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent">Export CSV</button>}
          {isOwner && (!snap || snap.status === "draft") && (
            <button onClick={handleDraft} disabled={isPending} className="rounded-lg border border-primary/50 bg-primary/10 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/20">
              {snap ? "Recalculate Draft" : "Generate Draft"}
            </button>
          )}
          {isOwner && snap?.status === "draft" && (
            <button onClick={handleFinalize} disabled={isPending} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500">Finalize</button>
          )}
        </div>
      </div>

      {msg && <div className={`p-4 rounded-lg text-sm ${msg.error ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-400"}`}>{msg.text}</div>}

      <div className="flex border-b border-border space-x-6 text-sm font-medium">
        {(["valuation", "readiness", "sequences"] as const).map((t) => (
          <button key={t} onClick={() => setActiveTab(t)} className={`pb-3 capitalize ${activeTab === t ? "border-b-2 border-primary text-primary" : "text-muted-foreground"}`}>{t}</button>
        ))}
      </div>

      {activeTab === "valuation" && (
        <div className="space-y-6">
          {snap && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[
                { label: "Units", val: Number(snap.totalUnits).toLocaleString() },
                { label: "Landed Cost", val: `₹${(Number(snap.grossLandedCostPaise) / 100).toFixed(2)}` },
                { label: "Total NRV", val: `₹${(Number(snap.totalNrvPaise) / 100).toFixed(2)}` },
                { label: "Final Valuation", val: `₹${(Number(snap.finalValuationPaise) / 100).toFixed(2)}`, highlight: "text-emerald-400" },
                { label: "Write-Down Provision", val: `₹${(Number(snap.totalProvisionPaise) / 100).toFixed(2)}`, highlight: "text-amber-400" },
              ].map((c) => (
                <div key={c.label} className="rounded-xl border border-border bg-card p-4">
                  <div className="text-xs text-muted-foreground">{c.label}</div>
                  <div className={`text-xl font-bold ${c.highlight ?? ""}`}>{c.val}</div>
                </div>
              ))}
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
                <tr><th className="p-3">Batch</th><th className="p-3">Expiry</th><th className="p-3 text-right">Qty</th><th className="p-3 text-right">Cost</th><th className="p-3 text-right">NRV</th><th className="p-3">Tier</th><th className="p-3 text-right">Valuation</th><th className="p-3 text-center">Action</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.length === 0 ? (
                  <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">No items. Click &quot;Generate Draft&quot;.</td></tr>
                ) : (
                  items.map((i) => (
                    <tr key={i.id} className="hover:bg-muted/10">
                      <td className="p-3 font-mono text-xs">{i.batchNumber}</td>
                      <td className="p-3 text-xs">{i.expiryDate}</td>
                      <td className="p-3 text-right">{i.qty}</td>
                      <td className="p-3 text-right font-mono text-xs">₹{(Number(i.landedCostPaise) / 100).toFixed(2)}</td>
                      <td className="p-3 text-right font-mono text-xs">₹{(Number(i.nrvPaise) / 100).toFixed(2)} {i.isOverridden && "*"}</td>
                      <td className="p-3"><span className="rounded px-2 py-0.5 text-xs bg-muted font-mono">{i.classification}</span></td>
                      <td className="p-3 text-right font-mono text-xs font-semibold">₹{(Number(i.finalValuationPaise) / 100).toFixed(2)}</td>
                      <td className="p-3 text-center">
                        {snap?.status === "draft" && (
                          <button onClick={() => { setOverrideItem(i); setOverridePaise((Number(i.nrvPaise) / 100).toString()); }} className="text-xs text-primary hover:underline">Override</button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "readiness" && initialReadiness && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <h3 className="text-sm font-semibold">Statutory Readiness Preflight</h3>
            {initialReadiness.checks.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-xs py-1.5 border-b border-border/50">
                <span>{c.label}</span>
                <span className={`px-2 py-0.5 rounded font-mono ${c.passed ? "bg-emerald-500/10 text-emerald-400" : "bg-destructive/10 text-destructive"}`}>
                  {c.passed ? "PASSED" : "FAILED"}
                </span>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <h3 className="text-sm font-semibold">GL 1080 Inventory Bridge</h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between"><span>Physical Closing (V_closing)</span><span className="font-mono">₹{(initialReadiness.gl1080Bridge.closingPhysicalStockPaise / 100).toFixed(2)}</span></div>
              <div className="flex justify-between"><span>Opening Balance (B_open)</span><span className="font-mono">₹{(initialReadiness.gl1080Bridge.openingBalancePaise / 100).toFixed(2)}</span></div>
              <div className="flex justify-between"><span>Posted Adjustments (A_posted)</span><span className="font-mono">₹{(initialReadiness.gl1080Bridge.postedAdjustmentsPaise / 100).toFixed(2)}</span></div>
              <div className="flex justify-between"><span>Unposted Physical (R_phys)</span><span className="font-mono">₹{(initialReadiness.gl1080Bridge.unpostedPhysicalReconcilingPaise / 100).toFixed(2)}</span></div>
              <div className="flex justify-between"><span>GL Only In-Transit (R_gl)</span><span className="font-mono">₹{(initialReadiness.gl1080Bridge.glOnlyReconcilingPaise / 100).toFixed(2)}</span></div>
              <div className="flex justify-between border-t border-border pt-2 font-bold">
                <span>Residual Discrepancy (Δ)</span>
                <span className={`font-mono ${initialReadiness.gl1080Bridge.isReconciled ? "text-emerald-400" : "text-destructive"}`}>
                  ₹{(initialReadiness.gl1080Bridge.residualDiscrepancyPaise / 100).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "sequences" && initialSequencePreview && (
        <div className="rounded-xl border border-border bg-card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
              <tr><th className="p-3">Document Type</th><th className="p-3">Current Seq</th><th className="p-3">Simulated 1 April Doc #</th><th className="p-3 text-right">Length</th><th className="p-3 text-center">GST 46(b)</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {initialSequencePreview.docTypes.map((d) => (
                <tr key={d.docType}>
                  <td className="p-3 font-semibold">{d.docType}</td>
                  <td className="p-3 font-mono text-xs">{d.currentSequenceValue}</td>
                  <td className="p-3 font-mono text-xs text-primary">{d.simulatedFirstDocNumber}</td>
                  <td className="p-3 text-right font-mono text-xs">{d.length} / {d.maxLength}</td>
                  <td className="p-3 text-center">
                    <span className={`px-2 py-0.5 rounded text-xs font-mono ${d.isValidGstRule46b ? "bg-emerald-500/10 text-emerald-400" : "bg-destructive/10 text-destructive"}`}>
                      {d.isValidGstRule46b ? "VALID (<=16)" : "EXCEEDED"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {overrideItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 space-y-4">
            <h3 className="text-base font-semibold">CA NRV Valuation Override</h3>
            <div className="text-xs text-muted-foreground font-mono">Batch: {overrideItem.batchNumber}</div>
            <div>
              <label className="text-xs font-medium">New NRV (₹ per unit)</label>
              <input type="number" step="0.01" value={overridePaise} onChange={(e) => setOverridePaise(e.target.value)} className="w-full mt-1 rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium">Statutory Audit Justification</label>
              <textarea rows={3} value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder="State market quotes or supplier agreement" className="w-full mt-1 rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setOverrideItem(null)} className="rounded-lg border border-border px-3 py-1.5 text-xs">Cancel</button>
              <button onClick={handleOverride} disabled={isPending || overrideReason.length < 5} className="rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground">Save Override</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
