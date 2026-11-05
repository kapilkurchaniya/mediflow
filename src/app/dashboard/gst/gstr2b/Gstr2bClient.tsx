"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  Download,
  CheckCheck,
  Search,
  ShieldAlert,
} from "lucide-react";
import { formatINR } from "@/lib/money";
import {
  importGstr2bAction,
  updateImsAction,
  bulkUpdateImsAction,
  exportImsActionsCsvAction,
} from "@/app/actions/gst-2b";
import { ImsAction } from "@/server/domain/gst-reconciliation/types";

interface Gstr2bClientProps {
  imports: Array<{
    id: string;
    gstin: string;
    returnPeriod: string;
    fileName: string;
    totalInvoices: number;
    totalTaxableAmount: number;
    totalCgst: number;
    totalSgst: number;
    totalIgst: number;
    totalCess: number;
    status: string;
    createdAt: Date | string | null;
  }>;
  selectedImportId: string | null;
  reconciliation: {
    importMeta: {
      id: string;
      gstin: string;
      returnPeriod: string;
      fileName: string;
      totalInvoices: number;
      totalTaxableAmount: number;
      totalCgst: number;
      totalSgst: number;
      totalIgst: number;
      totalCess: number;
      status: string;
      createdAt: Date | string | null;
    };
    lines: Array<{
      id: string;
      supplierGstin: string;
      supplierName: string | null;
      docType: string;
      invoiceNo: string;
      invoiceDate: string;
      taxableAmount: number;
      cgst: number;
      sgst: number;
      igst: number;
      cess: number;
      totalAmount: number;
      itcAvailability: string;
      itcReason: string | null;
      matchStatus: string;
      matchedPurchaseId: string | null;
      matchVarianceAmount: number | null;
      matchNotes: string | null;
      imsAction: string;
      imsActionDate: Date | string | null;
      imsActionBy: string | null;
      purchaseNo: string | null;
      purchaseTotalAmount: number | null;
      purchaseInvoiceDate: string | null;
    }>;
  } | null;
}

export function Gstr2bClient({
  imports,
  selectedImportId,
  reconciliation,
}: Gstr2bClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    "all" | "exact_match" | "tolerance_match" | "mismatch" | "missing_in_books"
  >("all");
  const [searchQuery, setSearchQuery] = useState("");

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    const formData = new FormData();
    formData.append("file", file);

    startTransition(async () => {
      const res = await importGstr2bAction(formData);
      if (!res.success) {
        setUploadError(res.error);
      } else {
        router.push(`/dashboard/gst/gstr2b?importId=${res.importId}`);
        router.refresh();
      }
    });
  };

  const handleImsActionChange = (lineId: string, action: ImsAction) => {
    startTransition(async () => {
      await updateImsAction(lineId, action);
      router.refresh();
    });
  };

  const handleAcceptAllMatched = () => {
    if (!selectedImportId) return;
    startTransition(async () => {
      await bulkUpdateImsAction(selectedImportId, "accept", "exact_match");
      await bulkUpdateImsAction(selectedImportId, "accept", "tolerance_match");
      router.refresh();
    });
  };

  const handleExportCsv = async () => {
    if (!selectedImportId) return;
    startTransition(async () => {
      const res = await exportImsActionsCsvAction(selectedImportId);
      if (res.success && res.csv) {
        const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute(
          "download",
          `IMS_Actions_${reconciliation?.importMeta.returnPeriod || "GSTR2B"}.csv`
        );
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    });
  };

  const lines = reconciliation?.lines || [];

  const filteredLines = lines.filter((line) => {
    if (activeTab !== "all" && line.matchStatus !== activeTab) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchInv = line.invoiceNo.toLowerCase().includes(q);
      const matchGstin = line.supplierGstin.toLowerCase().includes(q);
      const matchName = (line.supplierName || "").toLowerCase().includes(q);
      if (!matchInv && !matchGstin && !matchName) return false;
    }
    return true;
  });

  const countExact = lines.filter((l) => l.matchStatus === "exact_match").length;
  const countTolerance = lines.filter((l) => l.matchStatus === "tolerance_match").length;
  const countMismatch = lines.filter((l) => l.matchStatus === "mismatch").length;
  const countMissing = lines.filter((l) => l.matchStatus === "missing_in_books").length;

  const total2bTax = lines.reduce(
    (acc, l) => acc + (l.cgst || 0) + (l.sgst || 0) + (l.igst || 0) + (l.cess || 0),
    0
  );
  const matchedTax = lines
    .filter((l) => l.matchStatus === "exact_match" || l.matchStatus === "tolerance_match")
    .reduce((acc, l) => acc + (l.cgst || 0) + (l.sgst || 0) + (l.igst || 0) + (l.cess || 0), 0);
  const atRiskTax = lines
    .filter((l) => l.matchStatus === "mismatch")
    .reduce((acc, l) => acc + (l.cgst || 0) + (l.sgst || 0) + (l.igst || 0) + (l.cess || 0), 0);

  return (
    <div className="space-y-6">
      {/* Upload & Period Selection Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-white p-5 rounded-xl border border-ink-100 shadow-sm">
        {/* Upload Button Area */}
        <div className="md:col-span-2 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <label className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-medium rounded-lg shadow-sm cursor-pointer transition text-sm">
            <UploadCloud className="w-4 h-4" />
            <span>Upload GSTR-2B JSON</span>
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleFileUpload}
              disabled={isPending}
            />
          </label>
          <span className="text-xs text-ink-500">
            Upload the official JSON downloaded from GSTN Portal (Returns Dashboard &gt; GSTR-2B)
          </span>
        </div>

        {/* Existing Imports Dropdown */}
        <div className="flex items-center gap-2">
          <label htmlFor="import-select" className="text-xs font-semibold text-ink-600 whitespace-nowrap">
            Filing Period:
          </label>
          <select
            id="import-select"
            aria-label="Filing Period"
            value={selectedImportId || ""}
            onChange={(e) => {
              router.push(`/dashboard/gst/gstr2b?importId=${e.target.value}`);
            }}
            className="w-full text-sm rounded-lg border-ink-200 focus:ring-brand-500 focus:border-brand-500"
          >
            {imports.length === 0 && <option value="">No imports yet</option>}
            {imports.map((imp) => (
              <option key={imp.id} value={imp.id}>
                {imp.returnPeriod} ({imp.totalInvoices} invoices -{" "}
                {imp.createdAt ? new Date(imp.createdAt).toLocaleDateString() : ""})
              </option>
            ))}
          </select>
        </div>
      </div>

      {uploadError && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span>{uploadError}</span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-ink-100 shadow-sm">
          <div className="flex items-center justify-between text-ink-500 text-xs font-medium uppercase tracking-wider">
            <span>Total 2B Inward ITC</span>
            <FileSpreadsheet className="w-4 h-4 text-brand-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-ink-900">{formatINR(total2bTax)}</div>
          <div className="mt-1 text-xs text-ink-500">{lines.length} total portal lines</div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-ink-100 shadow-sm">
          <div className="flex items-center justify-between text-emerald-600 text-xs font-medium uppercase tracking-wider">
            <span>Safe ITC (Matched)</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-700">{formatINR(matchedTax)}</div>
          <div className="mt-1 text-xs text-emerald-600">
            {countExact + countTolerance} invoices verified in books
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-ink-100 shadow-sm">
          <div className="flex items-center justify-between text-amber-600 text-xs font-medium uppercase tracking-wider">
            <span>ITC At Risk (Discrepancy)</span>
            <AlertTriangle className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-700">{formatINR(atRiskTax)}</div>
          <div className="mt-1 text-xs text-amber-600">{countMismatch} invoices with book variance</div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-ink-100 shadow-sm">
          <div className="flex items-center justify-between text-purple-600 text-xs font-medium uppercase tracking-wider">
            <span>Unclaimed ITC (Missing)</span>
            <ShieldAlert className="w-4 h-4 text-purple-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-purple-700">{countMissing}</div>
          <div className="mt-1 text-xs text-purple-600">In 2B but unrecorded in purchase books</div>
        </div>
      </div>

      {/* Main Reconciliation Table Card */}
      <div className="bg-white rounded-xl border border-ink-100 shadow-sm overflow-hidden">
        {/* Table Toolbar */}
        <div className="p-4 border-b border-ink-100 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          {/* Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto text-xs font-medium">
            <button
              onClick={() => setActiveTab("all")}
              className={`px-3 py-1.5 rounded-lg transition ${
                activeTab === "all"
                  ? "bg-brand-50 text-brand-700 font-semibold"
                  : "text-ink-600 hover:bg-ink-50"
              }`}
            >
              All ({lines.length})
            </button>
            <button
              onClick={() => setActiveTab("exact_match")}
              className={`px-3 py-1.5 rounded-lg transition ${
                activeTab === "exact_match"
                  ? "bg-emerald-50 text-emerald-700 font-semibold"
                  : "text-ink-600 hover:bg-ink-50"
              }`}
            >
              Exact Match ({countExact})
            </button>
            <button
              onClick={() => setActiveTab("tolerance_match")}
              className={`px-3 py-1.5 rounded-lg transition ${
                activeTab === "tolerance_match"
                  ? "bg-teal-50 text-teal-700 font-semibold"
                  : "text-ink-600 hover:bg-ink-50"
              }`}
            >
              Tolerance ({countTolerance})
            </button>
            <button
              onClick={() => setActiveTab("mismatch")}
              className={`px-3 py-1.5 rounded-lg transition ${
                activeTab === "mismatch"
                  ? "bg-amber-50 text-amber-700 font-semibold"
                  : "text-ink-600 hover:bg-ink-50"
              }`}
            >
              Discrepancies ({countMismatch})
            </button>
            <button
              onClick={() => setActiveTab("missing_in_books")}
              className={`px-3 py-1.5 rounded-lg transition ${
                activeTab === "missing_in_books"
                  ? "bg-purple-50 text-purple-700 font-semibold"
                  : "text-ink-600 hover:bg-ink-50"
              }`}
            >
              Missing in Books ({countMissing})
            </button>
          </div>

          {/* Action Buttons & Search */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                type="text"
                placeholder="Search invoice or GSTIN..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs rounded-lg border-ink-200 focus:ring-brand-500 focus:border-brand-500 w-48 sm:w-60"
              />
            </div>

            <button
              onClick={handleAcceptAllMatched}
              disabled={isPending || countExact + countTolerance === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg shadow-sm transition whitespace-nowrap"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>Accept Matched</span>
            </button>

            <button
              onClick={handleExportCsv}
              disabled={isPending || lines.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-ink-800 hover:bg-ink-900 disabled:opacity-50 text-white text-xs font-medium rounded-lg shadow-sm transition whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export IMS CSV</span>
            </button>
          </div>
        </div>

        {/* Lines Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-ink-50 text-ink-600 font-medium border-b border-ink-100">
                <th className="py-3 px-4">Supplier & GSTIN</th>
                <th className="py-3 px-4">Invoice # & Type</th>
                <th className="py-3 px-4">Invoice Date</th>
                <th className="py-3 px-4 text-right">2B Total Value</th>
                <th className="py-3 px-4 text-right">Books Value</th>
                <th className="py-3 px-4 text-right">Variance</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center">IMS Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 text-ink-900">
              {filteredLines.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-ink-500">
                    No invoice lines found for this filter.
                  </td>
                </tr>
              )}
              {filteredLines.map((line) => {
                const totalTax = (line.cgst || 0) + (line.sgst || 0) + (line.igst || 0) + (line.cess || 0);

                let statusBadge = (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-700">
                    Unknown
                  </span>
                );

                if (line.matchStatus === "exact_match") {
                  statusBadge = (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                      Exact Match
                    </span>
                  );
                } else if (line.matchStatus === "tolerance_match") {
                  statusBadge = (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-teal-100 text-teal-800">
                      Tolerance (±₹{((line.matchVarianceAmount || 0) / 100).toFixed(2)})
                    </span>
                  );
                } else if (line.matchStatus === "mismatch") {
                  statusBadge = (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800">
                      Mismatch (₹{((line.matchVarianceAmount || 0) / 100).toFixed(2)})
                    </span>
                  );
                } else if (line.matchStatus === "missing_in_books") {
                  statusBadge = (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-100 text-purple-800">
                      Missing in Books
                    </span>
                  );
                }

                return (
                  <tr key={line.id} className="hover:bg-ink-50/50 transition">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-ink-900">
                        {line.supplierName || line.supplierGstin}
                      </div>
                      <div className="text-[11px] text-ink-500 font-mono">{line.supplierGstin}</div>
                    </td>
                    <td className="py-3 px-4 font-mono">
                      <span className="font-medium text-ink-900">{line.invoiceNo}</span>
                      <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-ink-100 text-ink-600 uppercase">
                        {line.docType}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-ink-600">{line.invoiceDate}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="font-semibold">{formatINR(line.totalAmount)}</div>
                      <div className="text-[10px] text-ink-500">Tax: {formatINR(totalTax)}</div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {line.purchaseTotalAmount !== null ? (
                        <>
                          <div className="font-semibold">{formatINR(line.purchaseTotalAmount)}</div>
                          <div className="text-[10px] text-ink-500">
                            {line.purchaseNo || "Purchase"}
                          </div>
                        </>
                      ) : (
                        <span className="text-ink-400 italic">Not booked</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono">
                      {(line.matchVarianceAmount || 0) > 0 ? (
                        <span className="text-amber-600 font-medium">
                          ₹{((line.matchVarianceAmount || 0) / 100).toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-emerald-600 font-medium">₹0.00</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">{statusBadge}</td>
                    <td className="py-3 px-4 text-center">
                      <select
                        aria-label="IMS Action"
                        value={line.imsAction}
                        onChange={(e) =>
                          handleImsActionChange(line.id, e.target.value as ImsAction)
                        }
                        disabled={isPending}
                        className={`text-xs font-medium rounded-lg border py-1 px-2 focus:ring-1 focus:ring-brand-500 ${
                          line.imsAction === "accept"
                            ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                            : line.imsAction === "reject"
                            ? "bg-red-50 text-red-800 border-red-200"
                            : "bg-amber-50 text-amber-800 border-amber-200"
                        }`}
                      >
                        <option value="accept">Accept</option>
                        <option value="pending">Pending</option>
                        <option value="reject">Reject</option>
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
