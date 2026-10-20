"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import {
  ShieldAlert,
  Download,
  Search,
  Filter,
  FileCheck,
  Stethoscope,
  FileText,
  AlertTriangle,
  User,
  Calendar,
  Building,
  CheckCircle2,
  Clock,
  Printer,
} from "lucide-react";
import { PageHeader, StatCard, EmptyState } from "@/app/components/ui";
import { exportRegisterCsvData, getDispensingLogs } from "@/app/actions/compliance";
import type { StatutoryRegisterType } from "@/server/domain/compliance";

interface ComplianceStats {
  last30Days: {
    schedule_h: number;
    schedule_h1: number;
    schedule_x: number;
    narcotics: number;
    totalControlled: number;
  };
  activePrescriptions: number;
}

interface DispensingLogRow {
  log: {
    id: string;
    saleId: string;
    medicineName: string;
    batchNo: string;
    expiryDate: string;
    schedule: string;
    patientName: string;
    patientAge: number | null;
    patientGender: string | null;
    patientAddress: string | null;
    patientPhone: string | null;
    doctorName: string;
    doctorRegNo: string | null;
    doctorAddress: string | null;
    prescriptionRef: string | null;
    prescriptionDate: string | null;
    quantityDispensed: number;
    pharmacistName: string | null;
    pharmacistRegNo: string | null;
    statutoryRegister: string;
    dispensedAt: Date;
    notes: string | null;
  };
  sale: {
    invoiceNo: string | null;
    createdAt: Date;
  };
}

export function ComplianceRegisterView({
  initialStats,
  initialLogs,
  defaultRegister,
}: {
  initialStats: ComplianceStats;
  initialLogs: DispensingLogRow[];
  defaultRegister?: StatutoryRegisterType | "all";
}) {
  const [activeTab, setActiveTab] = useState<StatutoryRegisterType | "all">(
    defaultRegister ?? "all"
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [logs, setLogs] = useState<DispensingLogRow[]>(initialLogs);
  const [isPending, startTransition] = useTransition();
  const [isExporting, setIsExporting] = useState(false);

  const handleFilter = () => {
    startTransition(async () => {
      const regType = activeTab === "all" ? undefined : activeTab;
      const res = await getDispensingLogs({
        registerType: regType,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        searchQuery: searchQuery || undefined,
      });
      setLogs(res as unknown as DispensingLogRow[]);
    });
  };

  const handleTabChange = (tab: StatutoryRegisterType | "all") => {
    setActiveTab(tab);
    startTransition(async () => {
      const regType = tab === "all" ? undefined : tab;
      const res = await getDispensingLogs({
        registerType: regType,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        searchQuery: searchQuery || undefined,
      });
      setLogs(res as unknown as DispensingLogRow[]);
    });
  };

  const handleExportCsv = async () => {
    setIsExporting(true);
    try {
      const targetReg = activeTab === "all" ? "schedule_h1" : activeTab;
      const res = await exportRegisterCsvData({
        registerType: targetReg,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });

      if (res.success && res.csvContent) {
        const blob = new Blob([res.csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `Statutory_${targetReg}_Register_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } finally {
      setIsExporting(false);
    }
  };

  const getScheduleBadge = (schedule: string) => {
    const s = schedule.toUpperCase();
    if (s === "H1") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
          <AlertTriangle className="h-3 w-3" /> Schedule H1
        </span>
      );
    }
    if (s === "H") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-300">
          Schedule H
        </span>
      );
    }
    if (s === "X") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-800 border border-purple-300">
          Schedule X
        </span>
      );
    }
    if (s === "NARCOTIC") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-900 border border-red-400">
          NDPS / Narcotic
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700">
        {schedule}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Statutory Compliance • Drugs & Cosmetics Act"
        title="Drug Dispensing Registers"
        description="Statutory inspection registers for Schedule H, Schedule H1 (Form 35), Schedule X, and Narcotics with 3-year audit trail."
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/compliance/prescriptions"
              className="btn btn-secondary text-[13px] flex items-center gap-1.5"
            >
              <FileText className="h-4 w-4" />
              Prescriptions (Rx)
            </Link>
            <Link
              href="/dashboard/compliance/doctors"
              className="btn btn-secondary text-[13px] flex items-center gap-1.5"
            >
              <Stethoscope className="h-4 w-4" />
              Doctor Registry
            </Link>
            <button
              onClick={handleExportCsv}
              disabled={isExporting}
              className="btn btn-secondary text-[13px] flex items-center gap-1.5"
              title="Download statutory inspection CSV format required by State Drug Control Administration"
            >
              <Download className="h-4 w-4" />
              {isExporting ? "Generating CSV..." : "Export CSV"}
            </button>
            <Link
              href={`/dashboard/compliance/${(activeTab === "all" ? "schedule-h1" : activeTab).replace("_", "-")}/print${dateFrom || dateTo ? `?dateFrom=${dateFrom}&dateTo=${dateTo}` : ""}`}
              target="_blank"
              className="btn btn-primary text-[13px] flex items-center gap-1.5"
              title="Open inspector-ready printable statutory register"
            >
              <Printer className="h-4 w-4" />
              Print Register
            </Link>
          </div>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Schedule H1 Dispensed"
          value={initialStats.last30Days.schedule_h1}
          footnote="Mandatory Form 35 register (3 yr retention)"
          tone={initialStats.last30Days.schedule_h1 > 0 ? "danger" : "neutral"}
          icon={AlertTriangle}
        />
        <StatCard
          label="Schedule H Dispensed"
          value={initialStats.last30Days.schedule_h}
          footnote="Prescription drug supply log"
          tone="warning"
          icon={ShieldAlert}
        />
        <StatCard
          label="Schedule X & Narcotics"
          value={initialStats.last30Days.schedule_x + initialStats.last30Days.narcotics}
          footnote="NDPS special audit trail"
          tone={initialStats.last30Days.narcotics > 0 ? "danger" : "neutral"}
          icon={FileCheck}
        />
        <StatCard
          label="Active Prescriptions"
          value={initialStats.activePrescriptions}
          footnote="Available for digital refilling"
          tone="brand"
          icon={FileText}
        />
      </div>

      {/* Register Tab Navigation */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-ink-150 pb-2">
        <div className="flex items-center gap-1 overflow-x-auto">
          <button
            onClick={() => handleTabChange("all")}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
              activeTab === "all"
                ? "bg-ink-900 text-white"
                : "text-ink-600 hover:bg-ink-100 hover:text-ink-900"
            }`}
          >
            All Controlled ({initialStats.last30Days.totalControlled})
          </button>
          <button
            onClick={() => handleTabChange("schedule_h1")}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === "schedule_h1"
                ? "bg-rose-700 text-white"
                : "text-rose-700 hover:bg-rose-50"
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            Schedule H1 Register ({initialStats.last30Days.schedule_h1})
          </button>
          <button
            onClick={() => handleTabChange("schedule_h")}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
              activeTab === "schedule_h"
                ? "bg-amber-600 text-white"
                : "text-amber-800 hover:bg-amber-50"
            }`}
          >
            Schedule H Register ({initialStats.last30Days.schedule_h})
          </button>
          <button
            onClick={() => handleTabChange("narcotics")}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
              activeTab === "narcotics"
                ? "bg-red-800 text-white"
                : "text-red-800 hover:bg-red-50"
            }`}
          >
            NDPS Narcotics ({initialStats.last30Days.narcotics})
          </button>
          <button
            onClick={() => handleTabChange("schedule_x")}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
              activeTab === "schedule_x"
                ? "bg-purple-700 text-white"
                : "text-purple-700 hover:bg-purple-50"
            }`}
          >
            Schedule X ({initialStats.last30Days.schedule_x})
          </button>
        </div>

        {/* Date & Filter controls */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="input text-xs py-1 px-2.5 h-8 w-32"
            title="From date"
          />
          <span className="text-ink-400 text-xs">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="input text-xs py-1 px-2.5 h-8 w-32"
            title="To date"
          />
          <div className="relative">
            <input
              type="text"
              placeholder="Search patient, doctor, batch..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleFilter()}
              className="input text-xs py-1 pl-7 pr-2.5 h-8 w-48"
            />
            <Search className="h-3.5 w-3.5 text-ink-400 absolute left-2 top-2.5" />
          </div>
          <button
            onClick={handleFilter}
            disabled={isPending}
            className="btn btn-secondary text-xs h-8 px-2.5"
          >
            {isPending ? "Filtering..." : "Filter"}
          </button>
        </div>
      </div>

      {/* Statutory Register Banner */}
      {activeTab === "schedule_h1" && (
        <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-4 text-xs text-rose-900 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-rose-950">Statutory Notice under Rule 65 (D&C Rules, 1945):</span>
            <p className="mt-0.5 text-rose-800 leading-relaxed">
              Supply of Schedule H1 drugs (3rd gen cephalosporins, anti-TB, psychotropics) requires recording:
              Date of supply, Patient name & address, Prescriber name, address & Reg No, Drug name, Qty, Batch No, and Manufacturer.
              This register must be retained for <strong>at least 3 years</strong> and made available for Drug Inspector verification.
            </p>
          </div>
        </div>
      )}

      {/* Main Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-ink-50/70 text-ink-600 font-semibold border-b border-ink-150 uppercase tracking-wider text-[11px]">
                <th className="py-3 px-3">Date & Bill</th>
                <th className="py-3 px-3">Medicine & Batch</th>
                <th className="py-3 px-2 text-center">Schedule</th>
                <th className="py-3 px-3">Qty</th>
                <th className="py-3 px-3">Patient Details</th>
                <th className="py-3 px-3">Prescribing Doctor</th>
                <th className="py-3 px-3">Pharmacist Sign</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 text-ink-800">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center">
                    <EmptyState
                      icon={ShieldAlert}
                      title="No register entries found"
                      description="No controlled medicines have been billed under this register criteria yet."
                    />
                  </td>
                </tr>
              ) : (
                logs.map((row) => (
                  <tr key={row.log.id} className="hover:bg-ink-50/50 transition-colors">
                    {/* Date & Bill */}
                    <td className="py-3 px-3 align-top">
                      <div className="font-medium text-ink-900">
                        {row.log.dispensedAt
                          ? new Date(row.log.dispensedAt).toLocaleDateString("en-IN", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })
                          : "—"}
                      </div>
                      <div className="text-[11px] text-ink-500 flex items-center gap-1 mt-0.5">
                        <Clock className="h-3 w-3" />
                        {row.log.dispensedAt
                          ? new Date(row.log.dispensedAt).toLocaleTimeString("en-IN", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : ""}
                      </div>
                      {row.sale.invoiceNo && (
                        <Link
                          href={`/dashboard/sales/${row.log.saleId}`}
                          className="text-[11px] font-mono text-brand-600 hover:underline mt-1 inline-block"
                        >
                          {row.sale.invoiceNo}
                        </Link>
                      )}
                    </td>

                    {/* Medicine & Batch */}
                    <td className="py-3 px-3 align-top max-w-[200px]">
                      <div className="font-semibold text-ink-950 truncate" title={row.log.medicineName}>
                        {row.log.medicineName}
                      </div>
                      <div className="text-[11px] text-ink-500 mt-0.5">
                        Batch: <span className="font-mono text-ink-700">{row.log.batchNo}</span>
                      </div>
                      <div className="text-[11px] text-ink-500">
                        Exp: <span className="font-mono text-ink-700">{row.log.expiryDate}</span>
                      </div>
                    </td>

                    {/* Schedule */}
                    <td className="py-3 px-2 align-top text-center">
                      {getScheduleBadge(row.log.schedule)}
                    </td>

                    {/* Qty */}
                    <td className="py-3 px-3 align-top font-bold text-ink-900">
                      {row.log.quantityDispensed} units
                    </td>

                    {/* Patient Details */}
                    <td className="py-3 px-3 align-top max-w-[220px]">
                      <div className="font-medium text-ink-950 flex items-center gap-1">
                        <User className="h-3 w-3 text-ink-400" />
                        {row.log.patientName}
                        {row.log.patientAge && (
                          <span className="text-ink-400 text-[11px]">({row.log.patientAge}y)</span>
                        )}
                      </div>
                      {row.log.patientAddress ? (
                        <div className="text-[11px] text-ink-600 mt-0.5 line-clamp-2" title={row.log.patientAddress}>
                          {row.log.patientAddress}
                        </div>
                      ) : (
                        <div className="text-[11px] text-amber-600 italic">No address recorded</div>
                      )}
                      {row.log.patientPhone && (
                        <div className="text-[10px] text-ink-400 mt-0.5">Ph: {row.log.patientPhone}</div>
                      )}
                    </td>

                    {/* Prescribing Doctor */}
                    <td className="py-3 px-3 align-top max-w-[220px]">
                      <div className="font-medium text-ink-950 flex items-center gap-1">
                        <Stethoscope className="h-3 w-3 text-brand-600" />
                        {row.log.doctorName}
                      </div>
                      {row.log.doctorRegNo ? (
                        <div className="text-[11px] text-ink-600 mt-0.5 font-mono">
                          Reg: <span className="text-ink-900 font-semibold">{row.log.doctorRegNo}</span>
                        </div>
                      ) : (
                        <div className="text-[11px] text-rose-600 font-medium">Missing Reg No</div>
                      )}
                      {row.log.doctorAddress && (
                        <div className="text-[10px] text-ink-500 mt-0.5 truncate" title={row.log.doctorAddress}>
                          {row.log.doctorAddress}
                        </div>
                      )}
                    </td>

                    {/* Pharmacist Sign-off */}
                    <td className="py-3 px-3 align-top">
                      <div className="text-ink-900 font-medium flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                        {row.log.pharmacistName || "Dispensing Pharmacist"}
                      </div>
                      {row.log.pharmacistRegNo && (
                        <div className="text-[10px] font-mono text-ink-500 mt-0.5">
                          Lic: {row.log.pharmacistRegNo}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
