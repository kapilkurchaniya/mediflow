"use client";

import { useActionState, useEffect, useState, Suspense } from "react";
import { useSearchParams, redirect } from "next/navigation";
import Link from "next/link";
import { createPurchaseInvoice, PurchaseItemInput } from "@/app/actions/purchases";
import { getSuppliers } from "@/app/actions/suppliers";
import { getMedicines } from "@/app/actions/inventory";
import { getPurchaseOrder } from "@/app/actions/purchase-orders";
import { Save, Plus, Trash2, FileText, Truck, AlertCircle, ClipboardList } from "lucide-react";
import { PageHeader } from "@/app/components/ui";
import { formatINR } from "@/lib/format";
import { DEFAULT_GST_RATE_BP, isValidGstRateBp, type GstRateBp } from "@/lib/regulatory";

function NewPurchaseForm() {
  const searchParams = useSearchParams();
  const poId = searchParams.get("poId");

  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [medicines, setMedicines] = useState<{ id: string; name: string; gstRateBp: number }[]>([]);
  const [linkedPo, setLinkedPo] = useState<{ id: string; poNo: string } | null>(null);

  const [supplierId, setSupplierId] = useState("");
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split("T")[0]);

  const [items, setItems] = useState<PurchaseItemInput[]>([]);

  useEffect(() => {
    getSuppliers().then(setSuppliers);
    getMedicines("", 500).then((data) => {
      setMedicines(
        data.map((m) => ({
          id: m.medicine.id,
          name: m.medicine.name,
          gstRateBp: m.medicine.gstRateBp,
        }))
      );
    });

    if (poId) {
      getPurchaseOrder(poId).then((po) => {
        if (po) {
          setLinkedPo({ id: po.id, poNo: po.poNo });
          setSupplierId(po.supplierId);
          if (po.items && po.items.length > 0) {
            setItems(
              po.items.map((i) => ({
                medicineId: i.medicineId,
                batchNo: "",
                expiryDate: "",
                qty: Math.max(1, i.qty - i.receivedQty),
                freeQty: i.freeQty,
                rate: i.rate,
                mrp: Math.round(i.rate * 1.3),
                saleRate: Math.round(i.rate * 1.2),
                discountBp: 0,
                gstRateBp: DEFAULT_GST_RATE_BP,
              }))
            );
          }
        }
      });
    }
  }, [poId]);

  const [state, formAction, isPending] = useActionState(
    async (_prevState: { error?: string; success?: boolean } | null, _formData: FormData) => {
      if (!supplierId) return { error: "Please select a supplier." };
      if (!supplierInvoiceNo.trim()) return { error: "Supplier invoice number is required." };
      if (items.length === 0) return { error: "Please add at least one line item." };

      const res = await createPurchaseInvoice(
        supplierId,
        supplierInvoiceNo.trim(),
        invoiceDate,
        items,
        undefined,
        linkedPo?.id
      );
      if (res.success) redirect("/dashboard/purchases");
      return res;
    },
    null
  );

  const handleAddItem = () => {
    setItems([
      ...items,
      {
        medicineId: "",
        batchNo: "",
        expiryDate: "",
        qty: 1,
        freeQty: 0,
        rate: 0,
        mrp: 0,
        saleRate: 0,
        discountBp: 0,
        gstRateBp: DEFAULT_GST_RATE_BP,
      },
    ]);
  };

  const updateItem = <K extends keyof PurchaseItemInput>(index: number, field: K, value: PurchaseItemInput[K]) => {
    const newItems = [...items];
    newItems[index][field] = value;
    setItems(newItems);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const totals = items.reduce(
    (acc, item) => {
      const gross = item.qty * item.rate;
      const discount = Math.round((gross * (item.discountBp || 0)) / 10000);
      const taxable = gross - discount;
      const gst = Math.round((taxable * item.gstRateBp) / 10000);
      const total = taxable + gst;

      return {
        gross: acc.gross + gross,
        disc: acc.disc + discount,
        tax: acc.tax + gst,
        net: acc.net + total,
      };
    },
    { gross: 0, disc: 0, tax: 0, net: 0 }
  );

  return (
    <div className="page space-y-6">
      <PageHeader
        backHref="/dashboard/purchases"
        eyebrow="Inventory Inward"
        title="Record Purchase Invoice (GRN)"
        description="Receive stock from suppliers, update batch inventories, and book payable journals."
      />

      {linkedPo && (
        <div className="card p-3.5 bg-brand-50 border border-brand-200 text-brand-900 text-xs flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-brand-600 shrink-0" />
            <span>
              Receiving goods against <strong>Purchase Order {linkedPo.poNo}</strong>. Items and rates pre-filled.
            </span>
          </div>
          <Link
            href={`/dashboard/purchases/orders/${linkedPo.id}`}
            className="text-brand-700 underline font-semibold text-xs hover:text-brand-900"
          >
            View PO Details
          </Link>
        </div>
      )}

      {state?.error && (
        <div className="alert alert-error">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{state.error}</span>
        </div>
      )}

      <form action={formAction} className="space-y-6">
        {/* Invoice Info Card */}
        <div className="card p-5 space-y-4">
          <h3 className="card-title text-[14px] border-b border-ink-150 pb-2">Supplier & Bill Info</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="grn-supplier-select" className="label required">Supplier</label>
              <div className="relative">
                <Truck className="absolute left-3 top-2.5 h-4 w-4 text-ink-400" />
                <select
                  id="grn-supplier-select"
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="input pl-9"
                  required
                >
                  <option value="">Select Supplier</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="grn-invoice-no-input" className="label required">Supplier Invoice No.</label>
              <div className="relative">
                <FileText className="absolute left-3 top-2.5 h-4 w-4 text-ink-400" />
                <input
                  id="grn-invoice-no-input"
                  type="text"
                  value={supplierInvoiceNo}
                  onChange={(e) => setSupplierInvoiceNo(e.target.value)}
                  placeholder="e.g. INV-9842"
                  className="input pl-9 uppercase"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="grn-invoice-date-input" className="label required">Invoice Date</label>
              <input
                id="grn-invoice-date-input"
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="input"
                required
              />
            </div>
          </div>
        </div>

        {/* Batch Line Items Card */}
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-ink-150 flex items-center justify-between">
            <div>
              <h3 className="card-title text-[14px]">Invoice Items & Batches</h3>
              <p className="card-description">Enter batch details, quantities, cost rates, and GST.</p>
            </div>
            <button
              type="button"
              onClick={handleAddItem}
              className="btn btn-secondary text-xs"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Row
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="data-table text-[12px] w-full">
              <thead>
                <tr>
                  <th className="w-48">Medicine</th>
                  <th className="w-28">Batch No</th>
                  <th className="w-28">Expiry</th>
                  <th className="w-16 text-center">Qty</th>
                  <th className="w-16 text-center">Free</th>
                  <th className="w-24 text-right">Cost Rate (₹)</th>
                  <th className="w-20 text-center">GST %</th>
                  <th className="w-24 text-right">MRP (₹)</th>
                  <th className="w-24 text-right">Sale Rate (₹)</th>
                  <th className="w-16 text-center">Disc %</th>
                  <th className="w-24 text-right">Total</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="text-center py-8 text-ink-400">
                      No line items yet. Click &ldquo;Add Row&rdquo; to start recording received batches.
                    </td>
                  </tr>
                ) : (
                  items.map((item, index) => {
                    const gross = item.qty * item.rate;
                    const discount = Math.round((gross * (item.discountBp || 0)) / 10000);
                    const taxable = gross - discount;
                    const gst = Math.round((taxable * item.gstRateBp) / 10000);
                    const lineTotal = taxable + gst;

                    return (
                      <tr key={index} className="hover:bg-ink-50/50">
                        <td>
                          <select
                            value={item.medicineId}
                            onChange={(e) => {
                              const med = medicines.find((m) => m.id === e.target.value);
                              updateItem(index, "medicineId", e.target.value);
                              if (med) {
                                updateItem(index, "gstRateBp", isValidGstRateBp(med.gstRateBp) ? med.gstRateBp : DEFAULT_GST_RATE_BP);
                              }
                            }}
                            className="input !h-8.5 text-[12px]"
                            required
                          >
                            <option value="">Select Item</option>
                            {medicines.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            type="text"
                            value={item.batchNo}
                            onChange={(e) => updateItem(index, "batchNo", e.target.value.toUpperCase())}
                            className="input !h-8.5 font-mono uppercase text-[12px]"
                            placeholder="BATCH-12"
                            required
                          />
                        </td>
                        <td>
                          <input
                            type="date"
                            value={item.expiryDate}
                            onChange={(e) => updateItem(index, "expiryDate", e.target.value)}
                            className="input !h-8.5 text-[11px]"
                            required
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="1"
                            value={item.qty || ""}
                            onChange={(e) => updateItem(index, "qty", parseInt(e.target.value, 10) || 0)}
                            className="input !h-8.5 text-center num text-[12.5px]"
                            required
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            value={item.freeQty || ""}
                            onChange={(e) => updateItem(index, "freeQty", parseInt(e.target.value, 10) || 0)}
                            className="input !h-8.5 text-center num text-[12.5px]"
                            placeholder="0"
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.rate ? (item.rate / 100).toFixed(2) : ""}
                            onChange={(e) =>
                              updateItem(index, "rate", Math.round(parseFloat(e.target.value) * 100) || 0)
                            }
                            className="input !h-8.5 text-right num text-[12.5px]"
                            placeholder="0.00"
                            required
                          />
                        </td>
                        <td>
                          <select
                            value={item.gstRateBp}
                            onChange={(e) => updateItem(index, "gstRateBp", parseInt(e.target.value, 10) as GstRateBp)}
                            className="input !h-8.5 text-center num text-[12px]"
                          >
                            <option value={0}>0%</option>
                            <option value={500}>5%</option>
                            <option value={1200}>12%</option>
                            <option value={1800}>18%</option>
                            <option value={2800}>28%</option>
                          </select>
                        </td>
                        <td>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.mrp ? (item.mrp / 100).toFixed(2) : ""}
                            onChange={(e) =>
                              updateItem(index, "mrp", Math.round(parseFloat(e.target.value) * 100) || 0)
                            }
                            className="input !h-8.5 text-right num text-[12.5px]"
                            placeholder="0.00"
                            required
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.saleRate ? (item.saleRate / 100).toFixed(2) : ""}
                            onChange={(e) =>
                              updateItem(index, "saleRate", Math.round(parseFloat(e.target.value) * 100) || 0)
                            }
                            className="input !h-8.5 text-right num text-[12.5px]"
                            placeholder="0.00"
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            max="100"
                            value={item.discountBp ? item.discountBp / 100 : ""}
                            onChange={(e) =>
                              updateItem(index, "discountBp", Math.round(parseFloat(e.target.value) * 100) || 0)
                            }
                            className="input !h-8.5 text-center num text-[12px]"
                            placeholder="0"
                          />
                        </td>
                        <td className="text-right font-bold num text-ink-900 text-[13px]">
                          {formatINR(lineTotal)}
                        </td>
                        <td className="text-right">
                          <button
                            type="button"
                            onClick={() => removeItem(index)}
                            className="text-ink-400 hover:text-red-600 transition-colors p-1"
                            title="Remove line"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Summary Card & Save Button */}
        <div className="flex justify-end">
          <div className="card w-full md:w-88 p-5 space-y-3 shadow-xs">
            <h3 className="card-title text-[14px] border-b border-ink-150 pb-2">GRN Invoice Summary</h3>
            <div className="space-y-2 text-[13px]">
              <div className="flex justify-between text-ink-600">
                <span>Gross Amount</span>
                <span className="num font-medium text-ink-900">{formatINR(totals.gross)}</span>
              </div>
              <div className="flex justify-between text-brand-700">
                <span>Total Discount</span>
                <span className="num font-medium">- {formatINR(totals.disc)}</span>
              </div>
              <div className="flex justify-between text-ink-600">
                <span>Input GST</span>
                <span className="num font-medium text-ink-900">+ {formatINR(totals.tax)}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-ink-900 pt-3 border-t border-ink-200">
                <span>Total Payable</span>
                <span className="text-xl font-black text-brand-700 num">{formatINR(totals.net)}</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={isPending || items.length === 0}
              className="btn btn-primary w-full !py-3 !text-[14px] font-bold shadow-md shadow-brand-600/20 mt-4"
            >
              <Save className="h-4 w-4 mr-2" />
              {isPending ? "Posting GRN & Ledger..." : "Post Purchase Invoice"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default function NewPurchasePage() {
  return (
    <Suspense fallback={<div className="page p-8 text-center text-xs text-ink-500">Loading purchase form...</div>}>
      <NewPurchaseForm />
    </Suspense>
  );
}
