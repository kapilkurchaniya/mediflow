"use client";

import React, { useState } from "react";
import { UploadCloud, CheckCircle2 } from "lucide-react";
import {
  parseMargOpenBillsCsv,
  parseMargPdcCsv,
  type MigratedOpenBill,
  type MigratedPdcRow,
} from "@/server/domain/import/marg-deep-migration";
import { commitMargPdcImportAction } from "@/app/actions/phase-c";
import { formatINR } from "@/lib/format";

export function MargMigrationClient() {
  const [billsCsv, setBillsCsv] = useState("Type,Party,BillNo,Date,Pending\nCustomer,Ramesh Medical,INV-101,2026-11-01,2450.00");
  const [pdcCsv, setPdcCsv] = useState("Direction,Party,ChequeNo,Date,Bank,Amount\nInward,Ramesh Medical,556677,2026-12-15,HDFC,2450.00");
  const [bills, setBills] = useState<MigratedOpenBill[]>([]);
  const [pdcs, setPdcs] = useState<MigratedPdcRow[]>([]);
  const [pdcMsg, setPdcMsg] = useState<string | null>(null);

  return (
    <div className="page space-y-6">
      <div className="border-b border-ink-200 pb-4 flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700">
          <UploadCloud className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-ink-900">Deeper Marg ERP Migration (Open Bills &amp; PDCs)</h1>
          <p className="text-xs text-ink-500">
            Preview and validate Marg ERP outstanding party bills and post-dated cheque registers before importing.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-5 space-y-3">
          <h3 className="text-sm font-semibold text-ink-900">1. Open Receivable / Payable Bills CSV</h3>
          <textarea
            rows={5}
            className="input font-mono text-xs"
            value={billsCsv}
            onChange={(e) => setBillsCsv(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setBills(parseMargOpenBillsCsv(billsCsv))}
            className="btn btn-primary btn-sm"
          >
            Parse Open Bills ({bills.length})
          </button>
          {bills.length > 0 && (
            <div className="text-xs space-y-1 font-mono bg-ink-50 p-3 rounded-lg">
              {bills.map((b, i) => (
                <div key={i} className="flex justify-between">
                  <span>{b.partyType.toUpperCase()} · {b.partyName} ({b.billNo})</span>
                  <strong>{formatINR(b.pendingAmountPaise)}</strong>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-5 space-y-3">
          <h3 className="text-sm font-semibold text-ink-900">2. Post-Dated Cheques (PDC) CSV</h3>
          <textarea
            rows={5}
            className="input font-mono text-xs"
            value={pdcCsv}
            onChange={(e) => setPdcCsv(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPdcs(parseMargPdcCsv(pdcCsv))}
              className="btn btn-primary btn-sm"
            >
              Parse PDC Register ({pdcs.length})
            </button>
            {pdcs.length > 0 && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    const res = await commitMargPdcImportAction(pdcs);
                    setPdcMsg(
                      res.success
                        ? `Imported ${res.importedCount} PDC cheque(s) into PDC Register.`
                        : res.error || "Import failed",
                    );
                  } catch (err: unknown) {
                    setPdcMsg(err instanceof Error ? err.message : "Import failed");
                  }
                }}
                className="btn btn-secondary btn-sm"
              >
                <CheckCircle2 className="w-4 h-4" /> Commit to PDC Register
              </button>
            )}
          </div>
          {pdcMsg && <div className="text-xs text-emerald-700 font-medium">{pdcMsg}</div>}
          {pdcs.length > 0 && (
            <div className="text-xs space-y-1 font-mono bg-ink-50 p-3 rounded-lg">
              {pdcs.map((p, i) => (
                <div key={i} className="flex justify-between">
                  <span>{p.direction.toUpperCase()} · {p.partyName} (#{p.chequeNo})</span>
                  <strong>{formatINR(p.amountPaise)}</strong>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
