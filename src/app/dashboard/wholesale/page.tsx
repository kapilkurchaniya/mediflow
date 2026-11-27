"use client";

import React, { useEffect, useState } from "react";
import { Plus, Trash2, Truck, AlertTriangle, Save, CheckCircle2 } from "lucide-react";
import { convertChallanToWholesaleInvoiceSummary, type WholesaleChallanLine } from "@/lib/wholesale/challan";
import { listWholesaleChallansAction, saveWholesaleChallanAction } from "@/app/actions/phase-c";
import { formatINR } from "@/lib/format";

export default function WholesaleChallanPage() {
  const [challanNo, setChallanNo] = useState("CH-2026-001");
  const [challanDate, setChallanDate] = useState(new Date().toISOString().slice(0, 10));
  const [buyerName, setBuyerName] = useState("City Medical Agencies");
  const [buyerGstin, setBuyerGstin] = useState("27AABCU9603R1ZM");
  const [routeName, setRouteName] = useState("South Zone");
  const [salesmanName, setSalesmanName] = useState("Vikram");
  const [lrNo, setLrNo] = useState("");
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savedChallans, setSavedChallans] = useState<Awaited<ReturnType<typeof listWholesaleChallansAction>>>([]);

  useEffect(() => {
    let active = true;
    listWholesaleChallansAction()
      .then((rows) => {
        if (active) setSavedChallans(rows);
      })
      .catch((err: unknown) => {
        if (active) setLoadError(err instanceof Error ? err.message : "Failed to load wholesale challans.");
      });
    return () => {
      active = false;
    };
  }, []);
  const [lines, setLines] = useState<WholesaleChallanLine[]>([
    {
      medicineId: "m1",
      medicineName: "Augmentin 625 Duo",
      batchNo: "AUG102",
      qty: 100,
      freeQty: 10,
      ptrRatePaise: 14500,
      discountBp: 500,
      gstRateBp: 1200,
    },
  ]);

  const summary = convertChallanToWholesaleInvoiceSummary({
    challanNo,
    challanDate,
    buyerName,
    buyerGstin,
    routeName,
    salesmanName,
    lrNo,
    lines,
  });

  return (
    <div className="page space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ink-200 pb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-brand-50 border border-brand-200 flex items-center justify-center text-brand-700">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-ink-900">B2B Wholesale Challan & Dispatch</h1>
            <p className="text-xs text-ink-500">
              Convert delivery challans to B2B GST invoices with Route, Salesman, LR tracking, and e-Way Bill threshold alerts.
            </p>
          </div>
        </div>
      </div>

      {loadError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">{loadError}</div>
      )}

      <div className="card p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div>
            <label className="label">Challan No</label>
            <input className="input font-mono" value={challanNo} onChange={(e) => setChallanNo(e.target.value)} />
          </div>
          <div>
            <label className="label">Date</label>
            <input type="date" className="input" value={challanDate} onChange={(e) => setChallanDate(e.target.value)} />
          </div>
          <div>
            <label className="label">Buyer / Retailer</label>
            <input className="input" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} />
          </div>
          <div>
            <label className="label">Buyer GSTIN</label>
            <input className="input font-mono" value={buyerGstin} onChange={(e) => setBuyerGstin(e.target.value)} />
          </div>
          <div>
            <label className="label">Route / Salesman</label>
            <input className="input" value={`${routeName} / ${salesmanName}`} onChange={(e) => {
              const [r, s] = e.target.value.split("/");
              setRouteName((r ?? "").trim());
              setSalesmanName((s ?? "").trim());
            }} />
          </div>
          <div>
            <label className="label">LR / Transport No</label>
            <input className="input font-mono" placeholder="LR-1234" value={lrNo} onChange={(e) => setLrNo(e.target.value)} />
          </div>
        </div>

        <div className="overflow-x-auto border border-ink-200 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-xs uppercase text-ink-500">
              <tr>
                <th className="p-2.5 text-left">Medicine</th>
                <th className="p-2.5 text-left">Batch</th>
                <th className="p-2.5 text-right w-24">Qty</th>
                <th className="p-2.5 text-right w-20">Free</th>
                <th className="p-2.5 text-right w-28">PTR (₹)</th>
                <th className="p-2.5 text-right w-24">Disc %</th>
                <th className="p-2.5 text-right w-24">GST %</th>
                <th className="p-2.5 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {lines.map((l, idx) => (
                <tr key={idx}>
                  <td className="p-2">
                    <input
                      className="input"
                      value={l.medicineName}
                      onChange={(e) => {
                        const next = [...lines];
                        next[idx].medicineName = e.target.value;
                        setLines(next);
                      }}
                    />
                  </td>
                  <td className="p-2">
                    <input
                      className="input font-mono"
                      value={l.batchNo}
                      onChange={(e) => {
                        const next = [...lines];
                        next[idx].batchNo = e.target.value;
                        setLines(next);
                      }}
                    />
                  </td>
                  <td className="p-2">
                    <input
                      type="number"
                      className="input text-right font-mono"
                      value={l.qty}
                      onChange={(e) => {
                        const next = [...lines];
                        next[idx].qty = parseInt(e.target.value, 10) || 0;
                        setLines(next);
                      }}
                    />
                  </td>
                  <td className="p-2">
                    <input
                      type="number"
                      className="input text-right font-mono"
                      value={l.freeQty}
                      onChange={(e) => {
                        const next = [...lines];
                        next[idx].freeQty = parseInt(e.target.value, 10) || 0;
                        setLines(next);
                      }}
                    />
                  </td>
                  <td className="p-2">
                    <input
                      type="number"
                      step="0.01"
                      className="input text-right font-mono"
                      value={(l.ptrRatePaise / 100).toFixed(2)}
                      onChange={(e) => {
                        const next = [...lines];
                        next[idx].ptrRatePaise = Math.round((parseFloat(e.target.value) || 0) * 100);
                        setLines(next);
                      }}
                    />
                  </td>
                  <td className="p-2">
                    <input
                      type="number"
                      step="0.5"
                      className="input text-right font-mono"
                      value={(l.discountBp / 100).toString()}
                      onChange={(e) => {
                        const next = [...lines];
                        next[idx].discountBp = Math.round((parseFloat(e.target.value) || 0) * 100);
                        setLines(next);
                      }}
                    />
                  </td>
                  <td className="p-2">
                    <input
                      type="number"
                      className="input text-right font-mono"
                      value={(l.gstRateBp / 100).toString()}
                      onChange={(e) => {
                        const next = [...lines];
                        next[idx].gstRateBp = Math.round((parseFloat(e.target.value) || 0) * 100);
                        setLines(next);
                      }}
                    />
                  </td>
                  <td className="p-2 text-center">
                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setLines(lines.filter((_, i) => i !== idx))}
                        className="text-rose-500 hover:text-rose-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
          <button
            type="button"
            onClick={() =>
              setLines([
                ...lines,
                {
                  medicineId: `m${lines.length + 1}`,
                  medicineName: "",
                  batchNo: "",
                  qty: 10,
                  freeQty: 0,
                  ptrRatePaise: 10000,
                  discountBp: 0,
                  gstRateBp: 1200,
                },
              ])
            }
            className="btn btn-sm btn-ghost"
          >
            <Plus className="w-4 h-4" /> Add Line
          </button>

          <div className="flex flex-wrap items-center gap-5 text-sm font-mono">
            <span>Taxable: <strong>{formatINR(summary.taxablePaise)}</strong></span>
            <span>GST: <strong>{formatINR(summary.gstPaise)}</strong></span>
            <span className="text-base">Grand Total: <strong>{formatINR(summary.grandTotalPaise)}</strong></span>
            <button
              type="button"
              onClick={async () => {
                const res = await saveWholesaleChallanAction({
                  challanNo,
                  challanDate,
                  buyerName,
                  buyerGstin,
                  routeName,
                  salesmanName,
                  lrNo,
                  lines,
                });
                setSavedMsg(res.success ? `Saved Challan ${challanNo} to DB` : res.error || "Save failed");
                if (res.success) {
                  setSavedChallans(await listWholesaleChallansAction());
                }
              }}
              className="btn btn-primary btn-sm"
            >
              <Save className="w-4 h-4" /> Save Challan
            </button>
          </div>
        </div>
        {savedMsg && (
          <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" /> {savedMsg}
          </div>
        )}

        {summary.requiresEwayBill && (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2 font-medium">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Consignment exceeds ₹50,000 — GST e-Way Bill generation is mandatory before dispatch.</span>
          </div>
        )}
      </div>

      {savedChallans.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-ink-150 bg-ink-50/50 text-sm font-semibold">
            Saved Wholesale Challans ({savedChallans.length})
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-ink-50 uppercase text-ink-500">
                <tr>
                  <th className="p-2.5 text-left">Challan No</th>
                  <th className="p-2.5 text-left">Date</th>
                  <th className="p-2.5 text-left">Buyer</th>
                  <th className="p-2.5 text-left">Route / Salesman</th>
                  <th className="p-2.5 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {savedChallans.map((c) => (
                  <tr key={c.id}>
                    <td className="p-2.5 font-mono font-semibold">{c.challanNo}</td>
                    <td className="p-2.5 font-mono">{c.challanDate}</td>
                    <td className="p-2.5">{c.buyerName}</td>
                    <td className="p-2.5 text-ink-500">{[c.routeName, c.salesmanName].filter(Boolean).join(" / ") || "—"}</td>
                    <td className="p-2.5 text-right font-mono font-semibold">{formatINR(c.grandTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
