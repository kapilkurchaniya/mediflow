"use client";

import { useState } from "react";
import { Download, FileJson, Loader2 } from "lucide-react";
import { downloadGstr1JsonAction } from "@/app/actions/gst";

export function Gstr1ExportActions({
  month,
  year,
  b2bData,
  hsnData,
}: {
  month: number;
  year: number;
  b2bData: Array<Record<string, unknown>>;
  hsnData: Array<Record<string, unknown>>;
}) {
  const [downloadingJson, setDownloadingJson] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function handleDownloadJson() {
    setDownloadingJson(true);
    try {
      const res = await downloadGstr1JsonAction(month, year);
      if (res.success && res.payload) {
        const jsonStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(res.payload, null, 2));
        const downloadAnchor = document.createElement("a");
        downloadAnchor.setAttribute("href", jsonStr);
        downloadAnchor.setAttribute("download", res.filename);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
      } else {
        setExportError("Failed to build GSTR-1 JSON");
      }
    } catch (err) {
      setExportError("Error: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setDownloadingJson(false);
    }
  }

  function handleExportCsv() {
    setExportError(null);
    if (b2bData.length === 0) {
      setExportError("No records to export");
      return;
    }

    const headers = [
      "GSTIN/UIN of Recipient",
      "Receiver Name",
      "Invoice Number",
      "Invoice date",
      "Invoice Value",
      "Place Of Supply",
      "Reverse Charge",
      "Invoice Type",
      "E-Commerce GSTIN",
      "Rate",
      "Taxable Value",
      "Cess Amount",
    ];

    const rows = b2bData.map((inv) => [
      inv.partyGstin || "",
      `"${String(inv.partyName || "").replace(/"/g, '""')}"`,
      inv.docNo || "",
      inv.docDate || "",
      ((Number(inv.total) || 0) / 100).toFixed(2),
      inv.placeOfSupply || "",
      "N",
      "Regular",
      "",
      "12",
      ((Number(inv.taxableAmount) || 0) / 100).toFixed(2),
      "0.00",
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `GSTR1_B2B_${month}_${year}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setExportError(null);
            handleExportCsv();
          }}
          className="btn btn-secondary text-xs"
        >
          <Download className="h-3.5 w-3.5 mr-1" />
          Export B2B CSV
        </button>

        <button
          type="button"
          onClick={() => {
            setExportError(null);
            void handleDownloadJson();
          }}
          disabled={downloadingJson}
          className="btn btn-primary text-xs"
        >
          {downloadingJson ? (
            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
          ) : (
            <FileJson className="h-3.5 w-3.5 mr-1" />
          )}
          Download Portal JSON
        </button>
      </div>
      {exportError && (
        <span className="text-[11px] text-rose-600 font-medium">{exportError}</span>
      )}
    </div>
  );
}
