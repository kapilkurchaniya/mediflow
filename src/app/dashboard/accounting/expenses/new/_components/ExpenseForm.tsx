"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Receipt,
  Plus,
  Loader2,
  AlertCircle,
  Banknote,
  Building,
  CreditCard,
  QrCode,
  ShieldCheck,
} from "lucide-react";
import { recordExpenseAction } from "@/app/actions/expenses";
import { ExpenseCategoryModal } from "../../_components/ExpenseCategoryModal";
import { ExpenseVendorFields } from "./ExpenseVendorFields";
import { formatINR } from "@/lib/format";
import { getISTTodayString } from "@/lib/date-range";
import { buildDraftKey, useFormDraft } from "@/lib/useFormDraft";

interface ExpenseFormProps {
  categories: Array<{ id: string; name: string; code: string }>;
  hasOpenShift: boolean;
  storeName: string;
  initialOperationId?: string;
}

export function ExpenseForm({
  categories: initialCategories,
  hasOpenShift,
  storeName,
  initialOperationId = "",
}: ExpenseFormProps) {
  const router = useRouter();
  const [categories, setCategories] = useState(initialCategories);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [clientOperationId, setClientOperationId] = useState(initialOperationId);
  const defaultPaymentDate = useState(() => getISTTodayString())[0];
  const {
    value: draft,
    setValue: setDraft,
    clearDraft,
  } = useFormDraft(
    buildDraftKey("new-expense", storeName),
    {
      categoryId: categories[0]?.id || "",
      rupees: "",
      method: "cash" as "cash" | "upi" | "card" | "bank",
      paidFromTill: hasOpenShift,
      paymentDate: defaultPaymentDate,
      payeeName: "",
      reference: "",
      vendorInvoiceNo: "",
      vendorInvoiceDate: "",
      vendorGstin: "",
      note: "",
    },
    {
      isEmpty: (d) =>
        !d.rupees &&
        !d.payeeName &&
        !d.reference &&
        !d.vendorInvoiceNo &&
        !d.vendorGstin &&
        !d.note,
    }
  );

  const {
    categoryId,
    rupees,
    method,
    paidFromTill,
    paymentDate,
    payeeName,
    reference,
    vendorInvoiceNo,
    vendorInvoiceDate,
    vendorGstin,
    note,
  } = draft;
  const setCategoryId = (val: string) => setDraft((p) => ({ ...p, categoryId: val }));
  const setRupees = (val: string) => setDraft((p) => ({ ...p, rupees: val }));
  const setMethod = (val: "cash" | "upi" | "card" | "bank") =>
    setDraft((p) => ({ ...p, method: val }));
  const setPaidFromTill = (val: boolean) => setDraft((p) => ({ ...p, paidFromTill: val }));
  const setPaymentDate = (val: string) => setDraft((p) => ({ ...p, paymentDate: val }));
  const setPayeeName = (val: string) => setDraft((p) => ({ ...p, payeeName: val }));
  const setReference = (val: string) => setDraft((p) => ({ ...p, reference: val }));
  const setVendorInvoiceNo = (val: string) =>
    setDraft((p) => ({ ...p, vendorInvoiceNo: val }));
  const setVendorInvoiceDate = (val: string) =>
    setDraft((p) => ({ ...p, vendorInvoiceDate: val }));
  const setVendorGstin = (val: string) => setDraft((p) => ({ ...p, vendorGstin: val }));
  const setNote = (val: string) => setDraft((p) => ({ ...p, note: val }));

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Decimal-safe conversion
  const parsedRupees = parseFloat(rupees);
  const paise = !isNaN(parsedRupees) && parsedRupees > 0 ? Math.round(parsedRupees * 100) : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!categoryId) {
      setError("Please select an expense category.");
      return;
    }
    if (!Number.isSafeInteger(paise) || paise <= 0) {
      setError("Please enter a valid positive expense amount.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const opId = clientOperationId || crypto.randomUUID();
      if (!clientOperationId) setClientOperationId(opId);

      const res = await recordExpenseAction({
        clientOperationId: opId,
        expenseAccountId: categoryId,
        amount: paise,
        method,
        paidFromTill: method === "cash" ? paidFromTill : false,
        paymentDate,
        payeeName: payeeName.trim() || undefined,
        reference: reference.trim() || undefined,
        vendorInvoiceNo: vendorInvoiceNo.trim() || undefined,
        vendorInvoiceDate: vendorInvoiceDate || undefined,
        vendorGstin: vendorGstin.trim().toUpperCase() || undefined,
        note: note.trim() || undefined,
      });

      if (res?.data) {
        clearDraft();
        router.push("/dashboard/accounting/expenses");
        router.refresh();
      } else if (res?.serverError) {
        setError(res.serverError);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to record expense");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-rose-50 p-4 text-[13px] text-rose-700 border border-rose-200">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        <div className="card space-y-4 p-6 bg-white shadow-sm border border-ink-150">
          <h3 className="text-[15px] font-semibold text-ink-900 border-b border-ink-150 pb-3 flex items-center gap-2">
            <Receipt className="h-4 w-4 text-brand-600" />
            Voucher Particulars — {storeName}
          </h3>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <div className="flex items-center justify-between">
                <label className="block text-[13px] font-medium text-ink-700">
                  Expense Category <span className="text-rose-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(true)}
                  className="inline-flex items-center gap-1 text-[12px] font-medium text-brand-600 hover:text-brand-700"
                >
                  <Plus className="h-3 w-3" /> New Category
                </button>
              </div>
              <select
                required
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="select mt-1 w-full text-[13px]"
              >
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    [{cat.code}] {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[13px] font-medium text-ink-700">
                Amount (₹) <span className="text-rose-500">*</span>
              </label>
              <div className="relative mt-1">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-ink-400 text-[14px]">₹</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="0.00"
                  value={rupees}
                  onChange={(e) => setRupees(e.target.value)}
                  className="input w-full pl-8 font-medium text-[15px]"
                />
              </div>
              {paise > 0 && (
                <p className="mt-1 text-[11px] text-ink-500 font-mono">
                  Exact ledger amount: {formatINR(paise)} ({paise} paise)
                </p>
              )}
            </div>

            <div>
              <label className="block text-[13px] font-medium text-ink-700">Payment Method</label>
              <div className="mt-1 grid grid-cols-4 gap-2">
                {[
                  { id: "cash", label: "Cash", icon: Banknote },
                  { id: "upi", label: "UPI", icon: QrCode },
                  { id: "card", label: "Card", icon: CreditCard },
                  { id: "bank", label: "Bank", icon: Building },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setMethod(item.id as typeof method)}
                      className={`flex flex-col items-center justify-center rounded-lg border p-2.5 text-[12px] font-medium transition-all ${
                        method === item.id
                          ? "border-brand-600 bg-brand-50 text-brand-700"
                          : "border-ink-200 text-ink-600 hover:bg-ink-50"
                      }`}
                    >
                      <Icon className="h-4 w-4 mb-1" />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-[13px] font-medium text-ink-700">Payment Date</label>
              <input
                type="date"
                required
                max={new Date().toISOString().split("T")[0]}
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="input mt-1 w-full text-[13px]"
              />
            </div>
          </div>

          {method === "cash" && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={paidFromTill}
                  onChange={(e) => setPaidFromTill(e.target.checked)}
                  disabled={!hasOpenShift}
                  className="checkbox mt-0.5"
                />
                <div className="text-[13px]">
                  <span className="font-semibold text-amber-900">
                    Pay from active POS register till drawer
                  </span>
                  <p className="text-amber-700 text-[12px] mt-0.5">
                    {hasOpenShift
                      ? "Directly links to current open shift and deducts from expected drawer cash at shift closing."
                      : "No active shift open for this store. Payout will be recorded as office/safe cash."}
                  </p>
                </div>
              </label>
            </div>
          )}
        </div>

        <ExpenseVendorFields
          payeeName={payeeName}
          setPayeeName={setPayeeName}
          reference={reference}
          setReference={setReference}
          vendorInvoiceNo={vendorInvoiceNo}
          setVendorInvoiceNo={setVendorInvoiceNo}
          vendorInvoiceDate={vendorInvoiceDate}
          setVendorInvoiceDate={setVendorInvoiceDate}
          vendorGstin={vendorGstin}
          setVendorGstin={setVendorGstin}
          note={note}
          setNote={setNote}
        />

        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-1.5 text-[12px] text-ink-500">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <span>Idempotent key: <span className="font-mono">{clientOperationId ? `${clientOperationId.slice(0, 8)}...` : "pending"}</span></span>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              disabled={loading}
              className="btn btn-ghost"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !categoryId || paise <= 0}
              className="btn btn-primary min-w-[140px]"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Post Voucher
            </button>
          </div>
        </div>
      </form>

      <ExpenseCategoryModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCategoryCreated={(newCat) => {
          setCategories((prev) => [...prev, newCat]);
          setCategoryId(newCat.id);
        }}
      />
    </>
  );
}
