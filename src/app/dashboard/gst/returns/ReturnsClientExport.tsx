"use client";

import { useState } from "react";
import { Download, FileJson, Loader2, ExternalLink } from "lucide-react";
import { downloadGstr1JsonAction } from "@/app/actions/gst";

export function ReturnsClientExport({
  month,
  year,
  gstin,
  gstr3bSummary,
}: {
  month: number;
  year: number;
  gstin?: string;
  gstr3bSummary: {
    outwardTaxable: number;
    cgst: number;
    sgst: number;
    igst: number;
    itcCgst: number;
    itcSgst: number;
    itcIgst: number;
    cashCgst: number;
    cashSgst: number;
    cashIgst: number;
  };
}) {
  const [downloadingJson, setDownloadingJson] = useState(false);

  async function handleDownloadJson() {
    setDownloadingJson(true);
    try {
      const res = await downloadGstr1JsonAction(month, year, gstin);
      if (res.success && res.payload) {
        const jsonStr =
          "data:text/json;charset=utf-8," +
          encodeURIComponent(JSON.stringify(res.payload, null, 2));
        const downloadAnchor = document.createElement("a");
        downloadAnchor.setAttribute("href", jsonStr);
        downloadAnchor.setAttribute("download", res.filename);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
      } else {
        alert("Failed to build GSTR-1 JSON");
      }
    } catch (err) {
      alert("Error: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setDownloadingJson(false);
    }
  }

  function handleExportCsv() {
    const headers = [
      "Table",
      "Description",
      "Total Taxable Value (Rs)",
      "Integrated Tax (Rs)",
      "Central Tax (Rs)",
      "State Tax (Rs)",
      "Cess (Rs)",
    ];

    const rows = [
      [
        "3.1(a)",
        "Outward Taxable Supplies (other than zero/nil/exempted)",
        (gstr3bSummary.outwardTaxable / 100).toFixed(2),
        (gstr3bSummary.igst / 100).toFixed(2),
        (gstr3bSummary.cgst / 100).toFixed(2),
        (gstr3bSummary.sgst / 100).toFixed(2),
        "0.00",
      ],
      [
        "4(A)(5)",
        "Eligible ITC - All Other ITC (Purchases)",
        "—",
        (gstr3bSummary.itcIgst / 100).toFixed(2),
        (gstr3bSummary.itcCgst / 100).toFixed(2),
        (gstr3bSummary.itcSgst / 100).toFixed(2),
        "0.00",
      ],
      [
        "6.1",
        "Payment of Tax - Paid in Cash",
        "—",
        (gstr3bSummary.cashIgst / 100).toFixed(2),
        (gstr3bSummary.cashCgst / 100).toFixed(2),
        (gstr3bSummary.cashSgst / 100).toFixed(2),
        "0.00",
      ],
    ];

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `GSTR3B_Computation_${month}_${year}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={handleExportCsv}
        className="btn btn-secondary text-xs"
      >
        <Download className="h-3.5 w-3.5 mr-1" />
        Download GSTR-3B Computation
      </button>

      <button
        type="button"
        onClick={handleDownloadJson}
        disabled={downloadingJson}
        className="btn btn-primary text-xs"
      >
        {downloadingJson ? (
          <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
        ) : (
          <FileJson className="h-3.5 w-3.5 mr-1" />
        )}
        Download GSTR-1 Portal JSON
      </button>

      <a
        href="https://services.gst.gov.in/services/login"
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn-ghost text-xs inline-flex items-center gap-1 text-ink-700"
      >
        GST Portal <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}
