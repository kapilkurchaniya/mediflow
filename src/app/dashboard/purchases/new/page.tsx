"use client";

import { useActionState, useEffect, useState } from "react";
import { createPurchaseInvoice, PurchaseItemInput } from "@/app/actions/purchases";
import { getSuppliers } from "@/app/actions/suppliers";
import { getMedicines } from "@/app/actions/inventory";
import { Save, Plus, Trash2, FileText, Truck, AlertCircle } from "lucide-react";
import { redirect } from "next/navigation";
import { PageHeader } from "@/app/components/ui";
import { formatINR } from "@/lib/format";

import { DEFAULT_GST_RATE_BP, isValidGstRateBp } from "@/lib/regulatory";

export default function NewPurchasePage() {
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [medicines, setMedicines] = useState<{ id: string; name: string; gstRateBp: number }[]>([]);

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
  }, []);

  const [state, formAction, isPending] = useActionState(
    async (_prevState: { error?: string; success?: boolean } | null, _formData: FormData) => {
      if (!supplierId) return { error: "Please select a supplier." };
      if (!supplierInvoiceNo.trim()) return { error: "Supplier invoice number is required." };
      if (items.length === 0) return { error: "Please add at least one line item." };

      const res = await createPurchaseInvoice(supplierId, supplierInvoiceNo.trim(), invoiceDate, items);
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

    if (field === "medicineId") {
      const med = medicines.find((m) => m.id === value);
      if (med && isValidGstRateBp(med.gstRateBp)) newItems[index].gstRateBp = med.gstRateBp;
    }

    // Default saleRate to mrp if not set
    if (field === "mrp" && !newItems[index].saleRate) {
      newItems[index].saleRate = value as number;
    }

    setItems(newItems);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const calculateTotals = () => {
    let gross = 0;
    let disc = 0;
    let tax = 0;

    items.forEach((item) => {
      const g = item.qty * item.rate;
      const d = Math.round((g * item.discountBp) / 10000);
      const t = Math.round(((g - d) * item.gstRateBp) / 10000);
      gross += g;
      disc += d;
      tax += t;
    });

    return { gross, disc, tax, net: gross - disc + tax };
  };

  const totals = calculateTotals();

  return (
    <div className="page mx-auto max-w-6xl space-y-6 pb-20">
      <PageHeader
        title="Record Purchase Invoice (GRN)"
        description="Receive stock from distributors, increment batch inventory, and post to General Ledger."
        backHref="/dashboard/purchases"
      />

      <form action={formAction} className="space-y-6">
        {state?.error && (
          <div className="p-3 text-[13px] text-red-700 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
            <span>{state.error}</span>
          </div>
        )}

        {/* Invoice Metadata Header Card */}
        <div className="card p-5 shadow-xs">
          <h3 className="card-title text-[14px] flex items-center gap-2 border-b border-ink-150 pb-2 mb-4">
            <Truck className="h-4 w-4 text-brand-600" />
            Supplier & Invoice Details
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="label text-[12.5px]">Supplier / Distributor *</label>
              <select
                required
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="select"
              >
                <option value="">Select supplier...</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label text-[12.5px]">Supplier Bill / Invoice No *</label>
              <input
                type="text"
                required
                value={supplierInvoiceNo}
                onChange={(e) => setSupplierInvoiceNo(e.target.value)}
                className="input font-mono uppercase"
                placeholder="e.g. INV-2024-9841"
              />
            </div>

            <div>
              <label className="label text-[12.5px]">Invoice Date *</label>
              <input
                type="date"
                required
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="input"
              />
            </div>
          </div>
        </div>

        {/* Line Items Table Card */}
        <div className="card overflow-hidden shadow-xs">
          <div className="p-4 border-b border-ink-150 bg-ink-50/60 flex justify-between items-center">
            <h3 className="card-title text-[14px] flex items-center gap-2">
              <FileText className="h-4 w-4 text-brand-600" />
              Goods Received Items ({items.length})
            </h3>
            <button
              type="button"
              onClick={handleAddItem}
              className="btn btn-primary btn-sm"
            >
              <Plus className="h-4 w-4 mr-1" /> Add Line Item
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="min-w-[200px]">Medicine</th>
                  <th className="w-28">Batch No</th>
                  <th className="w-36">Expiry</th>
                  <th className="w-20 text-center">Qty</th>
                  <th className="w-20 text-center">Free</th>
                  <th className="w-28 text-right">Purchase Rate (₹)</th>
                  <th className="w-28 text-right">MRP (₹)</th>
                  <th className="w-20 text-center">Disc %</th>
                  <th className="w-28 text-right">Net Line (₹)</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-12 text-center text-ink-400">
                      <p className="text-[13.5px] font-medium text-ink-600">No line items added yet</p>
                      <p className="text-[12px] text-ink-400 mt-1">
                        Click &ldquo;Add Line Item&rdquo; above to record medicines received on this supplier invoice.
                      </p>
                    </td>
                  </tr>
                ) : (
                  items.map((item, index) => {
                    const lineGross = item.qty * item.rate;
                    const lineDisc = Math.round((lineGross * item.discountBp) / 10000);
                    const lineTax = Math.round(((lineGross - lineDisc) * item.gstRateBp) / 10000);
                    const lineTotal = lineGross - lineDisc + lineTax;

                    return (
                      <tr key={index} className="hover:bg-ink-50/50">
                        <td>
                          <select
                            required
                            value={item.medicineId}
                            onChange={(e) => updateItem(index, "medicineId", e.target.value)}
                            className="select !h-8.5 text-[12.5px]"
                          >
                            <option value="">Select medicine...</option>
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
                            required
                            value={item.batchNo}
                            onChange={(e) => updateItem(index, "batchNo", e.target.value.toUpperCase())}
                            className="input !h-8.5 font-mono uppercase text-[12px]"
                            placeholder="LOT101"
                          />
                        </td>
                        <td>
                          <input
                            type="date"
                            required
                            value={item.expiryDate}
                            onChange={(e) => updateItem(index, "expiryDate", e.target.value)}
                            className="input !h-8.5 text-[12px]"
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            required
                            min="1"
                            value={item.qty || ""}
                            onChange={(e) => updateItem(index, "qty", parseInt(e.target.value) || 0)}
                            className="input !h-8.5 text-center font-bold num text-[12.5px]"
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            value={item.freeQty || ""}
                            placeholder="0"
                            onChange={(e) => updateItem(index, "freeQty", parseInt(e.target.value) || 0)}
                            className="input !h-8.5 text-center num text-[12.5px]"
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="0.01"
                            required
                            value={item.rate ? item.rate / 100 : ""}
                            onChange={(e) =>
                              updateItem(index, "rate", Math.round(parseFloat(e.target.value) * 100) || 0)
                            }
                            className="input !h-8.5 text-right font-medium num text-[12.5px]"
                            placeholder="0.00"
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="0.01"
                            required
                            value={item.mrp ? item.mrp / 100 : ""}
                            onChange={(e) =>
                              updateItem(index, "mrp", Math.round(parseFloat(e.target.value) * 100) || 0)
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
