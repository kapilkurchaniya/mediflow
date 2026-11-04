"use client";

import { useState } from "react";
import {
  Building2,
  Upload,
  CheckCircle2,
  ArrowDownRight,
  ArrowUpRight,
  Link2,
  Unlink,
  RefreshCw,
  AlertCircle,
  X,
} from "lucide-react";
import {
  uploadBankStatement,
  runAutoMatch,
  manualMatchLine,
  unmatchLine,
} from "@/app/actions/bank-reconciliation";
import clsx from "clsx";

interface Statement {
  id: string;
  bankName: string;
  accountNo: string;
  statementDate: string;
  uploadFileName: string | null;
  status: string;
  createdAt: Date;
}

interface StatementLine {
  line: {
    id: string;
    statementId: string;
    transactionDate: string;
    description: string;
    reference: string | null;
    debit: number | null;
    credit: number | null;
    balance: number | null;
    matchedPaymentId: string | null;
    matchStatus: string;
  };
  payment: {
    id: string;
    paymentNo: string;
    partyType: string | null;
    method: string;
    amount: number | null;
    paymentDate: string;
  } | null;
}

interface CandidatePayment {
  id: string;
  paymentNo: string;
  partyType: string | null;
  method: string;
  amount: number | null;
  paymentDate: string;
  direction: string;
}

export function BankReconciliationClient({
  initialStatements,
  initialLines,
  candidatePayments,
}: {
  initialStatements: Statement[];
  initialLines: StatementLine[];
  candidatePayments: CandidatePayment[];
}) {
  const [statements, setStatements] = useState(initialStatements);
  const [selectedStatementId, setSelectedStatementId] = useState<string>(
    initialStatements[0]?.id || ""
  );
  const [lines, setLines] = useState(initialLines);
  const [filter, setFilter] = useState<"all" | "matched" | "unmatched">("all");
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadPending, setUploadPending] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Manual matching modal state
  const [matchingLineId, setMatchingLineId] = useState<string | null>(null);
  const [autoMatchPending, setAutoMatchPending] = useState(false);
  const [bannerNotice, setBannerNotice] = useState<string | null>(null);

  const activeStatement = statements.find((s) => s.id === selectedStatementId);

  const filteredLines = lines.filter((item) => {
    if (filter === "matched") return item.line.matchStatus !== "unmatched";
    if (filter === "unmatched") return item.line.matchStatus === "unmatched";
    return true;
  });

  const totalLines = lines.length;
  const matchedLines = lines.filter((l) => l.line.matchStatus !== "unmatched").length;
  const matchRate = totalLines > 0 ? Math.round((matchedLines / totalLines) * 100) : 0;

  const totalDebits = lines.reduce((acc, l) => acc + (l.line.debit || 0), 0);
  const totalCredits = lines.reduce((acc, l) => acc + (l.line.credit || 0), 0);

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setUploadPending(true);
    setUploadError(null);

    const formData = new FormData(e.currentTarget);
    const res = await uploadBankStatement(formData);

    if (res.error) {
      setUploadError(res.error);
    } else {
      setShowUploadModal(false);
      window.location.reload();
    }
    setUploadPending(false);
  };

  const handleRunAutoMatch = async () => {
    if (!selectedStatementId) return;
    setAutoMatchPending(true);
    setBannerNotice(null);

    const res = await runAutoMatch(selectedStatementId);
    if ("error" in res && res.error) {
      setBannerNotice(`Error: ${res.error}`);
    } else if ("matched" in res) {
      setBannerNotice(`Auto-reconciliation complete: ${res.matched} additional transactions matched.`);
      window.location.reload();
    }
    setAutoMatchPending(false);
  };

  const handleManualMatch = async (paymentId: string) => {
    if (!matchingLineId) return;
    const res = await manualMatchLine(matchingLineId, paymentId);
    if (res.success) {
      setLines((prev) =>
        prev.map((item) => {
          if (item.line.id === matchingLineId) {
            const p = candidatePayments.find((cp) => cp.id === paymentId);
            return {
              ...item,
              line: { ...item.line, matchedPaymentId: paymentId, matchStatus: "manual_matched" },
              payment: p ? { ...p, partyType: p.partyType || null } : null,
            };
          }
          return item;
        })
      );
      setMatchingLineId(null);
    }
  };

  const handleUnmatch = async (lineId: string) => {
    const res = await unmatchLine(lineId);
    if (res.success) {
      setLines((prev) =>
        prev.map((item) =>
          item.line.id === lineId
            ? { ...item, line: { ...item.line, matchedPaymentId: null, matchStatus: "unmatched" }, payment: null }
            : item
        )
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top action / Statement selector */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Building2 className="h-6 w-6 text-primary-600 shrink-0" />
          <div>
            <h2 className="text-base font-semibold text-ink-900">
              {activeStatement ? `${activeStatement.bankName} (A/C ...${activeStatement.accountNo.slice(-4)})` : "No Statement Selected"}
            </h2>
            <span className="text-xs text-ink-500">
              Statement Date: {activeStatement?.statementDate || "N/A"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRunAutoMatch}
            disabled={autoMatchPending || !selectedStatementId}
            className="btn btn-secondary btn-sm"
          >
            {autoMatchPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            <span>Auto Match</span>
          </button>
          <button
            type="button"
            onClick={() => setShowUploadModal(true)}
            className="btn btn-primary btn-sm"
          >
            <Upload className="h-4 w-4" /> Upload Statement CSV
          </button>
        </div>
      </div>

      {bannerNotice && (
        <div className="alert-info text-xs">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {bannerNotice}
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="text-xs text-ink-500 font-medium">Reconciliation Progress</div>
          <div className="text-xl font-bold text-ink-900 mt-1">{matchRate}%</div>
          <div className="w-full bg-ink-150 h-1.5 rounded-full mt-2 overflow-hidden">
            <div className="bg-emerald-500 h-full rounded-full transition-all" style={{ width: `${matchRate}%` }} />
          </div>
        </div>

        <div className="card p-4">
          <div className="text-xs text-ink-500 font-medium">Matched Lines</div>
          <div className="text-xl font-bold text-emerald-600 mt-1">
            {matchedLines} <span className="text-xs text-ink-400 font-normal">/ {totalLines}</span>
          </div>
          <div className="text-[11px] text-ink-400 mt-1">{totalLines - matchedLines} pending review</div>
        </div>

        <div className="card p-4">
          <div className="text-xs text-ink-500 font-medium">Total Credits (Deposits)</div>
          <div className="text-xl font-bold text-ink-900 mt-1 num font-mono">
            ₹{(totalCredits / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-emerald-600 mt-1 flex items-center gap-0.5">
            <ArrowDownRight className="h-3 w-3" /> Inflow from POS / UPI
          </div>
        </div>

        <div className="card p-4">
          <div className="text-xs text-ink-500 font-medium">Total Debits (Withdrawals)</div>
          <div className="text-xl font-bold text-ink-900 mt-1 num font-mono">
            ₹{(totalDebits / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-rose-600 mt-1 flex items-center gap-0.5">
            <ArrowUpRight className="h-3 w-3" /> Supplier payments & expenses
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between border-b border-ink-150 pb-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setFilter("all")}
            className={clsx("btn btn-sm", filter === "all" ? "btn-primary" : "btn-ghost")}
          >
            All Lines ({totalLines})
          </button>
          <button
            onClick={() => setFilter("matched")}
            className={clsx("btn btn-sm", filter === "matched" ? "btn-primary" : "btn-ghost")}
          >
            Matched ({matchedLines})
          </button>
          <button
            onClick={() => setFilter("unmatched")}
            className={clsx("btn btn-sm", filter === "unmatched" ? "btn-primary" : "btn-ghost")}
          >
            Unmatched ({totalLines - matchedLines})
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Txn Date</th>
                <th>Narration / Bank Particulars</th>
                <th>Reference / UTR</th>
                <th className="text-right">Debit (₹)</th>
                <th className="text-right">Credit (₹)</th>
                <th>Status</th>
                <th>Matched System Payment</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredLines.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-ink-400">
                    No transactions match the selected filter.
                  </td>
                </tr>
              ) : (
                filteredLines.map(({ line, payment }) => (
                  <tr key={line.id}>
                    <td className="font-mono text-xs text-ink-600 whitespace-nowrap">
                      {line.transactionDate}
                    </td>
                    <td className="max-w-xs text-xs font-medium text-ink-800 break-words">
                      {line.description}
                    </td>
                    <td className="font-mono text-xs text-ink-500">
                      {line.reference || "—"}
                    </td>
                    <td className="text-right font-mono text-xs text-rose-600 font-semibold">
                      {line.debit ? `₹${(line.debit / 100).toFixed(2)}` : "—"}
                    </td>
                    <td className="text-right font-mono text-xs text-emerald-600 font-semibold">
                      {line.credit ? `₹${(line.credit / 100).toFixed(2)}` : "—"}
                    </td>
                    <td>
                      <span
                        className={clsx(
                          "badge text-[11px]",
                          line.matchStatus === "auto_matched"
                            ? "badge-success"
                            : line.matchStatus === "manual_matched"
                            ? "badge-info"
                            : "badge-warning"
                        )}
                      >
                        {line.matchStatus.replace("_", " ")}
                      </span>
                    </td>
                    <td>
                      {payment ? (
                        <div className="text-xs">
                          <span className="font-mono font-medium text-ink-900">{payment.paymentNo}</span>
                          <span className="text-ink-400 ml-1.5 uppercase font-mono text-[10.5px]">
                            ({payment.method} · ₹{((payment.amount || 0) / 100).toFixed(2)})
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-ink-300 italic">Not matched</span>
                      )}
                    </td>
                    <td className="text-right">
                      {line.matchStatus === "unmatched" ? (
                        <button
                          type="button"
                          onClick={() => setMatchingLineId(line.id)}
                          className="btn btn-secondary btn-xs"
                        >
                          Match
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleUnmatch(line.id)}
                          className="btn btn-ghost btn-xs text-ink-400 hover:text-rose-600"
                        >
                          <Unlink className="h-3 w-3" /> Unlink
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manual Match Selection Modal */}
      {matchingLineId && (
        <div className="fixed inset-0 z-50 bg-ink-950/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-ink-200 w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-ink-150 bg-ink-50 flex items-center justify-between">
              <h3 className="font-semibold text-sm text-ink-900">Link System Payment</h3>
              <button
                type="button"
                onClick={() => setMatchingLineId(null)}
                className="btn btn-ghost btn-icon h-7 w-7 text-ink-400 hover:text-ink-700"
                aria-label="Close dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 max-h-96 overflow-y-auto space-y-2">
              <p className="text-xs text-ink-500 mb-3">
                Select a receipt or supplier payment from your pharmacy books to link with this bank statement line:
              </p>

              {candidatePayments.length === 0 ? (
                <div className="text-center py-6 text-ink-400 text-xs">No pending payments found in system.</div>
              ) : (
                candidatePayments.map((cp) => (
                  <div
                    key={cp.id}
                    className="p-3 rounded-lg border border-ink-150 hover:border-brand-500 hover:bg-brand-50/20 flex items-center justify-between transition-colors cursor-pointer"
                    onClick={() => handleManualMatch(cp.id)}
                  >
                    <div>
                      <div className="font-semibold text-xs text-ink-900">{cp.paymentNo}</div>
                      <div className="text-[11px] text-ink-500">
                        {cp.paymentDate} · {cp.partyType || "General"} · {cp.method.toUpperCase()}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-xs text-ink-900">
                        ₹{((cp.amount || 0) / 100).toFixed(2)}
                      </div>
                      <span className="badge badge-neutral text-[10px] uppercase">{cp.direction}</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="px-5 py-3.5 border-t border-ink-150 bg-ink-50/50 flex justify-end">
              <button
                type="button"
                onClick={() => setMatchingLineId(null)}
                className="btn btn-secondary btn-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload CSV Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 bg-ink-950/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-ink-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-ink-150 bg-ink-50 flex items-center justify-between">
              <h3 className="font-semibold text-sm text-ink-900">Upload Bank Statement CSV</h3>
              <button
                type="button"
                onClick={() => setShowUploadModal(false)}
                className="btn btn-ghost btn-icon h-7 w-7 text-ink-400 hover:text-ink-700"
                aria-label="Close dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleUpload}>
              <div className="p-5 space-y-4">
                {uploadError && (
                  <div className="alert-error text-xs">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {uploadError}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="label text-xs">Bank Name</label>
                    <select name="bankName" className="input input-sm w-full">
                      <option value="HDFC Bank">HDFC Bank</option>
                      <option value="ICICI Bank">ICICI Bank</option>
                      <option value="State Bank of India">State Bank of India</option>
                      <option value="Axis Bank">Axis Bank</option>
                      <option value="Other Bank">Other / Standard CSV</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="label text-xs">Account Number</label>
                    <input
                      type="text"
                      name="accountNo"
                      required
                      placeholder="50200012345678"
                      className="input input-sm w-full font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="label text-xs">Statement Date</label>
                  <input
                    type="date"
                    name="statementDate"
                    required
                    defaultValue={new Date().toISOString().split("T")[0]}
                    className="input input-sm w-full"
                  />
                </div>

                <div className="space-y-1">
                  <label className="label text-xs">Paste Bank Statement CSV Text *</label>
                  <textarea
                    name="csvContent"
                    required
                    rows={6}
                    placeholder={`Txn Date,Description,Ref No,Debit,Credit,Balance\n01/10/2026,UPI-SWIGGY-10293,,0.00,1450.00,52340.00\n02/10/2026,CHQ DEP SUN PHARMA,CHQ9982,5000.00,0.00,47340.00`}
                    className="input input-sm w-full font-mono text-xs py-2"
                  />
                  <span className="text-[11px] text-ink-400 block mt-1">
                    Supports standard netbanking CSV exports from all major Indian banks.
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 px-5 py-3.5 bg-ink-50/50 border-t border-ink-150">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="btn btn-secondary btn-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploadPending}
                  className="btn btn-primary btn-sm"
                >
                  <Upload className="h-4 w-4" /> {uploadPending ? "Parsing…" : "Import & Auto-Match"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
