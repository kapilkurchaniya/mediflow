"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatINR } from "@/lib/format";
import { actionError } from "@/lib/action-result";
import { getOpenBills, recordReceipt } from "@/app/actions/payments";

type Customer = { id: string; name: string; phone: string | null; due: number; bills: number };
type Bill = { id: string; invoiceNo: string | null; date: Date | null; total: number | null; paid: number | null; due: number | null };
type Recent = { id: string; paymentNo: string; paymentDate: string; method: string; amount: number | null; reference: string | null; partyName: string | null };

const METHODS = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "bank", label: "Bank transfer" },
] as const;

const toPaise = (v: string) => {
  const n = Math.round(parseFloat(v) * 100);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const toRupees = (paise: number) => (paise / 100).toFixed(2);

export function ReceiptsClient({ customers, recent }: { customers: Customer[]; recent: Recent[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [bills, setBills] = useState<Bill[]>([]);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [method, setMethod] = useState<(typeof METHODS)[number]["value"]>("cash");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const shown = customers.filter((c) => `${c.name} ${c.phone ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  const total = Object.values(amounts).reduce((sum, v) => sum + toPaise(v), 0);

  const pick = (c: Customer) => {
    setCustomer(c);
    setAmounts({});
    setError(null);
    setDone(null);
    startTransition(async () => setBills(await getOpenBills(c.id)));
  };

  const payInFull = (b: Bill) => setAmounts((a) => ({ ...a, [b.id]: toRupees(b.due ?? 0) }));
  const payAll = () => setAmounts(Object.fromEntries(bills.map((b) => [b.id, toRupees(b.due ?? 0)])));

  const submit = () => {
    if (!customer) return;
    setError(null);
    const lines = bills
      .map((b) => ({ saleId: b.id, amount: toPaise(amounts[b.id] ?? "") }))
      .filter((l) => l.amount > 0);
    if (lines.some((l) => l.amount > (bills.find((b) => b.id === l.saleId)?.due ?? 0))) {
      return setError("An amount is more than the bill's outstanding balance.");
    }
    startTransition(async () => {
      const res = await recordReceipt({
        customerId: customer.id,
        method,
        paymentDate: date,
        reference: reference || undefined,
        note: note || undefined,
        bills: lines,
      });
      const err = actionError(res);
      if (err) return setError(err);
      setDone(`Receipt ${res!.data!.paymentNo} recorded: ${formatINR(total)} from ${customer.name}.`);
      setCustomer(null);
      setBills([]);
      setAmounts({});
      setReference("");
      setNote("");
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      {done && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-[13px] text-emerald-800">{done}</div>}

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="card p-4 space-y-3">
          <h2 className="text-[14px] font-semibold text-ink-900">1. Choose the customer</h2>
          <input className="input" placeholder="Search name or phone" value={search} onChange={(e) => setSearch(e.target.value)} />
          {customers.length === 0 ? (
            <p className="text-[13px] text-ink-500">No customer has an unpaid bill.</p>
          ) : (
            <ul className="divide-y divide-ink-150 max-h-[420px] overflow-y-auto">
              {shown.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => pick(c)}
                    className={`w-full text-left py-2.5 px-2 rounded-md hover:bg-ink-50 ${customer?.id === c.id ? "bg-brand-50" : ""}`}
                  >
                    <span className="block text-[13.5px] font-medium text-ink-900">{c.name}</span>
                    <span className="block text-[12px] text-ink-500">
                      {c.bills} unpaid bill{c.bills === 1 ? "" : "s"} · owes <strong>{formatINR(c.due)}</strong>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-4 space-y-4">
          <h2 className="text-[14px] font-semibold text-ink-900">2. Settle their bills</h2>
          {!customer ? (
            <p className="text-[13px] text-ink-500">Pick a customer on the left to see what they owe.</p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-[13px] text-ink-700">
                  <strong>{customer.name}</strong> owes {formatINR(customer.due)}
                </p>
                <button type="button" className="btn btn-secondary btn-sm" onClick={payAll}>Settle all bills in full</button>
              </div>
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Date</th>
                      <th className="text-right">Bill total</th>
                      <th className="text-right">Outstanding</th>
                      <th className="text-right">Receive now (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bills.map((b) => (
                      <tr key={b.id}>
                        <td className="font-mono text-[12.5px]">{b.invoiceNo}</td>
                        <td>{b.date ? new Date(b.date).toLocaleDateString("en-IN") : "—"}</td>
                        <td className="text-right">{formatINR(b.total)}</td>
                        <td className="text-right">{formatINR(b.due)}</td>
                        <td className="text-right whitespace-nowrap">
                          <input
                            className="input !w-28 text-right"
                            inputMode="decimal"
                            placeholder="0.00"
                            aria-label={`Amount received for ${b.invoiceNo}`}
                            value={amounts[b.id] ?? ""}
                            onChange={(e) => setAmounts((a) => ({ ...a, [b.id]: e.target.value }))}
                          />
                          <button type="button" className="btn btn-ghost btn-sm ml-1" onClick={() => payInFull(b)}>Full</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="text-xs font-medium text-ink-700">
                  Payment method
                  <select className="input mt-1" value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
                    {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </label>
                <label className="text-xs font-medium text-ink-700">
                  Date
                  <input type="date" className="input mt-1" value={date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} />
                </label>
                <label className="text-xs font-medium text-ink-700">
                  Reference (UPI id, cheque no.)
                  <input className="input mt-1" value={reference} onChange={(e) => setReference(e.target.value)} />
                </label>
              </div>
              <label className="block text-xs font-medium text-ink-700">
                Note (optional)
                <input className="input mt-1" value={note} onChange={(e) => setNote(e.target.value)} />
              </label>

              {error && <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-[12.5px] text-red-700">{error}</div>}

              <button type="button" className="btn btn-primary" disabled={pending || total === 0} onClick={submit}>
                {pending ? "Saving…" : `Record receipt of ${formatINR(total)}`}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="card p-4">
        <h2 className="text-[14px] font-semibold text-ink-900 mb-3">Recent receipts</h2>
        {recent.length === 0 ? (
          <p className="text-[13px] text-ink-500">No receipts yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr><th>Receipt</th><th>Date</th><th>Customer</th><th>Method</th><th>Reference</th><th className="text-right">Amount</th></tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id}>
                    <td className="font-mono text-[12.5px]">{r.paymentNo}</td>
                    <td>{r.paymentDate}</td>
                    <td>{r.partyName ?? "—"}</td>
                    <td className="uppercase text-[12px]">{r.method}</td>
                    <td>{r.reference ?? "—"}</td>
                    <td className="text-right">{formatINR(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
