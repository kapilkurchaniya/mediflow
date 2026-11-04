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
    <div className="page space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/dashboard/inventory"
              className="inline-flex items-center gap-1 text-xs text-ink-500 hover:text-ink-900 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Inventory Hub
            </Link>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-ink-900 flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6 text-brand-600" />
            Physical Stocktake & Rack Audits
          </h1>
          <p className="text-xs sm:text-sm text-ink-500 mt-1 max-w-2xl">
            Conduct store-wide or rack-by-rack physical counts with Blind Count Mode, identify shelf
            variances, and post balanced accounting adjustments.
          </p>
        </div>

        <Link
          href="/dashboard/inventory/stocktake/new"
          className="btn btn-primary self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          New Audit Session
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-5">
          <div className="flex items-center justify-between text-ink-500 mb-2">
            <span className="eyebrow">In Progress</span>
            <div className="p-2 rounded-lg bg-sky-50 text-sky-600">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-ink-900 num">
            {inProgressCount}
          </div>
          <div className="mt-1 text-xs text-ink-500">
            Active count sessions being recorded
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between text-ink-500 mb-2">
            <span className="eyebrow">Under Review</span>
            <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-amber-600 num">
            {underReviewCount}
          </div>
          <div className="mt-1 text-xs text-ink-500">
            Counts submitted; awaiting owner sign-off
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between text-ink-500 mb-2">
            <span className="eyebrow">Reconciled Audits</span>
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-600 num">
            {approvedCount}
          </div>
          <div className="mt-1 text-xs text-ink-500">
            Adjusted in inventory & GL journal
          </div>
        </div>
      </div>

      {/* Sessions Table */}
      <div className="card overflow-hidden">
        {sessions.length === 0 ? (
          <div className="p-12 text-center">
            <ClipboardCheck className="w-10 h-10 text-ink-400 mx-auto mb-2" />
            <h3 className="text-sm font-semibold text-ink-900">
              No Stock Audit Sessions Yet
            </h3>
            <p className="text-xs text-ink-500 mt-1 max-w-sm mx-auto">
              Start your first physical stock count by clicking &quot;New Audit Session&quot;.
            </p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Session #</th>
                <th>Branch</th>
                <th>Scope</th>
                <th>Blind Count</th>
                <th>Started Date</th>
                <th>Status</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td className="font-bold text-brand-700 font-mono">
                    {s.sessionNo}
                  </td>
                  <td className="font-medium text-ink-900">
                    {s.storeName} ({s.storeCode})
                  </td>
                  <td>
                    <span className="capitalize font-medium text-ink-800">
                      {s.scope === "full_store" ? "Store-Wide Count" : `${s.rackIds?.length || 0} Racks`}
                    </span>
                  </td>
                  <td>
                    {s.blindCount ? (
                      <span className="badge badge-info text-[10.5px]">
                        Blind Mode On
                      </span>
                    ) : (
                      <span className="text-[11px] text-ink-400">Standard</span>
                    )}
                  </td>
                  <td className="text-ink-500">
                    {new Date(s.createdAt).toLocaleDateString()}
                  </td>
                  <td>
                    <span
                      className={
                        s.status === "approved"
                          ? "badge badge-success uppercase text-[10px]"
                          : s.status === "under_review"
                          ? "badge badge-warning uppercase text-[10px]"
                          : s.status === "in_progress"
                          ? "badge badge-info uppercase text-[10px]"
                          : "badge badge-neutral uppercase text-[10px]"
                      }
                    >
                      {s.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="text-right">
                    <Link
                      href={`/dashboard/inventory/stocktake/${s.id}`}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700"
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
