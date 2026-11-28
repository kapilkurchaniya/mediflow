"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";

export function ExportButton({
  endpoint,
  from,
  to,
  label = "Export",
}: {
  endpoint: string; // e.g. "/api/export/sales"
  from?: string | null;
  to?: string | null;
  label?: string;
}) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    setExportError(false);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);

      const url = `${endpoint}${params.toString() ? `?${params.toString()}` : ""}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error("Export failed");

      const blob = await response.blob();
      const contentDisposition = response.headers.get("Content-Disposition");
      let filename = "export.csv";
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match?.[1]) filename = match[1];
      }

      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch {
      setExportError(true);
      setTimeout(() => setExportError(false), 3500);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={isExporting}
      className={`btn ${exportError ? "btn-secondary border-rose-300 text-rose-700" : "btn-secondary"}`}
      data-tooltip-title="Download CSV Export"
      data-tooltip="Export the currently filtered register to a CSV spreadsheet for Excel or Tally/CA review."
    >
      {isExporting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Download className="h-4 w-4 mr-1" />}
      {isExporting ? "Exporting..." : exportError ? "Export Failed" : label}
    </button>
  );
}
