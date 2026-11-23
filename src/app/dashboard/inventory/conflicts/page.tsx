"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  AlertTriangle,
  RefreshCw,
  Search,
  Filter,
} from "lucide-react";
import { listStockConflictsAction } from "@/app/actions/conflicts";
import { ConflictSummaryCards } from "./ConflictSummaryCards";
import { ConflictActionsModal } from "./ConflictActionsModal";
import type { ConflictCaseItem } from "./types";

export default function StockConflictsPage() {
  const [conflicts, setConflicts] = useState<ConflictCaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedConflictId, setSelectedConflictId] = useState<string | null>(null);

  const fetchConflicts = useCallback(async (filter: string) => {
    setLoading(true);
    const res = await listStockConflictsAction(
      filter !== "all" ? { status: filter } : undefined,
    );
    if (res.success && res.data) {
      setConflicts(res.data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let ignore = false;
    listStockConflictsAction(statusFilter !== "all" ? { status: statusFilter } : undefined)
      .then((res) => {
        if (!ignore && res.success && res.data) {
          setConflicts(res.data);
        }
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [statusFilter]);

  const filteredConflicts = conflicts.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.medicineName.toLowerCase().includes(q) ||
      c.batchNo.toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q)
    );
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "open":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap shrink-0">
            Open
          </span>
        );
      case "investigating":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 whitespace-nowrap shrink-0">
            Investigating
          </span>
        );
      case "partially_resolved":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 whitespace-nowrap shrink-0">
            Partially Resolved
          </span>
        );
      case "resolved":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap shrink-0">
            Resolved
          </span>
        );
      case "dismissed":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-ink-100 text-ink-600 border border-ink-200 whitespace-nowrap shrink-0">
            Dismissed
          </span>
        );
      default:
        return <span className="text-xs">{status}</span>;
    }
  };

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
            <AlertTriangle className="w-6 h-6 text-amber-500" />
            Offline Sync Stock Conflicts
          </h1>
          <p className="text-xs text-ink-500 mt-1">
            Investigate, recount, and resolve negative ledger balances resulting from offline POS reconciliation.
          </p>
        </div>
        <button
          onClick={() => fetchConflicts(statusFilter)}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-ink-200 bg-white text-xs font-medium text-ink-700 hover:bg-ink-50 shadow-2xs transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* KPI Cards */}
      <ConflictSummaryCards conflicts={conflicts} />

      {/* Controls & Search */}
      <div className="card flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-xl border border-ink-150 shadow-2xs">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-ink-400" />
          <input
            type="text"
            placeholder="Search medicine or batch..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs pl-9 pr-3 py-2 rounded-lg border border-ink-200 bg-white text-ink-900 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          <Filter className="w-3.5 h-3.5 text-ink-400 shrink-0 ml-1" />
          {["all", "open", "investigating", "partially_resolved", "resolved", "dismissed"].map(
            (status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  statusFilter === status
                    ? "bg-ink-900 text-white shadow-2xs"
                    : "bg-ink-100 text-ink-600 hover:bg-ink-200"
                }`}
              >
                {status === "all" ? "All Cases" : status.replace("_", " ")}
              </button>
            ),
          )}
        </div>
      </div>

      {/* Conflicts Table */}
      <div className="card bg-white border border-ink-150 rounded-xl overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-ink-50 border-b border-ink-150 text-ink-500 font-medium">
              <tr>
                <th className="py-3 px-4">Medicine Name</th>
                <th className="py-3 px-4">Batch No</th>
                <th className="py-3 px-4">Expiry</th>
                <th className="py-3 px-4">Ledger Stock</th>
                <th className="py-3 px-4">Outstanding Deficit</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Opened At</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-ink-400">
                    Loading stock conflict cases...
                  </td>
                </tr>
              ) : filteredConflicts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-ink-400">
                    No conflict cases found.
                  </td>
                </tr>
              ) : (
                filteredConflicts.map((c) => (
                  <tr
                    key={c.id}
                    className="hover:bg-ink-50/60 transition-colors"
                  >
                    <td className="py-3 px-4 font-semibold text-ink-900">
                      {c.medicineName}
                    </td>
                    <td className="py-3 px-4 font-mono text-ink-600">
                      {c.batchNo}
                    </td>
                    <td className="py-3 px-4 text-ink-500">{c.expiryDate}</td>
                    <td className="py-3 px-4 font-bold">
                      <span className={c.qtyOnHand < 0 ? "text-rose-600" : "text-emerald-600"}>
                        {c.qtyOnHand}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-bold text-rose-600">{c.outstandingQty} units</td>
                    <td className="py-3 px-4">{getStatusBadge(c.status)}</td>
                    <td className="py-3 px-4 text-ink-400">
                      {new Date(c.openedAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => setSelectedConflictId(c.id)}
                        className="btn btn-primary btn-sm text-xs font-semibold"
                      >
                        Investigate / Resolve
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {selectedConflictId && (
        <ConflictActionsModal
          conflictCaseId={selectedConflictId}
          onClose={() => setSelectedConflictId(null)}
          onSuccess={() => {
            setSelectedConflictId(null);
            fetchConflicts(statusFilter);
          }}
        />
      )}
    </div>
  );
}
