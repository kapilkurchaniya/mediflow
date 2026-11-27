"use client";

import React, { useEffect, useState } from "react";
import { Building2, RefreshCw, Stethoscope, Users } from "lucide-react";
import { getPatientDoctorSalesAction } from "@/app/actions/pharmacy-reports";
import type { PatientDoctorReportResult } from "@/server/domain/reports/patient-doctor";
import { formatINR } from "@/lib/format";

export default function PatientDoctorReportPage() {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 7)}-01`;
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [tab, setTab] = useState<"patients" | "doctors" | "doctorCompanies">("patients");
  const [data, setData] = useState<PatientDoctorReportResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await getPatientDoctorSalesAction({ from, to });
      if (res.success && res.data) {
        setData(res.data);
      } else if (!res.success) {
        setError(res.error || "Failed to load patient/doctor report.");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load patient/doctor report.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    getPatientDoctorSalesAction({ from, to })
      .then((res) => {
        if (!active) return;
        if (res.success && res.data) {
          setData(res.data);
        } else if (!res.success) {
          setError(res.error || "Failed to load patient/doctor report.");
        }
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load patient/doctor report.");
        setLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="page space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ink-200 pb-4">
        <div>
          <h1 className="text-xl font-bold text-ink-900">Patient-wise & Doctor-wise Sales Analytics</h1>
          <p className="text-xs text-ink-500">
            Patient purchase history, prescriber-wise volume, and Doctor × Company breakdown.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" className="input w-auto" value={from} onChange={(e) => setFrom(e.target.value)} />
          <input type="date" className="input w-auto" value={to} onChange={(e) => setTo(e.target.value)} />
          <button type="button" onClick={load} disabled={loading} className="btn btn-primary btn-sm">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">{error}</div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab("patients")}
          className={`btn btn-sm ${tab === "patients" ? "btn-primary" : "btn-ghost"}`}
        >
          <Users className="w-4 h-4" /> Patient-wise ({data?.patients.length ?? 0})
        </button>
        <button
          type="button"
          onClick={() => setTab("doctors")}
          className={`btn btn-sm ${tab === "doctors" ? "btn-primary" : "btn-ghost"}`}
        >
          <Stethoscope className="w-4 h-4" /> Doctor-wise ({data?.doctors.length ?? 0})
        </button>
        <button
          type="button"
          onClick={() => setTab("doctorCompanies")}
          className={`btn btn-sm ${tab === "doctorCompanies" ? "btn-primary" : "btn-ghost"}`}
        >
          <Building2 className="w-4 h-4" /> Doctor × Company ({data?.doctorCompanies.length ?? 0})
        </button>
      </div>

      <div className="card overflow-hidden">
        {tab === "patients" && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-ink-50 text-xs uppercase text-ink-500">
                <tr>
                  <th className="p-3 text-left">Patient</th>
                  <th className="p-3 text-left">Phone</th>
                  <th className="p-3 text-right">Bills</th>
                  <th className="p-3 text-right">Units</th>
                  <th className="p-3 text-right">Total Sales</th>
                  <th className="p-3 text-right">Credit Due</th>
                  <th className="p-3 text-left">Last Visit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {(data?.patients ?? []).map((p) => (
                  <tr key={p.patientKey}>
                    <td className="p-3 font-medium text-ink-900">{p.patientName}</td>
                    <td className="p-3 text-ink-500">{p.patientPhone || "—"}</td>
                    <td className="p-3 text-right font-mono">{p.billCount}</td>
                    <td className="p-3 text-right font-mono">{p.totalQty}</td>
                    <td className="p-3 text-right font-mono font-semibold">{formatINR(p.totalAmountPaise)}</td>
                    <td className="p-3 text-right font-mono text-rose-600">{formatINR(p.creditAmountPaise)}</td>
                    <td className="p-3 text-ink-600">{p.lastVisitDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "doctors" && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-ink-50 text-xs uppercase text-ink-500">
                <tr>
                  <th className="p-3 text-left">Doctor Name</th>
                  <th className="p-3 text-left">Reg No</th>
                  <th className="p-3 text-right">Rx Bills</th>
                  <th className="p-3 text-right">Unique Patients</th>
                  <th className="p-3 text-right">Units</th>
                  <th className="p-3 text-right">Total Sales</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {(data?.doctors ?? []).map((d) => (
                  <tr key={d.doctorName}>
                    <td className="p-3 font-medium text-ink-900">{d.doctorName}</td>
                    <td className="p-3 text-ink-500 font-mono text-xs">{d.doctorRegNo || "—"}</td>
                    <td className="p-3 text-right font-mono">{d.rxCount}</td>
                    <td className="p-3 text-right font-mono">{d.uniquePatients}</td>
                    <td className="p-3 text-right font-mono">{d.totalQty}</td>
                    <td className="p-3 text-right font-mono font-semibold">{formatINR(d.totalAmountPaise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "doctorCompanies" && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-ink-50 text-xs uppercase text-ink-500">
                <tr>
                  <th className="p-3 text-left">Doctor Name</th>
                  <th className="p-3 text-left">Company / Manufacturer</th>
                  <th className="p-3 text-right">Rx Lines</th>
                  <th className="p-3 text-right">Units</th>
                  <th className="p-3 text-right">Total Sales</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {(data?.doctorCompanies ?? []).map((dc, i) => (
                  <tr key={`${dc.doctorName}-${dc.manufacturer}-${i}`}>
                    <td className="p-3 font-medium text-ink-900">{dc.doctorName}</td>
                    <td className="p-3 text-ink-700">{dc.manufacturer}</td>
                    <td className="p-3 text-right font-mono">{dc.rxLineCount}</td>
                    <td className="p-3 text-right font-mono">{dc.totalQty}</td>
                    <td className="p-3 text-right font-mono font-semibold">{formatINR(dc.totalAmountPaise)}</td>
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
