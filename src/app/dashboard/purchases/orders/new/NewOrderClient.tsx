"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, Save, Loader2, AlertCircle, ShoppingCart } from "lucide-react";
import { PageHeader } from "@/app/components/ui";
import { formatINR } from "@/lib/format";
import { createPurchaseOrderAction } from "@/app/actions/purchase-orders";
import { QuickRegisterSupplierModal } from "@/app/components/QuickRegisterSupplierModal";
import { buildDraftKey, useFormDraft } from "@/lib/useFormDraft";

interface MedicineOption {
  id: string;
  name: string;
  genericName: string | null;
  packSize: string | null;
  mrp: number | null;
}

interface OrderLineItem {
  medicineId: string;
  qty: number;
  freeQty: number;
  rateRupees: number; // in rupees for UI input, converted to paise on submit
}

export function NewOrderClient({
  suppliers: initialSuppliers,
  medicines,
  canManageSuppliers = false,
  initialSupplierId = "",
}: {
  suppliers: { id: string; name: string }[];
  medicines: MedicineOption[];
  canManageSuppliers?: boolean;
  initialSupplierId?: string;
}) {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [isAddSupplierOpen, setIsAddSupplierOpen] = useState(false);

  const defaultItems: OrderLineItem[] = [{ medicineId: "", qty: 10, freeQty: 0, rateRupees: 0 }];
  const initialSup =
    initialSupplierId && initialSuppliers.some((s) => s.id === initialSupplierId)
      ? initialSupplierId
      : "";

  const {
    value: draft,
    setValue: setDraft,
    hasRestoredDraft,
    clearDraft,
    dismissRestoredNotice,
  } = useFormDraft(
    buildDraftKey("new-po"),
    {
      supplierId: initialSup,
      expectedDate: "",
      notes: "",
      items: defaultItems,
    },
    {
      isEmpty: (d) =>
        !d.supplierId &&
        !d.expectedDate &&
        !d.notes &&
        d.items.length === 1 &&
        !d.items[0].medicineId,
    }
  );

  const { supplierId, expectedDate, notes, items } = draft;
  const setSupplierId = (val: string) =>
    setDraft((prev) => ({ ...prev, supplierId: val }));
  const setExpectedDate = (val: string) =>
    setDraft((prev) => ({ ...prev, expectedDate: val }));
  const setNotes = (val: string) =>
    setDraft((prev) => ({ ...prev, notes: val }));
  const setItems = (updater: OrderLineItem[] | ((prev: OrderLineItem[]) => OrderLineItem[])) =>
    setDraft((prev) => ({
      ...prev,
      items: typeof updater === "function" ? updater(prev.items) : updater,
    }));

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleAddItem = () => {
    setItems((prev) => [...prev, { medicineId: "", qty: 10, freeQty: 0, rateRupees: 0 }]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: keyof OrderLineItem, value: string | number) => {
    setItems((prev) => {
      const updated = [...prev];
      const item = { ...updated[index] };

      if (field === "medicineId") {
        item.medicineId = String(value);
        // Estimate rate as 70% of MRP if available
        const selectedMed = medicines.find((m) => m.id === value);
        if (selectedMed?.mrp && item.rateRupees === 0) {
          item.rateRupees = Math.round((selectedMed.mrp / 100) * 0.7);
        }
      } else if (field === "qty") {
        item.qty = Math.max(1, Number(value) || 1);
      } else if (field === "freeQty") {
        item.freeQty = Math.max(0, Number(value) || 0);
      } else if (field === "rateRupees") {
        item.rateRupees = Math.max(0, Number(value) || 0);
      }

      updated[index] = item;
      return updated;
    });
  };

  const totalPaise = items.reduce((sum, item) => sum + item.qty * Math.round(item.rateRupees * 100), 0);
  const totalUnits = items.reduce((sum, item) => sum + item.qty + item.freeQty, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!supplierId) {
      setErrorMsg("Please select a supplier.");
      return;
    }
    const emptyMeds = items.some((i) => !i.medicineId);
    if (emptyMeds) {
      setErrorMsg("Please select a medicine for every row.");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        supplierId,
        expectedDate: expectedDate || undefined,
        notes: notes.trim() || undefined,
        items: items.map((i) => ({
          medicineId: i.medicineId,
          qty: i.qty,
          freeQty: i.freeQty,
          rate: Math.round(i.rateRupees * 100), // convert to paise
        })),
      };

      const res = await createPurchaseOrderAction(payload);
      if (res?.data?.id) {
        clearDraft();
        router.push(`/dashboard/purchases/orders/${res.data.id}`);
      } else if (res?.serverError) {
        setErrorMsg(res.serverError);
      } else {
        setErrorMsg("Failed to create purchase order. Please verify the input.");
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Unexpected error saving purchase order.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="page space-y-6">
      <div className="flex items-center gap-2 text-sm text-ink-600 mb-2">
        <Link
          href="/dashboard/purchases/orders"
          className="flex items-center gap-1.5 hover:text-brand-700 font-medium transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Purchase Orders
        </Link>
      </div>

      <PageHeader
        title="New Purchase Order"
        description="Draft a replenishment order for scheduled delivery from your distributor."
      />

      {hasRestoredDraft && (
        <div className="rounded-lg border border-brand-200 bg-brand-50/70 px-4 py-2.5 text-xs text-brand-900 flex flex-wrap items-center justify-between gap-2">
          <span>
            Restored your unsaved Purchase Order draft ({items.length} line{items.length === 1 ? "" : "s"}).
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() =>
                clearDraft({
                  supplierId: "",
                  expectedDate: "",
                  notes: "",
                  items: defaultItems,
                })
              }
              className="font-semibold text-rose-700 hover:underline"
            >
              Discard Draft
            </button>
            <button
              type="button"
              onClick={dismissRestoredNotice}
              className="text-brand-700 hover:underline"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Supplier & Order Meta */}
        <div className="card p-5 space-y-4">
          <h3 className="text-sm font-bold text-ink-900 border-b border-ink-150 pb-2">
            Procurement Details
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="po-supplier" className="label text-xs font-semibold">
                  Supplier / Wholesaler <span className="text-rose-500">*</span>
                </label>
                {canManageSuppliers && suppliers.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setIsAddSupplierOpen(true)}
                    className="text-[11px] font-semibold text-brand-600 hover:text-brand-800 hover:underline"
                  >
                    + New Supplier
                  </button>
                )}
              </div>
              {suppliers.length === 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-900 space-y-2">
                  <p className="font-medium">
                    No active suppliers found. Add a supplier before raising a Purchase Order.
                  </p>
                  {canManageSuppliers ? (
                    <button
                      type="button"
                      onClick={() => setIsAddSupplierOpen(true)}
                      className="btn btn-primary btn-sm inline-flex items-center gap-1.5"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add Supplier
                    </button>
                  ) : (
                    <p className="text-[11px] text-amber-700">
                      Ask your store manager or owner to add a supplier first.
                    </p>
                  )}
                </div>
              ) : (
                <select
                  id="po-supplier"
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  required
                  className="w-full text-xs p-2 rounded-lg border border-ink-200 bg-white text-ink-900 focus:outline-hidden focus:ring-1 focus:ring-brand-500"
                >
                  <option value="">-- Choose Supplier --</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label htmlFor="po-expected-date" className="label text-xs font-semibold block mb-1">
                Expected Delivery Date
              </label>
              <input
                id="po-expected-date"
                type="date"
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
                className="w-full text-xs p-2 rounded-lg border border-ink-200 bg-white text-ink-900 focus:outline-hidden focus:ring-1 focus:ring-brand-500"
              />
            </div>

            <div>
              <label htmlFor="po-notes" className="label text-xs font-semibold block mb-1">
                Notes & Terms (Optional)
              </label>
              <input
                id="po-notes"
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Urgent stock, delivery before 12 PM"
                maxLength={500}
                className="w-full text-xs p-2 rounded-lg border border-ink-200 bg-white text-ink-900 focus:outline-hidden focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>
        </div>

        {/* Line Items Card */}
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-ink-150 pb-2">
            <h3 className="text-sm font-bold text-ink-900 flex items-center gap-1.5">
              <ShoppingCart className="w-4 h-4 text-brand-600" /> Line Items
            </h3>
            <button
              type="button"
              onClick={handleAddItem}
              className="btn btn-secondary text-xs py-1 px-2.5"
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Medicine
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-ink-200 bg-ink-50/70 text-ink-700 font-bold">
                  <th className="py-2 px-2.5 w-10 text-center">#</th>
                  <th className="py-2 px-2.5 min-w-[240px]">Medicine</th>
                  <th className="py-2 px-2.5 w-24 text-center">Qty</th>
                  <th className="py-2 px-2.5 w-24 text-center">Free Qty</th>
                  <th className="py-2 px-2.5 w-32 text-right">Est. Rate (₹)</th>
                  <th className="py-2 px-2.5 w-32 text-right">Line Total (₹)</th>
                  <th className="py-2 px-2.5 w-12 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-150">
                {items.map((item, index) => {
                  const lineTotalPaise = item.qty * Math.round(item.rateRupees * 100);

                  return (
                    <tr key={index} className="hover:bg-ink-50/50">
                      <td className="py-2.5 px-2 text-center text-ink-400 font-mono">
                        {index + 1}
                      </td>
                      <td className="py-2.5 px-2">
                        <select
                          value={item.medicineId}
                          onChange={(e) => handleItemChange(index, "medicineId", e.target.value)}
                          required
                          className="w-full text-xs p-1.5 rounded border border-ink-200 bg-white text-ink-900 focus:outline-hidden focus:ring-1 focus:ring-brand-500"
                        >
                          <option value="">-- Choose Medicine --</option>
                          {medicines.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name} {m.packSize ? `(${m.packSize})` : ""}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2.5 px-2">
                        <input
                          type="number"
                          min="1"
                          value={item.qty}
                          onChange={(e) => handleItemChange(index, "qty", e.target.value)}
                          required
                          className="w-full text-xs p-1.5 rounded border border-ink-200 text-center font-mono focus:outline-hidden focus:ring-1 focus:ring-brand-500"
                        />
                      </td>
                      <td className="py-2.5 px-2">
                        <input
                          type="number"
                          min="0"
                          value={item.freeQty}
                          onChange={(e) => handleItemChange(index, "freeQty", e.target.value)}
                          className="w-full text-xs p-1.5 rounded border border-ink-200 text-center font-mono focus:outline-hidden focus:ring-1 focus:ring-brand-500"
                        />
                      </td>
                      <td className="py-2.5 px-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.rateRupees || ""}
                          onChange={(e) => handleItemChange(index, "rateRupees", e.target.value)}
                          placeholder="0.00"
                          className="w-full text-xs p-1.5 rounded border border-ink-200 text-right font-mono focus:outline-hidden focus:ring-1 focus:ring-brand-500"
                        />
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono font-semibold text-ink-900">
                        {formatINR(lineTotalPaise)}
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(index)}
                          disabled={items.length <= 1}
                          className="text-ink-400 hover:text-rose-600 disabled:opacity-30 disabled:hover:text-ink-400 transition-colors p-1"
                          title="Remove line"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={handleAddItem}
              className="text-xs text-brand-700 hover:text-brand-800 font-semibold flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Add another item
            </button>
          </div>
        </div>

        {/* Totals Summary and Submit Bar */}
        <div className="card p-5 flex flex-col md:flex-row items-center justify-between gap-4 bg-ink-50/70 border border-ink-200">
          <div className="flex items-center gap-6 text-xs text-ink-600">
            <div>
              Total Lines: <span className="font-bold text-ink-900 num">{items.length}</span>
            </div>
            <div>
              Total Units: <span className="font-bold text-ink-900 num">{totalUnits}</span>
            </div>
            <div>
              Estimated Total:{" "}
              <span className="font-black text-brand-700 font-mono text-base ml-1">
                {formatINR(totalPaise)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/dashboard/purchases/orders" className="btn btn-secondary text-xs">
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn btn-primary text-xs flex items-center gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving Draft...
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" /> Save as Draft PO
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      <QuickRegisterSupplierModal
        isOpen={isAddSupplierOpen}
        onClose={() => setIsAddSupplierOpen(false)}
        initialMeta={{ name: "", gstin: null, phone: null, drugLicenseNo: null, address: null }}
        title="Quick Add Supplier"
        subtitle="Add a distributor without losing your Purchase Order items."
        onRegistered={(sup) => {
          setSuppliers((prev) => [{ id: sup.id, name: sup.name }, ...prev.filter((s) => s.id !== sup.id)]);
          setSupplierId(sup.id);
        }}
      />
    </div>
  );
}

