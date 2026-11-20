"use client";

import React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Upload, Database, Zap } from "lucide-react";
import clsx from "clsx";
import { QuickStockDropTab } from "./QuickStockDropTab";

export type ImportHubTab = "quick" | "migration";

interface ImportHubClientProps {
  initialTab: ImportHubTab;
  canQuickImport: boolean;
  canMigration: boolean;
  migrationContent: React.ReactNode;
}

export function ImportHubClient({
  initialTab,
  canQuickImport,
  canMigration,
  migrationContent,
}: ImportHubClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");

  const resolvedTab: ImportHubTab =
    tabParam === "quick" && canQuickImport
      ? "quick"
      : tabParam === "migration" && canMigration
      ? "migration"
      : initialTab;

  const setTab = (next: ImportHubTab) => {
    router.replace(`/dashboard/import?tab=${next}`, { scroll: false });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
        {canQuickImport && (
          <button
            type="button"
            onClick={() => setTab("quick")}
            data-tooltip="Fast drag-and-drop CSV upload for opening medicine stock & batches with AI auto-enrichment"
            className={clsx(
              "inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors",
              resolvedTab === "quick"
                ? "bg-brand-600 text-white shadow-xs"
                : "bg-white text-ink-700 border border-slate-200 hover:bg-slate-50"
            )}
          >
            <Zap className="h-4 w-4" />
            Quick Stock Drop
          </button>
        )}

        {canMigration && (
          <button
            type="button"
            onClick={() => setTab("migration")}
            data-tooltip="5-step staged migration wizard for Marg ERP, GoFrugal, customers, suppliers & audit history"
            className={clsx(
              "inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors",
              resolvedTab === "migration"
                ? "bg-brand-600 text-white shadow-xs"
                : "bg-white text-ink-700 border border-slate-200 hover:bg-slate-50"
            )}
          >
            <Database className="h-4 w-4" />
            Full Migration Wizard
          </button>
        )}

        {canMigration && resolvedTab === "migration" && (
          <Link
            href="/dashboard/import/new"
            className="ml-auto btn btn-primary btn-sm inline-flex items-center gap-1.5"
          >
            <Upload className="h-3.5 w-3.5" /> Start New Migration Job
          </Link>
        )}
      </div>

      {resolvedTab === "quick" && canQuickImport ? <QuickStockDropTab /> : migrationContent}
    </div>
  );
}

