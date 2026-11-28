"use client";

import React, { useEffect, useState } from "react";
import { Calculator, FileCheck2, Percent, Plus } from "lucide-react";
import {
  computeCompositionTax,
  computeTdsDeduction,
  TDS_SECTION_RATES_BP,
  type TdsSection,
} from "@/lib/tax/composition-and-tds";
import { listTdsEntriesAction, recordTdsEntryAction } from "@/app/actions/phase-c";
import { formatINR } from "@/lib/format";
import { buildGstr9AnnualSummary } from "@/server/domain/reports/gstr9";

export function ImsAndTaxClient() {
  const [turnoverRs, setTurnoverRs] = useState("150000");
  const [tdsSection, setTdsSection] = useState<TdsSection>("194Q");
  const [tdsBaseRs, setTdsBaseRs] = useState("600000");
  const [tdsParty, setTdsParty] = useState("");
  const [tdsPan, setTdsPan] = useState("");
  const [hasPan, setHasPan] = useState(true);
  const [tdsRows, setTdsRows] = useState<Awaited<ReturnType<typeof listTdsEntriesAction>>>([]);
  const [tdsMsg, setTdsMsg] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listTdsEntriesAction()
      .then((rows) => {
        if (active) setTdsRows(rows);
      })
      .catch((err: unknown) => {
        if (active) setLoadError(err instanceof Error ? err.message : "Failed to load TDS register.");
      });
    return () => {
      active = false;
    };
  }, []);

  const comp = computeCompositionTax(Math.round((parseFloat(turnoverRs) || 0) * 100));
  const tds = computeTdsDeduction({
    section: tdsSection,
    baseAmountPaise: Math.round((parseFloat(tdsBaseRs) || 0) * 100),
    hasPan,
  });

  return (
    <div className="page space-y-6">
      <div className="border-b border-ink-200 pb-4">
        <h1 className="text-xl font-bold text-ink-900">Composition GST (CMP-08), TDS &amp; IMS Workbench</h1>
        <p className="text-xs text-ink-500">
          Calculate 1% Composition turnover tax (G5) and Income-tax Act TDS deductions under 194Q / 194H / 194C / 194J (G9).
        </p>
      </div>

      {loadError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">{loadError}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-5 space-y-4">
          <div className="flex items-center gap-2 font-semibold text-sm text-ink-900">
            <Percent className="w-4 h-4 text-brand-600" /> GST Composition Scheme (CMP-08 / GSTR-4 · 1%)
          </div>
          <div>
            <label className="label">Quarterly / Period Gross Turnover (₹)</label>
            <input
              type="number"
              className="input font-mono"
              value={turnoverRs}
              onChange={(e) => setTurnoverRs(e.target.value)}
            />
          </div>
          <div className="bg-ink-50 rounded-xl p-4 space-y-2 text-sm font-mono">
            <div className="flex justify-between">
              <span className="text-ink-600">CGST (0.5%)</span>
              <strong>{formatINR(comp.cgstPaise)}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-600">SGST (0.5%)</span>
              <strong>{formatINR(comp.sgstPaise)}</strong>
            </div>
            <div className="flex justify-between border-t border-ink-200 pt-2 text-base">
              <span>Total Composition Tax</span>
              <strong className="text-brand-700">{formatINR(comp.totalTaxPaise)}</strong>
            </div>
          </div>
        </div>

        <div className="card p-5 space-y-4">
          <div className="flex items-center gap-2 font-semibold text-sm text-ink-900">
            <Calculator className="w-4 h-4 text-indigo-600" /> Income Tax TDS Deduction Calculator
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">TDS Section</label>
              <select className="input" value={tdsSection} onChange={(e) => setTdsSection(e.target.value as TdsSection)}>
                {Object.entries(TDS_SECTION_RATES_BP).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Base Payment Amount (₹)</label>
              <input
                type="number"
                className="input font-mono"
                value={tdsBaseRs}
                onChange={(e) => setTdsBaseRs(e.target.value)}
              />
            </div>
          </div>
          <label className="inline-flex items-center gap-2 text-xs font-medium cursor-pointer">
            <input type="checkbox" checked={hasPan} onChange={(e) => setHasPan(e.target.checked)} />
            <span>Vendor PAN Verified (Unchecked applies higher non-PAN penalty TDS rate)</span>
          </label>
          <div className="bg-ink-50 rounded-xl p-4 space-y-2 text-sm font-mono">
            <div className="flex justify-between">
              <span className="text-ink-600">Effective Rate</span>
              <strong>{(tds.rateBp / 100).toFixed(2)}%</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-600">TDS Deducted</span>
              <strong className="text-rose-600">{formatINR(tds.tdsAmountPaise)}</strong>
            </div>
            <div className="flex justify-between border-t border-ink-200 pt-2 text-base">
              <span>Net Payable to Vendor</span>
              <strong className="text-emerald-700">{formatINR(tds.netPayablePaise)}</strong>
            </div>
          </div>
          <div className="text-xs text-ink-500 flex items-center gap-1.5">
            <FileCheck2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Aligned with GSTR-2B / IMS ITC lock rules.</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-ink-100">
            <input
              type="text"
              placeholder="Party / Vendor Name"
              className="input text-xs"
              value={tdsParty}
              onChange={(e) => setTdsParty(e.target.value)}
            />
            <input
              type="text"
              placeholder="PAN (optional)"
              className="input text-xs font-mono uppercase"
              value={tdsPan}
              onChange={(e) => setTdsPan(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            {tdsMsg && <span className="text-xs text-emerald-700 font-medium">{tdsMsg}</span>}
            <button
              type="button"
              onClick={async () => {
                const res = await recordTdsEntryAction({
                  section: tdsSection,
                  partyName: tdsParty || "Vendor",
                  partyPan: tdsPan,
                  entryDate: new Date().toISOString().slice(0, 10),
                  baseAmountPaise: Math.round((parseFloat(tdsBaseRs) || 0) * 100),
                  hasPan,
                });
                if (res.success) {
                  setTdsMsg("TDS entry saved.");
                  setTdsParty("");
                  setTdsRows(await listTdsEntriesAction());
                } else {
                  setTdsMsg(res.error || "Failed to save TDS");
                }
              }}
              className="btn btn-primary btn-sm ml-auto"
            >
              <Plus className="w-3.5 h-3.5" /> Record TDS Entry
            </button>
          </div>
        </div>
      </div>

      {tdsRows.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-ink-150 bg-ink-50/50 text-sm font-semibold">
            TDS Register ({tdsRows.length})
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-ink-50 uppercase text-ink-500">
                <tr>
                  <th className="p-2.5 text-left">Date</th>
                  <th className="p-2.5 text-left">Section</th>
                  <th className="p-2.5 text-left">Party</th>
                  <th className="p-2.5 text-right">Base</th>
                  <th className="p-2.5 text-right">TDS</th>
                  <th className="p-2.5 text-right">Net Payable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 font-mono">
                {tdsRows.map((r) => (
                  <tr key={r.id}>
                    <td className="p-2.5">{r.entryDate}</td>
                    <td className="p-2.5 font-semibold">{r.section}</td>
                    <td className="p-2.5 font-sans">{r.partyName}</td>
                    <td className="p-2.5 text-right">{formatINR(r.baseAmount)}</td>
                    <td className="p-2.5 text-right text-rose-600">{formatINR(r.tdsAmount)}</td>
                    <td className="p-2.5 text-right text-emerald-700 font-semibold">{formatINR(r.netPayable)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* GSTR-9 Annual Summary (B9.6 / G6) */}
      {(() => {
        const sampleGstr9 = buildGstr9AnnualSummary("2026-27", [
          {
            month: "2026-11",
            b2bTaxablePaise: Math.round((parseFloat(turnoverRs) || 0) * 100),
            b2cTaxablePaise: 0,
            creditNoteTaxablePaise: 0,
            outputTaxPaise: comp.totalTaxPaise,
            itcClaimedPaise: 0,
            itcReversedPaise: 0,
          },
        ]);
        return (
          <div className="card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ink-900">GSTR-9 Annual Return Preview (FY {sampleGstr9.financialYear})</h3>
              <span className="badge badge-neutral">B9.6 / G6</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm font-mono">
              <div className="p-3 rounded-lg bg-ink-50">
                <div className="text-xs text-ink-500">Outward Taxable</div>
                <strong>{formatINR(sampleGstr9.outwardTaxablePaise)}</strong>
              </div>
              <div className="p-3 rounded-lg bg-ink-50">
                <div className="text-xs text-ink-500">Outward Tax</div>
                <strong>{formatINR(sampleGstr9.outwardTaxPaise)}</strong>
              </div>
              <div className="p-3 rounded-lg bg-ink-50">
                <div className="text-xs text-ink-500">Net ITC Claimed</div>
                <strong>{formatINR(sampleGstr9.netItcPaise)}</strong>
              </div>
              <div className="p-3 rounded-lg bg-ink-50">
                <div className="text-xs text-ink-500">Net Payable</div>
                <strong className="text-brand-700">{formatINR(sampleGstr9.netTaxPayableOrCreditPaise)}</strong>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
