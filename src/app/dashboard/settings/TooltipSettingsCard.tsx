"use client";

import React from "react";
import { HelpCircle, Sparkles, CheckCircle2, EyeOff } from "lucide-react";
import { useShell } from "@/app/components/ShellContext";
import clsx from "clsx";

export function TooltipSettingsCard() {
  const { tooltipsEnabled, toggleTooltips, setTooltipsEnabled } = useShell();

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-ink-150">
        <div className="flex items-center gap-2.5">
          <HelpCircle className="h-5 w-5 text-brand-600 shrink-0" />
          <div>
            <h2 className="text-[15px] font-semibold text-ink-900">
              Guided Feature Tooltips
            </h2>
            <p className="text-[12px] text-ink-500">
              Hover explanations for menus, actions, pharmacy columns, and shortcuts across the software.
            </p>
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={tooltipsEnabled}
          aria-label="Enable or disable feature tooltips across the software"
          onClick={toggleTooltips}
          data-tooltip-title={tooltipsEnabled ? "Disable Feature Tooltips" : "Enable Feature Tooltips"}
          data-tooltip="Toggle contextual hover help across all MediFlow screens."
          className={clsx(
            "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2",
            tooltipsEnabled ? "bg-brand-600" : "bg-ink-200"
          )}
        >
          <span
            aria-hidden="true"
            className={clsx(
              "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-150",
              tooltipsEnabled ? "translate-x-5" : "translate-x-0"
            )}
          />
        </button>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-ink-150 bg-ink-50/50 p-3.5 text-[12.5px]">
        <div className="flex items-start gap-2.5">
          {tooltipsEnabled ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <EyeOff className="h-4 w-4 text-ink-400 shrink-0 mt-0.5" />
          )}
          <div>
            <p className="font-medium text-ink-900">
              {tooltipsEnabled
                ? "Feature tooltips are currently enabled"
                : "Feature tooltips are currently disabled"}
            </p>
            <p className="text-[12px] text-ink-500 mt-0.5">
              {tooltipsEnabled
                ? "Hovering over any sidebar module, button, KPI card, date preset, or table column displays what that feature does."
                : "All hover tooltips (including native browser title popups) are hidden for a distraction-free workspace."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span
            data-tooltip-title="Live Tooltip Preview"
            data-tooltip="Hover tooltips explain what every button, column, and module in MediFlow does."
            data-tooltip-shortcut="Hover"
            className="inline-flex items-center gap-1.5 rounded-md border border-brand-200 bg-brand-50/60 px-2.5 py-1.5 text-[11.5px] font-medium text-brand-700 cursor-help"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Hover to test
          </span>

          <button
            type="button"
            onClick={() => setTooltipsEnabled(!tooltipsEnabled)}
            className="btn btn-secondary btn-sm text-[12px]"
          >
            {tooltipsEnabled ? "Disable Tooltips" : "Enable Tooltips"}
          </button>
        </div>
      </div>
    </div>
  );
}
