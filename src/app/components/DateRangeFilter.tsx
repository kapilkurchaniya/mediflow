"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";
import { Calendar } from "lucide-react";
import clsx from "clsx";
import { resolveDateRange } from "@/lib/date-range";

const PRESETS = [
  { label: "Today", key: "today", tip: "Filter records posted today (current calendar day)." },
  { label: "Yesterday", key: "yesterday", tip: "Filter records posted on the previous calendar day." },
  { label: "Last 7 days", key: "7d", tip: "Filter records from the past 7 rolling days." },
  { label: "Last 30 days", key: "30d", tip: "Filter records from the past 30 rolling days." },
  { label: "This month", key: "month", tip: "Filter records from the 1st of the current month through today." },
  { label: "Last month", key: "last-month", tip: "Filter records from the entire previous calendar month." },
  { label: "This quarter", key: "quarter", tip: "Filter records from the start of the current 3-month quarter." },
  { label: "This year", key: "year", tip: "Filter records from January 1st of the current year through today." },
  { label: "All time", key: "all", tip: "Show all historical records without any date restriction." },
] as const;

export type PresetKey = (typeof PRESETS)[number]["key"];

/**
 * Resolves a preset key to a { from, to } date pair (YYYY-MM-DD strings).
 * "All time" returns null dates.
 */
export function resolvePreset(key: string): { from: string | null; to: string | null } {
  return resolveDateRange({ range: key });
}

/**
 * Client-side date range filter with preset chips + custom date inputs.
 * Works via URL search params — no client state needed on the page component.
 */
export function DateRangeFilter({ defaultRange = "all" }: { defaultRange?: PresetKey } = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activePreset = searchParams.get("range") || defaultRange;
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
      if (key === "all" && defaultRange === "all") {
        updateParams({ range: null, from: null, to: null });
      } else {
        updateParams({ range: key, from: null, to: null });
      }
    },
    [updateParams, defaultRange],
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
            data-tooltip-title={`Date Filter: ${preset.label}`}
            data-tooltip={preset.tip}
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
