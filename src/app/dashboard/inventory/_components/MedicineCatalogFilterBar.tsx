"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Filter, FlaskConical, MapPin, Tag, X } from "lucide-react";
import { MEDICINE_SEGMENTS } from "@/lib/inventory/medicine-segments";

export interface CatalogFilterProps {
  basePath: string;
  segment?: string;
  molecule?: string;
  categoryId?: string;
  rackId?: string;
  categories: Array<{ id: string; name: string }>;
  racks: Array<{ id: string; code: string; name: string }>;
  preservedParams?: Record<string, string | undefined>;
}

export function MedicineCatalogFilterBar({
  basePath,
  segment = "all",
  molecule = "",
  categoryId = "",
  rackId = "",
  categories,
  racks,
  preservedParams = {},
}: CatalogFilterProps) {
  const router = useRouter();
  const [molInput, setMolInput] = useState(molecule);

  const navigateWith = (overrides: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(preservedParams)) {
      if (v) params.set(k, v);
    }
    const nextSegment = overrides.segment !== undefined ? overrides.segment : segment;
    const nextMolecule = overrides.molecule !== undefined ? overrides.molecule : molInput.trim();
    const nextCategory = overrides.categoryId !== undefined ? overrides.categoryId : categoryId;
    const nextRack = overrides.rackId !== undefined ? overrides.rackId : rackId;

    if (nextSegment && nextSegment !== "all") params.set("segment", nextSegment);
    if (nextMolecule) params.set("molecule", nextMolecule);
    if (nextCategory) params.set("categoryId", nextCategory);
    if (nextRack) params.set("rackId", nextRack);

    const qs = params.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  };

  const hasActiveFilters =
    (segment && segment !== "all") || Boolean(molecule.trim()) || Boolean(categoryId) || Boolean(rackId);

  return (
    <div className="space-y-3 border-b border-ink-150 bg-ink-25/60 px-4 py-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-ink-500 mr-1">
          <Filter className="h-3.5 w-3.5" /> Segment:
        </span>
        <button
          type="button"
          onClick={() => navigateWith({ segment: "all" })}
          className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
            segment === "all"
              ? "bg-brand-600 text-white border-brand-600"
              : "bg-white text-ink-600 border-ink-200 hover:bg-ink-50"
          }`}
        >
          All
        </button>
        {MEDICINE_SEGMENTS.map((seg) => {
          const active = segment === seg.value;
          return (
            <button
              key={seg.value}
              type="button"
              onClick={() => navigateWith({ segment: seg.value })}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                active
                  ? "bg-brand-600 text-white border-brand-600"
                  : "bg-white text-ink-600 border-ink-200 hover:bg-ink-50"
              }`}
            >
              {seg.value === "kids" ? "Kids" : seg.value === "general" ? "General" : seg.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            navigateWith({ molecule: molInput.trim() });
          }}
          className="relative flex-1 min-w-[210px] max-w-xs"
        >
          <FlaskConical className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-400" />
          <input
            type="text"
            value={molInput}
            onChange={(e) => setMolInput(e.target.value)}
            placeholder="Filter by molecule / salt (Enter)..."
            className="input input-sm !pl-8 w-full text-xs"
          />
        </form>

        <div className="relative min-w-[170px]">
          <Tag className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-400" />
          <select
            aria-label="Filter by category"
            value={categoryId}
            onChange={(e) => navigateWith({ categoryId: e.target.value })}
            className="input input-sm !pl-8 text-xs"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="relative min-w-[180px]">
          <MapPin className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-400" />
          <select
            aria-label="Filter by rack or shelf"
            value={rackId}
            onChange={(e) => navigateWith({ rackId: e.target.value })}
            className="input input-sm !pl-8 text-xs"
          >
            <option value="">All Racks &amp; Shelves</option>
            {racks.map((r) => (
              <option key={r.id} value={r.id}>
                {r.code} — {r.name}
              </option>
            ))}
          </select>
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={() => {
              setMolInput("");
              navigateWith({ segment: "all", molecule: "", categoryId: "", rackId: "" });
            }}
            className="btn btn-ghost btn-sm text-xs text-rose-600 hover:bg-rose-50"
          >
            <X className="h-3.5 w-3.5" /> Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
