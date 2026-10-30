import React from "react";
import Link from "next/link";
import { listStockAuditSessionsAction } from "@/app/actions/stocktake";
import {
  ClipboardCheck,
  Plus,
  ArrowRight,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Layers,
  ShieldAlert,
} from "lucide-react";

export const metadata = {
  title: "Physical Stocktake & Rack Audits | MediFlow",
  description:
    "Schedule and perform physical shelf counts, rack audits in blind mode, and reconcile stock discrepancies with automated ledger adjustments.",
};

export default async function StocktakeListPage() {
  const sessions = await listStockAuditSessionsAction();

  const inProgressCount = sessions.filter((s) => s.status === "in_progress").length;
  const underReviewCount = sessions.filter((s) => s.status === "under_review").length;
  const approvedCount = sessions.filter((s) => s.status === "approved").length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/dashboard/inventory"
              className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Inventory Hub
            </Link>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6 text-teal-600 dark:text-teal-400" />
            Physical Stocktake & Rack Audits
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
            Conduct store-wide or rack-by-rack physical counts with Blind Count Mode, identify shelf
            variances, and post balanced accounting adjustments.
          </p>
        </div>

        <Link
          href="/dashboard/inventory/stocktake/new"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-medium text-xs shadow-xs transition-all cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          New Audit Session
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">In Progress</span>
            <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {inProgressCount}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Active count sessions being recorded
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Under Review</span>
            <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
            {underReviewCount}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Counts submitted; awaiting owner sign-off
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Reconciled Audits</span>
            <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {approvedCount}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Adjusted in inventory & GL journal
          </div>
        </div>
      </div>

      {/* Sessions Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
        {sessions.length === 0 ? (
          <div className="p-12 text-center">
            <ClipboardCheck className="w-10 h-10 text-slate-400 mx-auto mb-2" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              No Stock Audit Sessions Yet
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Start your first physical stock count by clicking &quot;New Audit Session&quot;.
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-950/70 border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="p-3">Session #</th>
                <th className="p-3">Branch</th>
                <th className="p-3">Scope</th>
                <th className="p-3">Blind Count</th>
                <th className="p-3">Started Date</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {sessions.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="p-3 font-bold text-teal-700 dark:text-teal-400">
                    {s.sessionNo}
                  </td>
                  <td className="p-3 font-medium text-slate-800 dark:text-slate-200">
                    {s.storeName} ({s.storeCode})
                  </td>
                  <td className="p-3">
                    <span className="capitalize font-semibold text-slate-700 dark:text-slate-300">
                      {s.scope === "full_store" ? "Store-Wide Count" : `${s.rackIds?.length || 0} Racks`}
                    </span>
                  </td>
                  <td className="p-3">
                    {s.blindCount ? (
                      <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 px-2 py-0.5 rounded-full">
                        Blind Mode On
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-400">Standard</span>
                    )}
                  </td>
                  <td className="p-3 text-slate-500">
                    {new Date(s.createdAt).toLocaleDateString()}
                  </td>
                  <td className="p-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                        s.status === "approved"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                          : s.status === "under_review"
                          ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                          : s.status === "in_progress"
                          ? "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300"
                          : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                      }`}
                    >
                      {s.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <Link
                      href={`/dashboard/inventory/stocktake/${s.id}`}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-teal-600 hover:text-teal-700 dark:text-teal-400"
                    >
                      {s.status === "in_progress" ? "Enter Counts" : "View Audit"}
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
