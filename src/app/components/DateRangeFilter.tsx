"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useMemo } from "react";
import { Calendar } from "lucide-react";
import clsx from "clsx";

const PRESETS = [
  { label: "Today", key: "today" },
  { label: "Yesterday", key: "yesterday" },
  { label: "Last 7 days", key: "7d" },
  { label: "Last 30 days", key: "30d" },
  { label: "This month", key: "month" },
  { label: "Last month", key: "last-month" },
  { label: "This quarter", key: "quarter" },
  { label: "This year", key: "year" },
  { label: "All time", key: "all" },
] as const;

export type PresetKey = (typeof PRESETS)[number]["key"];

/**
 * Resolves a preset key to a { from, to } date pair (YYYY-MM-DD strings).
 * "All time" returns null dates.
 */
export function resolvePreset(key: string): { from: string | null; to: string | null } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();

  function fmt(dt: Date) {
    return dt.toISOString().split("T")[0];
  }

  switch (key) {
    case "today":
      return { from: fmt(new Date(y, m, d)), to: fmt(new Date(y, m, d)) };
    case "yesterday": {
      const yd = new Date(y, m, d - 1);
      return { from: fmt(yd), to: fmt(yd) };
    }
    case "7d":
      return { from: fmt(new Date(y, m, d - 6)), to: fmt(now) };
    case "30d":
      return { from: fmt(new Date(y, m, d - 29)), to: fmt(now) };
    case "month":
      return { from: fmt(new Date(y, m, 1)), to: fmt(now) };
    case "last-month":
      return { from: fmt(new Date(y, m - 1, 1)), to: fmt(new Date(y, m, 0)) };
    case "quarter": {
      const qStart = new Date(y, Math.floor(m / 3) * 3, 1);
      return { from: fmt(qStart), to: fmt(now) };
    }
    case "year":
      return { from: fmt(new Date(y, 0, 1)), to: fmt(now) };
    case "all":
    default:
      return { from: null, to: null };
  }
}

/**
 * Client-side date range filter with preset chips + custom date inputs.
 * Works via URL search params — no client state needed on the page component.
 */
export function DateRangeFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activePreset = searchParams.get("range") || "all";
  const customFrom = searchParams.get("from") || "";
  const customTo = searchParams.get("to") || "";
  const isCustom = activePreset === "custom";

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v === null || v === "") params.delete(k);
        else params.set(k, v);
      }
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams],
  );

  const handlePreset = useCallback(
    (key: string) => {
      if (key === "all") {
        updateParams({ range: null, from: null, to: null });
      } else {
        updateParams({ range: key, from: null, to: null });
      }
    },
    [updateParams],
  );

  const handleCustomDate = useCallback(
    (field: "from" | "to", value: string) => {
      updateParams({ range: "custom", [field]: value });
    },
    [updateParams],
  );


  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
      {/* Preset chips */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <Calendar className="h-4 w-4 text-ink-400 mr-1 shrink-0" />
        {PRESETS.map((preset) => (
          <button
            key={preset.key}
            type="button"
            onClick={() => handlePreset(preset.key)}
            className={clsx(
              "rounded-md px-2.5 py-1 text-[12px] font-medium transition-all duration-150",
              activePreset === preset.key && !isCustom
                ? "bg-brand-500 text-white shadow-sm"
                : "bg-ink-50 text-ink-600 hover:bg-ink-100 hover:text-ink-800 border border-ink-150",
            )}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Custom date inputs */}
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={isCustom ? customFrom : ""}
          onChange={(e) => handleCustomDate("from", e.target.value)}
          className="input !h-7 !text-[12px] !w-[130px] !px-2"
          aria-label="From date"
        />
        <span className="text-[12px] text-ink-400">to</span>
        <input
          type="date"
          value={isCustom ? customTo : ""}
          onChange={(e) => handleCustomDate("to", e.target.value)}
          className="input !h-7 !text-[12px] !w-[130px] !px-2"
          aria-label="To date"
        />
      </div>
    </div>
  );
}
