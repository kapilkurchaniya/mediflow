"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Building2, Plus, Search, Store, CheckCircle2 } from "lucide-react";
import { StatCard } from "@/app/components/ui";
import { StoreTable, type StoreRow } from "./_components/StoreTable";

export function StoresClient({ initialStores }: { initialStores: StoreRow[] }) {
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | "retail" | "warehouse">("all");

  const filteredStores = useMemo(() => {
    return initialStores.filter((s) => {
      if (kindFilter !== "all" && s.kind !== kindFilter) return false;
      if (search.trim()) {
        const query = search.toLowerCase().trim();
        return (
          s.name.toLowerCase().includes(query) ||
          s.code.toLowerCase().includes(query) ||
          (s.city && s.city.toLowerCase().includes(query)) ||
          (s.gstin && s.gstin.toLowerCase().includes(query))
        );
      }
      return true;
    });
  }, [initialStores, kindFilter, search]);

  const stats = useMemo(() => {
    const total = initialStores.length;
    const retail = initialStores.filter((s) => s.kind === "retail").length;
    const warehouse = initialStores.filter((s) => s.kind === "warehouse").length;
    const active = initialStores.filter((s) => s.isActive).length;
    return { total, retail, warehouse, active };
  }, [initialStores]);

  return (
    <div className="space-y-6">
      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Facilities"
          value={stats.total}
          icon={Store}
          footnote="All registered locations"
        />
        <StatCard
          label="Retail Branches"
          value={stats.retail}
          icon={Store}
          tone="brand"
          footnote="POS billing enabled"
        />
        <StatCard
          label="Warehouses"
          value={stats.warehouse}
          icon={Building2}
          tone="info"
          footnote="Central distribution godowns"
        />
        <StatCard
          label="Active Locations"
          value={stats.active}
          icon={CheckCircle2}
          tone="brand"
          footnote={`${stats.total - stats.active} inactive`}
        />
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 p-1 bg-ink-100 rounded-lg">
          <button
            type="button"
            onClick={() => setKindFilter("all")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              kindFilter === "all" ? "bg-white text-ink-900 shadow-sm" : "text-ink-600 hover:text-ink-900"
            }`}
          >
            All Locations ({stats.total})
          </button>
          <button
            type="button"
            onClick={() => setKindFilter("retail")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              kindFilter === "retail" ? "bg-white text-ink-900 shadow-sm" : "text-ink-600 hover:text-ink-900"
            }`}
          >
            Retail Branches ({stats.retail})
          </button>
          <button
            type="button"
            onClick={() => setKindFilter("warehouse")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              kindFilter === "warehouse" ? "bg-white text-ink-900 shadow-sm" : "text-ink-600 hover:text-ink-900"
            }`}
          >
            Warehouses ({stats.warehouse})
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1 sm:w-64">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, code, GSTIN..."
              className="input pl-9 text-xs w-full py-1.5"
            />
          </div>

          <Link href="/dashboard/settings/stores/new" className="btn btn-primary inline-flex items-center gap-1.5 shrink-0 text-xs">
            <Plus className="h-4 w-4" /> Add Location
          </Link>
        </div>
      </div>

      {/* Table Component */}
      <StoreTable stores={filteredStores} />
    </div>
  );
}
