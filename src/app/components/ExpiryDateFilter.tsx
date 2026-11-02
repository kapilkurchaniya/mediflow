"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";
import { CalendarClock } from "lucide-react";
import clsx from "clsx";

interface ExpiryPreset {
  label: string;
  key: string;
  tone?: "danger" | "warning";
}

const EXPIRY_PRESETS: readonly ExpiryPreset[] = [
  { label: "All batches", key: "all" },
  { label: "Expired", key: "expired", tone: "danger" },
  { label: "≤ 30 days", key: "30d", tone: "danger" },
  { label: "≤ 60 days", key: "60d", tone: "warning" },
  { label: "≤ 90 days", key: "90d", tone: "warning" },
  { label: "≤ 6 months", key: "180d" },
  { label: "This year", key: "year" },
];

export function ExpiryDateFilter() {
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
        updateParams({ range: null, from: null, to: null, nearExpiry: null });
      } else {
        updateParams({ range: key, from: null, to: null, nearExpiry: null });
      }
    },
    [updateParams],
  );

  const handleCustomDate = useCallback(
    (field: "from" | "to", value: string) => {
      updateParams({ range: "custom", [field]: value, nearExpiry: null });
    },
    [updateParams],
  );

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
      {/* Preset chips */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <CalendarClock className="h-4 w-4 text-ink-400 mr-1 shrink-0" />
        {EXPIRY_PRESETS.map((preset) => {
          const isActive = activePreset === preset.key && !isCustom;
          return (
            <button
              key={preset.key}
              type="button"
              onClick={() => handlePreset(preset.key)}
              className={clsx(
                "rounded-md px-2.5 py-1 text-[12px] font-medium transition-all duration-150",
                isActive
                  ? "bg-brand-600 text-white shadow-sm ring-1 ring-brand-700"
                  : preset.tone === "danger"
                    ? "bg-red-50 text-red-700 hover:bg-red-100 border border-red-200"
                    : preset.tone === "warning"
                      ? "bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200"
                      : "bg-ink-50 text-ink-600 hover:bg-ink-100 hover:text-ink-800 border border-ink-150",
              )}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      {/* Custom date inputs */}
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={isCustom ? customFrom : ""}
          onChange={(e) => handleCustomDate("from", e.target.value)}
          className="input !h-7 !text-[12px] !w-[130px] !px-2"
          aria-label="Expiry from date"
        />
        <span className="text-[12px] text-ink-400">to</span>
        <input
          type="date"
          value={isCustom ? customTo : ""}
          onChange={(e) => handleCustomDate("to", e.target.value)}
          className="input !h-7 !text-[12px] !w-[130px] !px-2"
          aria-label="Expiry to date"
        />
      </div>
    </div>
  );
}
