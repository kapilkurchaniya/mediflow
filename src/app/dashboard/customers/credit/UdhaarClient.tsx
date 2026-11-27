"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  IndianRupee,
  MessageSquare,
  Search,
  Users,
  Wallet,
} from "lucide-react";
import { formatINR, formatISTDate } from "@/lib/format";
import { actionError } from "@/lib/action-result";
import { recordReceipt } from "@/app/actions/payments";
import { getCustomerUdhaarHistoryAction } from "@/app/actions/customer-credit";
import { buildWhatsAppDeepLink } from "@/lib/comms/whatsapp-link";

type CustomerSummaryRow = {
  id: string;
  name: string;
  phone: string | null;
  duePaise: number;
  openBills: number;
};

type DashboardData = {
  summary: {
    totalToCollectPaise: number;
    customersWithDueCount: number;
    openBillsCount: number;
  };
  collectedTodayPaise: number;
  customers: CustomerSummaryRow[];
};

type HistoryData = NonNullable<Awaited<ReturnType<typeof getCustomerUdhaarHistoryAction>>>;

const METHODS = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "bank", label: "Bank" },
] as const;

export function UdhaarClient({ initial }: { initial: DashboardData }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [onlyPending, setOnlyPending] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(
    initial.customers.find((c) => c.duePaise > 0)?.id ?? initial.customers[0]?.id ?? null,
  );
  const [history, setHistory] = useState<HistoryData | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [partialInputs, setPartialInputs] = useState<Record<string, string>>({});
  const [method, setMethod] = useState<(typeof METHODS)[number]["value"]>("cash");
  const [note, setNote] = useState("");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const loadCustomer = async (id: string) => {
    setSelectedId(id);
    setLoadingHistory(true);
    setErrorMsg(null);
    setPartialInputs({});
    try {
      const data = await getCustomerUdhaarHistoryAction(id);
      setHistory(data);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to load customer ledger.");
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    getCustomerUdhaarHistoryAction(selectedId)
      .then((data) => {
        if (active) setHistory(data);
      })
      .catch((err: unknown) => {
        if (active) setErrorMsg(err instanceof Error ? err.message : "Failed to load customer ledger.");
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredCustomers = initial.customers.filter((c) => {
    if (onlyPending && c.duePaise <= 0) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || (c.phone ?? "").includes(q);
  });

  const settleBills = (bills: Array<{ saleId: string; amount: number }>, label: string) => {
    if (!history) return;
    setErrorMsg(null);
    setStatusMsg(null);
    startTransition(async () => {
      const res = await recordReceipt({
        customerId: history.customer.id,
        method,
        paymentDate: new Date().toISOString().slice(0, 10),
        note: note.trim() || label,
        bills,
      });
      const err = actionError(res);
      if (err) {
        setErrorMsg(err);
        return;
      }
      const totalSettled = bills.reduce((s, b) => s + b.amount, 0);
      setStatusMsg(`Marked paid: ${formatINR(totalSettled)} received from ${history.customer.name}.`);
      setNote("");
      setPartialInputs({});
      await loadCustomer(history.customer.id);
      router.refresh();
    });
  };

  const handleMarkSinglePaid = (billId: string, duePaise: number, invoiceNo: string | null) => {
    if (duePaise <= 0) return;
    settleBills([{ saleId: billId, amount: duePaise }], `Full payment for ${invoiceNo ?? "invoice"}`);
  };

  const handlePartialPay = (billId: string, maxDuePaise: number, invoiceNo: string | null) => {
    const raw = partialInputs[billId] ?? "";
    const paise = Math.round(parseFloat(raw) * 100);
    if (!Number.isFinite(paise) || paise <= 0) {
      setErrorMsg("Enter a valid positive amount to receive.");
      return;
    }
    if (paise > maxDuePaise) {
      setErrorMsg(`Amount cannot exceed pending balance (${formatINR(maxDuePaise)}).`);
      return;
    }
    settleBills([{ saleId: billId, amount: paise }], `Partial receipt for ${invoiceNo ?? "invoice"}`);
  };

  const handlePayAllPending = () => {
    if (!history) return;
    const open = history.bills
      .filter((b) => Number(b.creditAmount ?? 0) > 0)
      .map((b) => ({ saleId: b.id, amount: Number(b.creditAmount ?? 0) }));
    if (open.length === 0) return;
    settleBills(open, "Full udhaar settlement");
  };

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="flex items-center justify-between text-xs text-ink-500">
            <span>Total Udhaar to Collect</span>
            <Wallet className="h-4 w-4 text-rose-600" />
          </div>
          <div className="mt-1 text-2xl font-bold font-mono text-rose-700">
            {formatINR(initial.summary.totalToCollectPaise)}
          </div>
          <div className="text-[11px] text-ink-500 mt-0.5">
            Across {initial.summary.openBillsCount} pending bill(s)
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center justify-between text-xs text-ink-500">
            <span>Customers with Pending Dues</span>
            <Users className="h-4 w-4 text-amber-600" />
          </div>
          <div className="mt-1 text-2xl font-bold font-mono text-ink-900">
            {initial.summary.customersWithDueCount}
          </div>
          <div className="text-[11px] text-ink-500 mt-0.5">Active credit accounts</div>
        </div>
        <div className="card p-4">
          <div className="flex items-center justify-between text-xs text-ink-500">
            <span>Collected Today</span>
            <IndianRupee className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-1 text-2xl font-bold font-mono text-emerald-700">
            {formatINR(initial.collectedTodayPaise)}
          </div>
          <div className="text-[11px] text-ink-500 mt-0.5">Customer receipts posted today</div>
        </div>
      </section>

      {statusMsg && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Customer list */}
        <div className="lg:col-span-4 card overflow-hidden flex flex-col max-h-[680px]">
          <div className="p-3 border-b border-ink-150 space-y-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search customer or phone..."
                className="input input-sm !pl-8 w-full text-xs"
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-ink-600 cursor-pointer">
              <input
                type="checkbox"
                checked={onlyPending}
                onChange={(e) => setOnlyPending(e.target.checked)}
                className="rounded border-ink-300"
              />
              Show only customers with pending dues
            </label>
          </div>
          <div className="divide-y divide-ink-100 overflow-y-auto flex-1">
            {filteredCustomers.length === 0 ? (
              <div className="p-6 text-center text-xs text-ink-500">
                {onlyPending ? "No pending customer dues right now." : "No matching customers found."}
              </div>
            ) : (
              filteredCustomers.map((c) => {
                const active = selectedId === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => void loadCustomer(c.id)}
                    className={`w-full text-left px-4 py-3 flex items-center justify-between gap-2 transition-colors ${
                      active ? "bg-brand-50/70 border-l-2 border-l-brand-600" : "hover:bg-ink-50"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-sm text-ink-900 truncate">{c.name}</div>
                      <div className="text-[11px] text-ink-500 font-mono">
                        {c.phone || "No phone"} · {c.openBills} open
                      </div>
                    </div>
                    <div
                      className={`text-sm font-bold font-mono shrink-0 ${
                        c.duePaise > 0 ? "text-rose-700" : "text-emerald-700"
                      }`}
                    >
                      {c.duePaise > 0 ? formatINR(c.duePaise) : "Settled"}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Selected customer history & Mark Paid */}
        <div className="lg:col-span-8 space-y-4">
          {!history ? (
            <div className="card p-8 text-center text-sm text-ink-500">
              {loadingHistory ? "Loading customer purchase history..." : "Select a customer to view bills & dues."}
            </div>
          ) : (
            <>
              <div className="card p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-ink-900">{history.customer.name}</h2>
                    <p className="text-xs text-ink-500 font-mono">
                      {history.customer.phone || "No phone"} · Total Purchased:{" "}
                      {formatINR(history.totals.totalPurchasedPaise)} · Paid:{" "}
                      {formatINR(history.totals.totalPaidPaise)}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] text-ink-500 uppercase font-semibold">Pending Balance</div>
                    <div
                      className={`text-2xl font-bold font-mono ${
                        history.totals.totalPendingPaise > 0 ? "text-rose-700" : "text-emerald-700"
                      }`}
                    >
                      {formatINR(history.totals.totalPendingPaise)}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-ink-150">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-ink-600">Receive via:</span>
                    <select
                      aria-label="Payment method"
                      value={method}
                      onChange={(e) => setMethod(e.target.value as (typeof METHODS)[number]["value"])}
                      className="input input-sm text-xs w-auto"
                    >
                      {METHODS.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Receipt note (optional)"
                      className="input input-sm text-xs w-44"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {history.customer.phone && history.totals.totalPendingPaise > 0 && (
                      <a
                        href={buildWhatsAppDeepLink({
                          phone: history.customer.phone,
                          text: `Namaste ${history.customer.name}, a gentle reminder that your pending pharmacy balance is ${formatINR(history.totals.totalPendingPaise)}. Thank you!`,
                        })}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-secondary btn-sm text-emerald-700"
                      >
                        <MessageSquare className="h-3.5 w-3.5" /> WhatsApp Reminder
                      </a>
                    )}
                    {history.totals.totalPendingPaise > 0 && (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={handlePayAllPending}
                        className="btn btn-primary btn-sm"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Mark All Paid (
                        {formatINR(history.totals.totalPendingPaise)})
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="card overflow-hidden">
                <div className="px-4 py-3 border-b border-ink-150 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-ink-900">Purchase &amp; Credit History</h3>
                  <span className="text-xs text-ink-500">{history.bills.length} bill(s)</span>
                </div>
                {history.bills.length === 0 ? (
                  <div className="p-6 text-center text-xs text-ink-500">No completed bills for this customer.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="data-table min-w-[700px]">
                      <thead>
                        <tr>
                          <th>Invoice</th>
                          <th>Date</th>
                          <th className="text-right">Bill Total</th>
                          <th className="text-right">Paid</th>
                          <th className="text-right">Pending Due</th>
                          <th className="text-right">Settle / Mark Paid</th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.bills.map((b) => {
                          const due = Math.max(0, Number(b.creditAmount ?? 0));
                          const paid = Number(b.paidAmount ?? 0);
                          return (
                            <tr key={b.id}>
                              <td>
                                <Link
                                  href={`/dashboard/sales/${b.id}`}
                                  className="font-mono text-xs font-bold text-brand-700 hover:underline inline-flex items-center gap-1"
                                >
                                  {b.invoiceNo || "Draft"} <ExternalLink className="h-3 w-3" />
                                </Link>
                              </td>
                              <td className="text-xs text-ink-600 whitespace-nowrap">
                                {formatISTDate(b.completedAt ?? b.createdAt)}
                              </td>
                              <td className="text-right font-mono text-xs">{formatINR(b.totalAmount ?? 0)}</td>
                              <td className="text-right font-mono text-xs text-emerald-700">{formatINR(paid)}</td>
                              <td className="text-right font-mono text-xs font-bold">
                                {due > 0 ? (
                                  <span className="text-rose-700">{formatINR(due)}</span>
                                ) : (
                                  <span className="badge badge-success">Paid</span>
                                )}
                              </td>
                              <td className="text-right">
                                {due > 0 ? (
                                  <div className="inline-flex items-center justify-end gap-1.5">
                                    <input
                                      type="number"
                                      min="1"
                                      step="0.01"
                                      placeholder={(due / 100).toFixed(0)}
                                      value={partialInputs[b.id] ?? ""}
                                      onChange={(e) =>
                                        setPartialInputs((prev) => ({ ...prev, [b.id]: e.target.value }))
                                      }
                                      className="input input-sm w-20 text-right font-mono text-xs"
                                    />
                                    <button
                                      type="button"
                                      disabled={isPending}
                                      onClick={() => handlePartialPay(b.id, due, b.invoiceNo)}
                                      className="btn btn-secondary btn-xs"
                                    >
                                      Receive
                                    </button>
                                    <button
                                      type="button"
                                      disabled={isPending}
                                      onClick={() => handleMarkSinglePaid(b.id, due, b.invoiceNo)}
                                      className="btn btn-primary btn-xs"
                                    >
                                      Mark Paid
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-[11px] text-ink-400 inline-flex items-center gap-1">
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Settled
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {history.receipts.length > 0 && (
                <div className="card overflow-hidden">
                  <div className="px-4 py-3 border-b border-ink-150 flex items-center gap-2">
                    <Clock className="h-4 w-4 text-ink-500" />
                    <h3 className="text-sm font-semibold text-ink-900">Payment Receipts History</h3>
                  </div>
                  <div className="divide-y divide-ink-100">
                    {history.receipts.map((r) => (
                      <div key={r.id} className="px-4 py-2.5 flex items-center justify-between text-xs">
                        <div>
                          <span className="font-mono font-bold text-ink-800">{r.paymentNo}</span>
                          <span className="text-ink-500 ml-2">
                            {r.paymentDate} · {r.method.toUpperCase()}
                          </span>
                          {r.note && <span className="text-ink-400 ml-2">({r.note})</span>}
                        </div>
                        <span className="font-mono font-bold text-emerald-700">
                          +{formatINR(Number(r.amount ?? 0))}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
