"use client";

import { useActionState, useEffect, useState, Suspense } from "react";
import { useSearchParams, redirect } from "next/navigation";
import Link from "next/link";
import { createPurchaseInvoice, PurchaseItemInput } from "@/app/actions/purchases";
import { getSuppliers } from "@/app/actions/suppliers";
import { getMedicines } from "@/app/actions/inventory";
import { getPurchaseOrder } from "@/app/actions/purchase-orders";
import { Save, Plus, Trash2, FileText, Truck, AlertCircle, ClipboardList, Layers, FileSpreadsheet } from "lucide-react";
import { PageHeader } from "@/app/components/ui";
import { formatINR } from "@/lib/format";
import { computePurchaseTotals } from "@/lib/money";
import { DEFAULT_GST_RATE_BP, isValidGstRateBp, type GstRateBp } from "@/lib/regulatory";
import { ImportDistributorBillModal } from "./ImportDistributorBillModal";

function NewPurchaseForm() {
  const searchParams = useSearchParams();
  const poId = searchParams.get("poId");

  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [medicines, setMedicines] = useState<{
    id: string;
    name: string;
    gstRateBp: number;
    unitsPerPack: number;
    packUnit: string;
    looseUnit: string;
  }[]>([]);
  const [linkedPo, setLinkedPo] = useState<{ id: string; poNo: string } | null>(null);

  const [supplierId, setSupplierId] = useState("");
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split("T")[0]);

  const [items, setItems] = useState<PurchaseItemInput[]>([]);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  useEffect(() => {
    getSuppliers().then(setSuppliers);
    getMedicines("", 500).then((data) => {
      setMedicines(
        data.map((m) => ({
          id: m.medicine.id,
          name: m.medicine.name,
          gstRateBp: m.medicine.gstRateBp,
          unitsPerPack: m.medicine.unitsPerPack ?? 1,
          packUnit: m.medicine.packUnit ?? "strip",
          looseUnit: m.medicine.looseUnit ?? "tablet",
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
                tradeDiscountBp: 0,
                cashDiscountBp: 0,
                unitsPerPack: 1,
                packUnit: "strip",
                looseUnit: "tablet",
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
        tradeDiscountBp: 0,
        cashDiscountBp: 0,
        unitsPerPack: 1,
        packUnit: "strip",
        looseUnit: "tablet",
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

  const totals = computePurchaseTotals(
    items.map((item) => ({
      qty: item.qty,
      freeQty: item.freeQty || 0,
      rate: item.rate,
      tradeDiscountBp: item.tradeDiscountBp ?? item.discountBp ?? 0,
      cashDiscountBp: item.cashDiscountBp ?? 0,
      unitsPerPack: item.unitsPerPack ?? 1,
      gstRateBp: item.gstRateBp,
    }))
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
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsImportModalOpen(true)}
                className="btn btn-secondary text-xs flex items-center gap-1.5 border-brand-300 dark:border-brand-700 text-brand-700 dark:text-brand-300 hover:bg-brand-50/50"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" />
                Import Bill (CSV / PDF / Photo OCR)
              </button>
              <button
                type="button"
                onClick={handleAddItem}
                className="btn btn-secondary text-xs"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Row
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="data-table text-[12px] w-full">
              <thead>
                <tr>
                  <th className="w-56">Medicine & Packaging</th>
                  <th className="w-28">Batch No</th>
                  <th className="w-28">Expiry</th>
                  <th className="w-18 text-center">Billed (Pk)</th>
                  <th className="w-18 text-center">Free (Scheme)</th>
                  <th className="w-24 text-right">Cost/Pk (₹)</th>
                  <th className="w-16 text-center">TD %</th>
                  <th className="w-18 text-center">GST %</th>
                  <th className="w-16 text-center">CD %</th>
                  <th className="w-24 text-right">MRP/Pk (₹)</th>
                  <th className="w-28 text-right">Landed Cost</th>
                  <th className="w-24 text-right">Payable</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="text-center py-8 text-ink-400">
                      No line items yet. Click &ldquo;Add Row&rdquo; to start recording received batches.
                    </td>
                  </tr>
                ) : (
                  items.map((item, index) => {
                    const lineRes = totals.lines[index];
                    const upp = Math.max(1, item.unitsPerPack ?? 1);

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
                                updateItem(index, "unitsPerPack", med.unitsPerPack || 1);
                                updateItem(index, "packUnit", med.packUnit || "strip");
                                updateItem(index, "looseUnit", med.looseUnit || "tablet");
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
                          {upp > 1 && (
                            <div className="flex items-center gap-1 mt-1 text-[11px] text-brand-700 font-medium">
                              <Layers className="w-3 h-3" />
                              <span>
                                1 {item.packUnit || "strip"} = {upp} {item.looseUnit || "tablet"}s
                              </span>
                            </div>
                          )}
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
                          {(item.freeQty || 0) > 0 && (
                            <span className="badge badge-success text-[10px] mt-0.5 font-mono whitespace-nowrap block text-center">
                              {item.qty}+{item.freeQty} Free
                            </span>
                          )}
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
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            max="100"
                            value={item.tradeDiscountBp !== undefined ? item.tradeDiscountBp / 100 : item.discountBp ? item.discountBp / 100 : ""}
                            onChange={(e) => {
                              const bp = Math.round(parseFloat(e.target.value) * 100) || 0;
                              updateItem(index, "tradeDiscountBp", bp);
                              updateItem(index, "discountBp", bp);
                            }}
                            className="input !h-8.5 text-center num text-[12px]"
                            placeholder="0"
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
                            step="0.1"
                            min="0"
                            max="100"
                            value={item.cashDiscountBp ? item.cashDiscountBp / 100 : ""}
                            onChange={(e) => {
                              const bp = Math.round(parseFloat(e.target.value) * 100) || 0;
                              updateItem(index, "cashDiscountBp", bp);
                            }}
                            className="input !h-8.5 text-center num text-[12px]"
                            placeholder="0"
                          />
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
                        <td className="text-right text-[11.5px] leading-snug">
                          <div className="font-semibold text-ink-900 num">
                            {formatINR(lineRes.landedPackCost)}
                            <span className="text-[10px] text-ink-500 font-normal">/{item.packUnit || "pk"}</span>
                          </div>
                          {upp > 1 && (
                            <div className="text-brand-700 font-medium num text-[10.5px]">
                              {formatINR(lineRes.landedUnitCost)}
                              <span className="text-[9.5px] text-ink-400">/{item.looseUnit || "unit"}</span>
                            </div>
                          )}
                        </td>
                        <td className="text-right font-bold num text-ink-900 text-[13px]">
                          {formatINR(lineRes.total)}
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
              {totals.tradeDiscount > 0 && (
                <div className="flex justify-between text-brand-700">
                  <span>Trade Discount (TD)</span>
                  <span className="num font-medium">- {formatINR(totals.tradeDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between text-ink-600 font-medium pt-1 border-t border-ink-150">
                <span>Taxable Amount</span>
                <span className="num font-semibold text-ink-900">{formatINR(totals.taxable)}</span>
              </div>
              <div className="flex justify-between text-ink-600">
                <span>Input GST</span>
                <span className="num font-medium text-ink-900">+ {formatINR(totals.tax)}</span>
              </div>
              {totals.cashDiscount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Cash Discount (CD)</span>
                  <span className="num font-medium">- {formatINR(totals.cashDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold text-ink-900 pt-3 border-t border-ink-200">
                <span>Total Payable</span>
                <span className="text-xl font-black text-brand-700 num">{formatINR(totals.total)}</span>
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

      <ImportDistributorBillModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        selectedSupplierId={supplierId}
        onSelectSupplier={(id) => setSupplierId(id)}
        onFillHeader={(hdr) => {
          if (hdr.invoiceNo && !supplierInvoiceNo.trim()) setSupplierInvoiceNo(hdr.invoiceNo);
          if (hdr.invoiceDate) setInvoiceDate(hdr.invoiceDate);
        }}
        onCatalogRefresh={async () => {
          const data = await getMedicines("", 500);
          setMedicines(
            data.map((m) => ({
              id: m.medicine.id,
              name: m.medicine.name,
              gstRateBp: m.medicine.gstRateBp,
              unitsPerPack: m.medicine.unitsPerPack ?? 1,
              packUnit: m.medicine.packUnit ?? "strip",
              looseUnit: m.medicine.looseUnit ?? "tablet",
            }))
          );
        }}
        onImport={(importedItems) => {
          setItems(importedItems);
        }}
      />
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
