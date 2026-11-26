"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, FilePlus2, FileSpreadsheet, Plus, Trash2, CheckCircle2, AlertCircle } from "lucide-react";
import { LiveKeybar } from "@/app/components/LiveKeybar";
import {
  postContraVoucherAction,
  postManualJournalAction,
  postStandaloneNoteAction,
} from "@/app/actions/accounting-vouchers";
import { formatINR } from "@/lib/format";

interface AccountOption {
  id: string;
  code: string;
  name: string;
  type: string;
  systemKey: string | null;
}

interface PartyOption {
  id: string;
  name: string;
  phone?: string | null;
}

interface VoucherItem {
  id: string;
  entryNo: string;
  entryDateFormatted: string;
  narration: string;
  refType: string | null;
  totalAmount: number;
  lines: Array<{
    accountName: string;
    accountCode: string;
    debit: number;
    credit: number;
  }>;
}

export function VouchersClient({
  accounts,
  customers,
  suppliers,
  recentVouchers,
}: {
  accounts: AccountOption[];
  customers: PartyOption[];
  suppliers: PartyOption[];
  recentVouchers: VoucherItem[];
}) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [tab, setTab] = useState<"journal" | "contra" | "note">("journal");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Journal Voucher state
  const [jvDate, setJvDate] = useState(today);
  const [jvNarration, setJvNarration] = useState("");
  const [jvLines, setJvLines] = useState<Array<{ accountId: string; debitRs: string; creditRs: string }>>([
    { accountId: accounts[0]?.id ?? "", debitRs: "", creditRs: "" },
    { accountId: accounts[1]?.id ?? accounts[0]?.id ?? "", debitRs: "", creditRs: "" },
  ]);

  // Contra state
  const [contraDate, setContraDate] = useState(today);
  const [contraDir, setContraDir] = useState<"cash_to_bank" | "bank_to_cash" | "custom">("cash_to_bank");
  const [contraFromId, setContraFromId] = useState(
    accounts.find((a) => a.systemKey === "cash")?.id ?? accounts[0]?.id ?? "",
  );
  const [contraToId, setContraToId] = useState(
    accounts.find((a) => a.systemKey === "bank")?.id ?? accounts[0]?.id ?? "",
  );
  const [contraAmountRs, setContraAmountRs] = useState("");
  const [contraRef, setContraRef] = useState("");
  const [contraNarration, setContraNarration] = useState("");

  // Debit/Credit Note state
  const [noteDate, setNoteDate] = useState(today);
  const [noteType, setNoteType] = useState<"debit_note" | "credit_note">("credit_note");
  const [notePartyType, setNotePartyType] = useState<"customer" | "supplier">("customer");
  const [notePartyId, setNotePartyId] = useState(customers[0]?.id ?? "");
  const [noteCounterAccountId, setNoteCounterAccountId] = useState(
    accounts.find((a) => a.systemKey === "discounts")?.id ?? accounts[0]?.id ?? "",
  );
  const [noteAmountRs, setNoteAmountRs] = useState("");
  const [noteNarration, setNoteNarration] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "F4") {
        e.preventDefault();
        setTab("journal");
      } else if (e.key === "F5") {
        e.preventDefault();
        setTab("note");
        setNoteType("debit_note");
      } else if (e.key === "F6") {
        e.preventDefault();
        setTab("note");
        setNoteType("credit_note");
      } else if (e.key === "F7") {
        e.preventDefault();
        setTab("contra");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const totalDebitPaise = jvLines.reduce((s, l) => s + Math.round((parseFloat(l.debitRs) || 0) * 100), 0);
  const totalCreditPaise = jvLines.reduce((s, l) => s + Math.round((parseFloat(l.creditRs) || 0) * 100), 0);
  const isJvBalanced = totalDebitPaise > 0 && totalDebitPaise === totalCreditPaise;

  const cashBankAccounts = accounts.filter(
    (a) => a.systemKey === "cash" || a.systemKey === "bank" || a.type === "asset",
  );
  const activePartyList = notePartyType === "customer" ? customers : suppliers;

  async function handlePostJournal(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setSubmitting(true);
    try {
      const res = await postManualJournalAction({
        entryDate: jvDate,
        narration: jvNarration,
        lines: jvLines.map((l) => ({
          accountId: l.accountId,
          debitPaise: Math.round((parseFloat(l.debitRs) || 0) * 100),
          creditPaise: Math.round((parseFloat(l.creditRs) || 0) * 100),
        })),
      });
      if (!res.success) {
        setError(res.error || "Failed to post journal voucher");
      } else {
        setSuccessMsg(`Posted Journal Voucher ${res.entryNo}`);
        setJvNarration("");
        setJvLines([
          { accountId: accounts[0]?.id ?? "", debitRs: "", creditRs: "" },
          { accountId: accounts[1]?.id ?? accounts[0]?.id ?? "", debitRs: "", creditRs: "" },
        ]);
        router.refresh();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePostContra(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setSubmitting(true);
    try {
      const res = await postContraVoucherAction({
        entryDate: contraDate,
        direction: contraDir,
        fromAccountId: contraDir === "custom" ? contraFromId : undefined,
        toAccountId: contraDir === "custom" ? contraToId : undefined,
        amountPaise: Math.round((parseFloat(contraAmountRs) || 0) * 100),
        referenceNo: contraRef,
        narration: contraNarration,
      });
      if (!res.success) {
        setError(res.error || "Failed to post contra voucher");
      } else {
        setSuccessMsg(`Posted Contra Voucher ${res.entryNo}`);
        setContraAmountRs("");
        setContraRef("");
        setContraNarration("");
        router.refresh();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePostNote(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setSubmitting(true);
    try {
      const res = await postStandaloneNoteAction({
        entryDate: noteDate,
        noteType,
        partyType: notePartyType,
        partyId: notePartyId,
        counterAccountId: noteCounterAccountId,
        amountPaise: Math.round((parseFloat(noteAmountRs) || 0) * 100),
        narration: noteNarration,
      });
      if (!res.success) {
        setError(res.error || "Failed to post note");
      } else {
        setSuccessMsg(`Posted ${noteType === "debit_note" ? "Debit Note" : "Credit Note"} ${res.entryNo}`);
        setNoteAmountRs("");
        setNoteNarration("");
        router.refresh();
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-ink-200 pb-3">
        <button
          type="button"
          onClick={() => { setTab("journal"); setError(null); setSuccessMsg(null); }}
          className={`btn btn-sm ${tab === "journal" ? "btn-primary" : "btn-ghost"}`}
        >
          <FileSpreadsheet className="w-4 h-4" /> Journal Voucher (JV)
        </button>
        <button
          type="button"
          onClick={() => { setTab("contra"); setError(null); setSuccessMsg(null); }}
          className={`btn btn-sm ${tab === "contra" ? "btn-primary" : "btn-ghost"}`}
        >
          <ArrowLeftRight className="w-4 h-4" /> Contra (Cash ↔ Bank)
        </button>
        <button
          type="button"
          onClick={() => { setTab("note"); setError(null); setSuccessMsg(null); }}
          className={`btn btn-sm ${tab === "note" ? "btn-primary" : "btn-ghost"}`}
        >
          <FilePlus2 className="w-4 h-4" /> Debit / Credit Note
        </button>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Tab 1: Journal Voucher */}
      {tab === "journal" && (
        <form onSubmit={handlePostJournal} className="card p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="label">Voucher Date</label>
              <input type="date" className="input" value={jvDate} onChange={(e) => setJvDate(e.target.value)} required />
            </div>
            <div className="md:col-span-2">
              <label className="label">Narration</label>
              <input
                type="text"
                className="input"
                placeholder="e.g., Depreciation / Accrual / Ledger adjustment..."
                value={jvNarration}
                onChange={(e) => setJvNarration(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="overflow-x-auto border border-ink-200 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-ink-50 text-ink-600 text-xs uppercase">
                <tr>
                  <th className="p-2.5 text-left">Ledger Account</th>
                  <th className="p-2.5 text-right w-36">Debit (₹)</th>
                  <th className="p-2.5 text-right w-36">Credit (₹)</th>
                  <th className="p-2.5 w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {jvLines.map((line, idx) => (
                  <tr key={idx}>
                    <td className="p-2">
                      <select
                        className="input"
                        value={line.accountId}
                        onChange={(e) => {
                          const next = [...jvLines];
                          next[idx].accountId = e.target.value;
                          setJvLines(next);
                        }}
                      >
                        {accounts.map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.code} — {acc.name} ({acc.type})
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className="input text-right font-mono"
                        placeholder="0.00"
                        value={line.debitRs}
                        onChange={(e) => {
                          const next = [...jvLines];
                          next[idx].debitRs = e.target.value;
                          if (parseFloat(e.target.value) > 0) next[idx].creditRs = "";
                          setJvLines(next);
                        }}
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className="input text-right font-mono"
                        placeholder="0.00"
                        value={line.creditRs}
                        onChange={(e) => {
                          const next = [...jvLines];
                          next[idx].creditRs = e.target.value;
                          if (parseFloat(e.target.value) > 0) next[idx].debitRs = "";
                          setJvLines(next);
                        }}
                      />
                    </td>
                    <td className="p-2 text-center">
                      {jvLines.length > 2 && (
                        <button
                          type="button"
                          onClick={() => setJvLines(jvLines.filter((_, i) => i !== idx))}
                          className="text-rose-500 hover:text-rose-700 p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => setJvLines([...jvLines, { accountId: accounts[0]?.id ?? "", debitRs: "", creditRs: "" }])}
              className="btn btn-sm btn-ghost"
            >
              <Plus className="w-4 h-4" /> Add Line
            </button>
            <div className="flex items-center gap-6 text-sm font-mono">
              <span>Dr: <strong>{formatINR(totalDebitPaise)}</strong></span>
              <span>Cr: <strong>{formatINR(totalCreditPaise)}</strong></span>
              <button type="submit" disabled={submitting || !isJvBalanced} className="btn btn-primary">
                {submitting ? "Posting..." : "Post Journal Voucher"}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Tab 2: Contra Voucher */}
      {tab === "contra" && (
        <form onSubmit={handlePostContra} className="card p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="label">Date</label>
              <input type="date" className="input" value={contraDate} onChange={(e) => setContraDate(e.target.value)} required />
            </div>
            <div>
              <label className="label">Transfer Type</label>
              <select
                className="input"
                value={contraDir}
                onChange={(e) => setContraDir(e.target.value as "cash_to_bank" | "bank_to_cash" | "custom")}
              >
                <option value="cash_to_bank">Cash Deposit → Bank</option>
                <option value="bank_to_cash">Bank Withdrawal → Cash</option>
                <option value="custom">Custom Cash / Bank Transfer</option>
              </select>
            </div>
            <div>
              <label className="label">Amount (₹)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                className="input font-mono"
                placeholder="0.00"
                value={contraAmountRs}
                onChange={(e) => setContraAmountRs(e.target.value)}
                required
              />
            </div>
          </div>

          {contraDir === "custom" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">From Account (Credit)</label>
                <select className="input" value={contraFromId} onChange={(e) => setContraFromId(e.target.value)}>
                  {cashBankAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>{acc.code} — {acc.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">To Account (Debit)</label>
                <select className="input" value={contraToId} onChange={(e) => setContraToId(e.target.value)}>
                  {cashBankAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>{acc.code} — {acc.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Cheque / UTR / Slip Reference</label>
              <input
                type="text"
                className="input"
                placeholder="Optional slip or UTR number"
                value={contraRef}
                onChange={(e) => setContraRef(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Narration</label>
              <input
                type="text"
                className="input"
                placeholder="e.g., Daily counter cash deposit to HDFC"
                value={contraNarration}
                onChange={(e) => setContraNarration(e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button type="submit" disabled={submitting} className="btn btn-primary">
              {submitting ? "Posting..." : "Post Contra Voucher"}
            </button>
          </div>
        </form>
      )}

      {/* Tab 3: Standalone Debit / Credit Note */}
      {tab === "note" && (
        <form onSubmit={handlePostNote} className="card p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="label">Date</label>
              <input type="date" className="input" value={noteDate} onChange={(e) => setNoteDate(e.target.value)} required />
            </div>
            <div>
              <label className="label">Note Type</label>
              <select
                className="input"
                value={noteType}
                onChange={(e) => setNoteType(e.target.value as "debit_note" | "credit_note")}
              >
                <option value="credit_note">Credit Note (CN)</option>
                <option value="debit_note">Debit Note (DN)</option>
              </select>
            </div>
            <div>
              <label className="label">Party Type</label>
              <select
                className="input"
                value={notePartyType}
                onChange={(e) => {
                  const pt = e.target.value as "customer" | "supplier";
                  setNotePartyType(pt);
                  setNotePartyId((pt === "customer" ? customers : suppliers)[0]?.id ?? "");
                }}
              >
                <option value="customer">Customer (Debtor)</option>
                <option value="supplier">Supplier (Creditor)</option>
              </select>
            </div>
            <div>
              <label className="label">Amount (₹)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                className="input font-mono"
                placeholder="0.00"
                value={noteAmountRs}
                onChange={(e) => setNoteAmountRs(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">{notePartyType === "customer" ? "Customer" : "Supplier"}</label>
              <select className="input" value={notePartyId} onChange={(e) => setNotePartyId(e.target.value)} required>
                {activePartyList.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}{p.phone ? ` (${p.phone})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Counter Ledger Account</label>
              <select
                className="input"
                value={noteCounterAccountId}
                onChange={(e) => setNoteCounterAccountId(e.target.value)}
                required
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>{acc.code} — {acc.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label">Reason / Narration (No stock impact)</label>
            <input
              type="text"
              className="input"
              placeholder="e.g., Rate difference / Scheme credit / Settlement rebate"
              value={noteNarration}
              onChange={(e) => setNoteNarration(e.target.value)}
              required
            />
          </div>

          <div className="flex justify-end">
            <button type="submit" disabled={submitting} className="btn btn-primary">
              {submitting ? "Posting..." : `Post ${noteType === "debit_note" ? "Debit Note" : "Credit Note"}`}
            </button>
          </div>
        </form>
      )}

      {/* Recent Vouchers */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-ink-150 bg-ink-50/50">
          <h3 className="text-sm font-semibold text-ink-900">Recent Manual Vouchers, Contra & Notes</h3>
        </div>
        {recentVouchers.length === 0 ? (
          <div className="p-8 text-center text-sm text-ink-500">No manual vouchers posted yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-ink-50 text-xs uppercase text-ink-500">
                <tr>
                  <th className="p-3 text-left">Voucher No</th>
                  <th className="p-3 text-left">Date</th>
                  <th className="p-3 text-left">Type</th>
                  <th className="p-3 text-left">Narration</th>
                  <th className="p-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {recentVouchers.map((v) => (
                  <tr key={v.id}>
                    <td className="p-3 font-mono font-semibold text-ink-900">{v.entryNo}</td>
                    <td className="p-3 text-ink-600">{v.entryDateFormatted}</td>
                    <td className="p-3">
                      <span className="badge badge-neutral capitalize">{(v.refType ?? "journal").replace(/_/g, " ")}</span>
                    </td>
                    <td className="p-3 text-ink-700">{v.narration}</td>
                    <td className="p-3 text-right font-mono font-semibold">{formatINR(v.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <LiveKeybar scope="vouchers" />
    </div>
  );
}
