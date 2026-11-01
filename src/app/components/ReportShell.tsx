"use client";

import React from "react";
import Link from "next/link";
import { Printer, Download, ArrowLeft } from "lucide-react";
import { PageHeader } from "./ui";

interface ReportShellProps {
  eyebrow?: string;
  title: string;
  description?: string;
  backHref?: string;
  backLabel?: string;
  filterBar?: React.ReactNode;
  kpiRow?: React.ReactNode;
  kpiRowClassName?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  onExportCsv?: () => void;
  exportLoading?: boolean;
}

export function ReportShell({
  eyebrow = "Financial & Statutory Reports",
  title,
  description,
  backHref,
  backLabel = "Back",
  filterBar,
  kpiRow,
  kpiRowClassName,
  children,
  actions,
  onExportCsv,
  exportLoading = false,
}: ReportShellProps) {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="page space-y-6">
      {backHref && (
        <div className="print:hidden">
          <Link
            href={backHref}
            className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-500 hover:text-ink-800 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {backLabel}
          </Link>
        </div>
      )}

      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        actions={
          <div className="flex items-center gap-2 print:hidden">
            {actions}
            {onExportCsv && (
              <button
                type="button"
                onClick={onExportCsv}
                disabled={exportLoading}
                className="btn btn-secondary btn-sm"
              >
                <Download className="h-4 w-4" />
                {exportLoading ? "Exporting..." : "Export CSV"}
              </button>
            )}
            <button
              type="button"
              onClick={handlePrint}
              className="btn btn-secondary btn-sm"
            >
              <Printer className="h-4 w-4" />
              Print Report
            </button>
          </div>
        }
      />

      {filterBar && (
        <div className="card px-4 py-3 bg-white/70 backdrop-blur-xs print:hidden">
          {filterBar}
        </div>
      )}

      {kpiRow && (
        <section className={kpiRowClassName ?? "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 print:grid-cols-4"}>
          {kpiRow}
        </section>
      )}

      <div className="space-y-6">{children}</div>
    </div>
  );
}
