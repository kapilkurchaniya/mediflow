"use client";

import { useState } from "react";
import {
  Users,
  Download,
  Search,
  Filter,
  DollarSign,
  TrendingUp,
  Building,
  UserCheck,
  Calendar,
} from "lucide-react";
import Link from "next/link";
import clsx from "clsx";

interface CommissionRow {
  saleId: string;
  invoiceNo: string | null;
  totalAmount: number | null;
  doctorName: string | null;
  customerName: string | null;
  createdAt: Date;
  repId: string;
  repName: string;
  companyName: string | null;
  commissionRateBp: number;
  commissionPaise: number;
}

interface MedicalRep {
  id: string;
  name: string;
  companyName: string | null;
  commissionRateBp: number;
}

export function CommissionReportClient({
  initialRows,
  reps,
}: {
  initialRows: CommissionRow[];
  reps: MedicalRep[];
}) {
  const [rows, setRows] = useState(initialRows);
  const [selectedRep, setSelectedRep] = useState("all");
  const [search, setSearch] = useState("");

  const filtered = rows.filter((r) => {
    if (selectedRep !== "all" && r.repId !== selectedRep) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        r.repName.toLowerCase().includes(q) ||
        (r.doctorName && r.doctorName.toLowerCase().includes(q)) ||
        (r.companyName && r.companyName.toLowerCase().includes(q)) ||
        (r.invoiceNo && r.invoiceNo.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const totalSalesPaise = filtered.reduce((acc, r) => acc + (r.totalAmount || 0), 0);
  const totalCommissionPaise = filtered.reduce((acc, r) => acc + r.commissionPaise, 0);
  const totalBills = filtered.length;

  const exportCSV = () => {
    const headers = ["Invoice No", "Date", "Medical Rep / Doctor", "Pharma Company", "Sale Amount (INR)", "Commission Rate %", "Commission Payable (INR)"];
    const csvLines = [headers.join(",")];

    for (const r of filtered) {
      csvLines.push(
        [
          `"${r.invoiceNo || ""}"`,
          `"${new Date(r.createdAt).toLocaleDateString("en-IN")}"`,
          `"${r.repName}"`,
          `"${r.companyName || ""}"`,
          (r.totalAmount ? r.totalAmount / 100 : 0).toFixed(2),
          (r.commissionRateBp / 100).toFixed(2),
          (r.commissionPaise / 100).toFixed(2),
        ].join(",")
      );
    }

    const blob = new Blob([csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mr_commission_report_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="text-xs text-ink-500 font-medium">Total Commission Payable</div>
          <div className="text-xl font-bold text-ink-900 mt-1 num font-mono">
            ₹{(totalCommissionPaise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-primary-600 mt-1 flex items-center gap-1 font-medium">
            <DollarSign className="h-3 w-3" /> Across {totalBills} linked prescriptions
          </div>
        </div>

        <div className="card p-4">
          <div className="text-xs text-ink-500 font-medium">Total Driven Sales Volume</div>
          <div className="text-xl font-bold text-ink-900 mt-1 num font-mono">
            ₹{(totalSalesPaise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-emerald-600 mt-1 flex items-center gap-1">
            <TrendingUp className="h-3 w-3" /> Generated revenue
          </div>
        </div>

        <div className="card p-4">
          <div className="text-xs text-ink-500 font-medium">Avg Effective Commission</div>
          <div className="text-xl font-bold text-ink-900 mt-1 num font-mono">
            {totalSalesPaise > 0 ? ((totalCommissionPaise / totalSalesPaise) * 100).toFixed(2) : "0.00"}%
          </div>
          <div className="text-[11px] text-ink-400 mt-1">Blended payout rate</div>
        </div>

        <div className="card p-4">
          <div className="text-xs text-ink-500 font-medium">Registered Medical Reps</div>
          <div className="text-xl font-bold text-ink-900 mt-1">{reps.length}</div>
          <div className="text-[11px] text-ink-500 mt-1">
            <Link href="/dashboard/settings/medical-reps" className="text-primary-600 hover:underline">
              Manage Rep Directory →
            </Link>
          </div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={selectedRep}
            onChange={(e) => setSelectedRep(e.target.value)}
            className="input input-sm"
          >
            <option value="all">All Medical Reps & Doctors</option>
            {reps.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} {r.companyName ? `(${r.companyName})` : ""}
              </option>
            ))}
          </select>

          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
            <input
              type="text"
              placeholder="Search rep, doctor, company…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input input-sm pl-9 w-full"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={exportCSV}
          className="btn btn-secondary btn-sm shrink-0"
        >
          <Download className="h-4 w-4" /> Export CSV
        </button>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Invoice & Date</th>
                <th>Medical Representative</th>
                <th>Pharma Company</th>
                <th>Prescribing Doctor</th>
                <th className="text-right">Sale Amount (₹)</th>
                <th className="text-right">Commission Rate</th>
                <th className="text-right">Commission (₹)</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-ink-400">
                    No completed sales linked to medical representatives found.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.saleId}>
                    <td>
                      <div className="font-mono text-xs font-semibold text-ink-900">
                        {r.invoiceNo || "INV-DRAFT"}
                      </div>
                      <div className="text-[11px] text-ink-400">
                        {new Date(r.createdAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </div>
                    </td>
                    <td>
                      <div className="font-medium text-[13px] text-ink-900 flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 text-primary-600" />
                        {r.repName}
                      </div>
                    </td>
                    <td>
                      <div className="text-xs text-ink-600 flex items-center gap-1">
                        <Building className="h-3 w-3 text-ink-400" />
                        {r.companyName || "Independent"}
                      </div>
                    </td>
                    <td>
                      <span className="text-xs text-ink-700">
                        {r.doctorName || "—"}
                      </span>
                    </td>
                    <td className="text-right font-mono text-xs text-ink-900 font-semibold">
                      ₹{((r.totalAmount || 0) / 100).toFixed(2)}
                    </td>
                    <td className="text-right font-mono text-xs text-ink-600">
                      {(r.commissionRateBp / 100).toFixed(2)}%
                    </td>
                    <td className="text-right font-mono text-xs text-emerald-600 font-bold">
                      ₹{(r.commissionPaise / 100).toFixed(2)}
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
