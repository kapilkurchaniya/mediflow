"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, AlertCircle, Landmark, Plus, XCircle, ArrowRightCircle } from "lucide-react";
import { clearPdcAction, depositPdcAction, dishonourPdcAction, registerPdcAction } from "@/app/actions/pdc";
import { formatINR } from "@/lib/format";

interface PdcRow {
  id: string;
  direction: string;
  partyType: string;
  partyName: string;
  chequeNo: string;
  chequeDate: string;
  bankName: string;
  amount: number;
  status: string;
  payInSlipNo: string | null;
  dishonourReason: string | null;
}

interface PartyOption {
  id: string;
  name: string;
}

export function PdcClient({
  cheques,
  customers,
  suppliers,
}: {
  cheques: PdcRow[];
  customers: PartyOption[];
  suppliers: PartyOption[];
}) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [direction, setDirection] = useState<"inward" | "outward">("inward");
  const [partyId, setPartyId] = useState(customers[0]?.id ?? "");
  const [partyName, setPartyName] = useState(customers[0]?.name ?? "");
  const [chequeNo, setChequeNo] = useState("");
  const [chequeDate, setChequeDate] = useState(today);
  const [bankName, setBankName] = useState("");
  const [amountRs, setAmountRs] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const parties = direction === "inward" ? customers : suppliers;

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMsg(null);
    try {
      const res = await registerPdcAction({
        direction,
        partyType: direction === "inward" ? "customer" : "supplier",
        partyId: partyId || null,
        partyName: partyName || "Party",
        chequeNo,
        chequeDate,
        bankName,
        amountPaise: Math.round((parseFloat(amountRs) || 0) * 100),
      });
      if (!res.success) {
        setMsg({ type: "err", text: res.error || "Failed to register cheque" });
      } else {
        setMsg({ type: "ok", text: `Registered PDC #${chequeNo}` });
        setChequeNo("");
        setAmountRs("");
        router.refresh();
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {msg && (
        <div
          className={`p-3.5 rounded-xl border text-sm flex items-center gap-2 ${
            msg.type === "ok"
              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
              : "bg-rose-50 border-rose-200 text-rose-700"
          }`}
        >
          {msg.type === "ok" ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{msg.text}</span>
        </div>
      )}

      <form onSubmit={handleRegister} className="card p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink-900">
          <Landmark className="w-4 h-4 text-brand-600" /> Register Post-Dated Cheque
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div>
            <label className="label">Type</label>
            <select
              className="input"
              value={direction}
              onChange={(e) => {
                const d = e.target.value as "inward" | "outward";
                setDirection(d);
                const list = d === "inward" ? customers : suppliers;
                setPartyId(list[0]?.id ?? "");
                setPartyName(list[0]?.name ?? "");
              }}
            >
              <option value="inward">Inward (Customer)</option>
              <option value="outward">Outward (Supplier)</option>
            </select>
          </div>
          <div>
            <label className="label">{direction === "inward" ? "Customer" : "Supplier"}</label>
            <select
              className="input"
              value={partyId}
              onChange={(e) => {
                setPartyId(e.target.value);
                const found = parties.find((p) => p.id === e.target.value);
                if (found) setPartyName(found.name);
              }}
            >
              {parties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Cheque No</label>
            <input className="input font-mono" value={chequeNo} onChange={(e) => setChequeNo(e.target.value)} required />
          </div>
          <div>
            <label className="label">Cheque Date</label>
            <input type="date" className="input" value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} required />
          </div>
          <div>
            <label className="label">Bank Name</label>
            <input className="input" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. HDFC" required />
          </div>
          <div>
            <label className="label">Amount (₹)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              className="input font-mono"
              value={amountRs}
              onChange={(e) => setAmountRs(e.target.value)}
              required
            />
          </div>
        </div>
        <div className="flex justify-end">
          <button type="submit" disabled={submitting} className="btn btn-primary btn-sm">
            <Plus className="w-4 h-4" /> {submitting ? "Saving..." : "Add to PDC Register"}
          </button>
        </div>
      </form>

      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-ink-150 bg-ink-50/50">
          <h3 className="text-sm font-semibold text-ink-900">PDC Register ({cheques.length})</h3>
        </div>
        {cheques.length === 0 ? (
          <div className="p-8 text-center text-sm text-ink-500">No post-dated cheques registered yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-ink-50 text-xs uppercase text-ink-500">
                <tr>
                  <th className="p-3 text-left">Cheque Date</th>
                  <th className="p-3 text-left">Cheque No / Bank</th>
                  <th className="p-3 text-left">Party</th>
                  <th className="p-3 text-left">Direction</th>
                  <th className="p-3 text-right">Amount</th>
                  <th className="p-3 text-left">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {cheques.map((c) => (
                  <tr key={c.id}>
                    <td className="p-3 font-mono">{c.chequeDate}</td>
                    <td className="p-3">
                      <div className="font-mono font-semibold">{c.chequeNo}</div>
                      <div className="text-xs text-ink-500">{c.bankName}</div>
                    </td>
                    <td className="p-3 font-medium">{c.partyName}</td>
                    <td className="p-3 capitalize">{c.direction}</td>
                    <td className="p-3 text-right font-mono font-semibold">{formatINR(c.amount)}</td>
                    <td className="p-3">
                      <span className="badge badge-neutral capitalize">{c.status}</span>
                      {c.payInSlipNo && <div className="text-[11px] text-ink-500">Slip: {c.payInSlipNo}</div>}
                      {c.dishonourReason && <div className="text-[11px] text-rose-600">{c.dishonourReason}</div>}
                    </td>
                    <td className="p-3 text-right space-x-1.5 whitespace-nowrap">
                      {c.status === "pending" && (
                        <button
                          type="button"
                          onClick={async () => {
                            const res = await depositPdcAction({
                              pdcId: c.id,
                              payInSlipNo: `SLIP-${c.chequeNo}`,
                              depositedAt: today,
                            });
                            if (res.success) router.refresh();
                          }}
                          className="btn btn-xs btn-secondary"
                        >
                          Pay-in-Slip
                        </button>
                      )}
                      {(c.status === "pending" || c.status === "deposited") && (
                        <>
                          <button
                            type="button"
                            onClick={async () => {
                              const res = await clearPdcAction({ pdcId: c.id, clearedAt: today });
                              if (res.success) {
                                setMsg({ type: "ok", text: `Cheque ${c.chequeNo} cleared (${res.entryNo})` });
                                router.refresh();
                              } else {
                                setMsg({ type: "err", text: res.error || "Failed to clear" });
                              }
                            }}
                            className="btn btn-xs btn-primary"
                          >
                            <ArrowRightCircle className="w-3 h-3" /> Clear
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              const res = await dishonourPdcAction({
                                pdcId: c.id,
                                reason: "Insufficient funds / dishonoured",
                              });
                              if (res.success) router.refresh();
                            }}
                            className="btn btn-xs btn-ghost text-rose-600"
                          >
                            <XCircle className="w-3 h-3" /> Bounce
                          </button>
                        </>
                      )}
                    </td>
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
