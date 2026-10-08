"use client";

import { useActionState, useEffect, useState } from "react";
import { createPurchaseInvoice, PurchaseItemInput } from "@/app/actions/purchases";
import { getSuppliers } from "@/app/actions/suppliers";
import { getMedicines } from "@/app/actions/inventory";
import { ArrowLeft, Save, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/app/components/ui";

export default function NewPurchasePage() {
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [medicines, setMedicines] = useState<{ id: string; name: string; gstRateBp: number }[]>([]);
  
  const [supplierId, setSupplierId] = useState("");
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  
  const [items, setItems] = useState<PurchaseItemInput[]>([]);

  useEffect(() => {
    getSuppliers().then(setSuppliers);
    getMedicines().then((data) => {
      setMedicines(data.map(m => ({
        id: m.medicine.id,
        name: m.medicine.name,
        gstRateBp: m.medicine.gstRateBp,
      })));
    });
  }, []);

  const [state, formAction, isPending] = useActionState(async (prevState: { error?: string; success?: boolean } | null, formData: FormData) => {
    const res = await createPurchaseInvoice(supplierId, supplierInvoiceNo, invoiceDate, items);
    if (res.success) redirect("/dashboard/purchases");
    return res;
  }, null);

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
        gstRateBp: 1200,
      }
    ]);
  };

  const updateItem = <K extends keyof PurchaseItemInput>(index: number, field: K, value: PurchaseItemInput[K]) => {
    const newItems = [...items];
    newItems[index][field] = value;

    if (field === "medicineId") {
      const med = medicines.find(m => m.id === value);
      if (med) newItems[index].gstRateBp = med.gstRateBp;
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
    
    items.forEach(item => {
      const g = item.qty * item.rate;
      const d = (g * item.discountBp) / 10000;
      const t = ((g - d) * item.gstRateBp) / 10000;
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
        title="New Purchase Invoice (GRN)" 
        description="Receive stock from suppliers and update accounts payable." 
        backHref="/dashboard/purchases" 
      />

      <form action={formAction} className="space-y-6">
        {state?.error && (
          <div className="p-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl">
            {state.error}
          </div>
        )}
        
        {/* Header Section */}
        <div className="card">
          <div className="card-body">
            <h3 className="card-title mb-4">Invoice Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="label">Supplier *</label>
              <select
                required
                value={supplierId}
                onChange={e => setSupplierId(e.target.value)}
                className="input"
              >
                <option value="">Select Supplier...</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Supplier Invoice No *</label>
              <input
                type="text"
                required
                value={supplierInvoiceNo}
                onChange={e => setSupplierInvoiceNo(e.target.value)}
                className="input"
                placeholder="INV-2023-001"
              />
            </div>
            <div>
              <label className="label">Invoice Date *</label>
              <input
                type="date"
                required
                value={invoiceDate}
                onChange={e => setInvoiceDate(e.target.value)}
                className="input"
              />
            </div>
          </div>
        </div>
        </div>

        {/* Items Section */}
        <div className="card overflow-hidden">
          <div className="card-body !p-0">
            <div className="flex justify-between items-center p-5 border-b border-ink-150">
              <h3 className="card-title">Line Items</h3>
            <button
              type="button"
              onClick={handleAddItem}
              className="flex items-center text-sm font-medium text-brand-600 bg-brand-50 hover:bg-brand-100 px-3 py-1.5 rounded-lg transition-colors"
            >
              <Plus className="h-4 w-4 mr-1" /> Add Item
            </button>
          </div>
          
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Medicine</th>
                  <th>Batch No</th>
                  <th>Expiry</th>
                  <th>Qty</th>
                  <th>Free</th>
                  <th>Rate (₹)</th>
                  <th>MRP (₹)</th>
                  <th>Disc %</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                      No items added to this invoice.
                    </td>
                  </tr>
                ) : items.map((item, index) => (
                  <tr key={index}>
                    <td className="px-2 py-2">
                      <select
                        required
                        value={item.medicineId}
                        onChange={e => updateItem(index, "medicineId", e.target.value)}
                        className="w-48 px-2 py-1.5 rounded border border-slate-200"
                      >
                        <option value="">Select...</option>
                        {medicines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <input type="text" required value={item.batchNo} onChange={e => updateItem(index, "batchNo", e.target.value.toUpperCase())} className="w-24 px-2 py-1.5 rounded border border-slate-200 uppercase" placeholder="B123" />
                    </td>
                    <td className="px-2 py-2">
                      <input type="date" required value={item.expiryDate} onChange={e => updateItem(index, "expiryDate", e.target.value)} className="w-32 px-2 py-1.5 rounded border border-slate-200" />
                    </td>
                    <td className="px-2 py-2">
                      <input type="number" required min="1" value={item.qty || ""} onChange={e => updateItem(index, "qty", parseInt(e.target.value) || 0)} className="w-16 px-2 py-1.5 rounded border border-slate-200" />
                    </td>
                    <td className="px-2 py-2">
                      <input type="number" min="0" value={item.freeQty || ""} onChange={e => updateItem(index, "freeQty", parseInt(e.target.value) || 0)} className="w-16 px-2 py-1.5 rounded border border-slate-200" />
                    </td>
                    <td className="px-2 py-2">
                      <input type="number" step="0.01" required value={item.rate ? item.rate / 100 : ""} onChange={e => updateItem(index, "rate", Math.round(parseFloat(e.target.value) * 100) || 0)} className="w-24 px-2 py-1.5 rounded border border-slate-200" />
                    </td>
                    <td className="px-2 py-2">
                      <input type="number" step="0.01" required value={item.mrp ? item.mrp / 100 : ""} onChange={e => updateItem(index, "mrp", Math.round(parseFloat(e.target.value) * 100) || 0)} className="w-24 px-2 py-1.5 rounded border border-slate-200" />
                    </td>
                    <td className="px-2 py-2">
                      <input type="number" step="0.01" value={item.discountBp ? item.discountBp / 100 : ""} onChange={e => updateItem(index, "discountBp", Math.round(parseFloat(e.target.value) * 100) || 0)} className="w-16 px-2 py-1.5 rounded border border-slate-200" />
                    </td>
                    <td className="px-2 py-2 text-right">
                      <button type="button" onClick={() => removeItem(index)} className="text-red-500 hover:text-red-700 p-1">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </div>
        </div>

        {/* Totals Section */}
        <div className="flex justify-end">
          <div className="card w-full md:w-80">
            <div className="card-body">
              <h3 className="card-title mb-4 pb-2 border-b border-ink-150">Invoice Summary</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Gross Amount</span>
                <span>₹{(totals.gross / 100).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-brand-600">
                <span>Total Discount</span>
                <span>- ₹{(totals.disc / 100).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Tax Amount (GST)</span>
                <span>+ ₹{(totals.tax / 100).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-lg font-bold text-slate-900 pt-3 border-t border-slate-100">
                <span>Net Payable</span>
                <span>₹{(totals.net / 100).toFixed(2)}</span>
              </div>
            </div>
            
            <button
              type="submit"
              disabled={isPending || items.length === 0}
              className="btn btn-primary w-full mt-6 btn-lg"
            >
              <Save className="h-5 w-5 mr-2" />
              {isPending ? "Posting GRN..." : "Post Purchase Invoice"}
            </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
