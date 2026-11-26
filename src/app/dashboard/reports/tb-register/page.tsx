"use client";

import React, { useEffect, useState } from "react";
import { Download, RefreshCw, ShieldAlert } from "lucide-react";
import { getTbRegisterAction } from "@/app/actions/pharmacy-reports";
import type { TbRegisterRow } from "@/server/domain/reports/tb-register";

export default function TbRegisterPage() {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 7)}-01`;
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [rows, setRows] = useState<TbRegisterRow[]>([]);
  const [csv, setCsv] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await getTbRegisterAction({ from, to });
      if (res.success && res.rows) {
        setRows(res.rows);
        setCsv(res.csv ?? "");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    getTbRegisterAction({ from, to }).then((res) => {
      if (!active) return;
      if (res.success && res.rows) {
        setRows(res.rows);
        setCsv(res.csv ?? "");
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function downloadCsv() {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `TB_Register_${from}_to_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="page space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ink-200 pb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-ink-900">Anti-TB Drug Register (Schedule H1 / TB)</h1>
            <p className="text-xs text-ink-500">
              Statutory dispensing register for Rifampicin, Isoniazid, Pyrazinamide, Ethambutol & anti-TB molecules.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" className="input w-auto" value={from} onChange={(e) => setFrom(e.target.value)} />
          <input type="date" className="input w-auto" value={to} onChange={(e) => setTo(e.target.value)} />
          <button type="button" onClick={load} disabled={loading} className="btn btn-primary btn-sm">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
          {rows.length > 0 && (
            <button type="button" onClick={downloadCsv} className="btn btn-secondary btn-sm">
              <Download className="w-4 h-4" /> Export CSV
            </button>
          )}
        </div>
      </div>

      <div className="card overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-ink-500">
            No anti-TB drug sales found in {from} to {to}.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-ink-50 text-xs uppercase text-ink-500">
                <tr>
                  <th className="p-3 text-left">Date</th>
                  <th className="p-3 text-left">Invoice</th>
                  <th className="p-3 text-left">Patient</th>
                  <th className="p-3 text-left">Prescriber</th>
                  <th className="p-3 text-left">Medicine</th>
                  <th className="p-3 text-left">Batch / Exp</th>
                  <th className="p-3 text-right">Qty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {rows.map((r, i) => (
                  <tr key={`${r.saleId}-${i}`}>
                    <td className="p-3 whitespace-nowrap">{r.dispensedAt}</td>
                    <td className="p-3 font-mono text-xs">{r.invoiceNo}</td>
                    <td className="p-3">
                      <div className="font-medium text-ink-900">{r.patientName}</div>
                      {r.patientPhone && <div className="text-xs text-ink-500">{r.patientPhone}</div>}
                    </td>
                    <td className="p-3">
                      <div>{r.doctorName || "—"}</div>
                      {r.doctorRegNo && <div className="text-xs text-ink-500">{r.doctorRegNo}</div>}
                    </td>
                    <td className="p-3">
                      <div className="font-medium text-ink-900">{r.medicineName}</div>
                      <div className="text-xs text-ink-500">{r.genericName}</div>
                    </td>
                    <td className="p-3 font-mono text-xs">
                      {r.batchNo} · {r.expiryDate}
                    </td>
                    <td className="p-3 text-right font-mono font-semibold">{r.qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
